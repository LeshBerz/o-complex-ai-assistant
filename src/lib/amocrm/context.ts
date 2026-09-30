/**
 * Данные amoCRM → запрос к ядру (dialog_history + customer_context по контракту).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AssistRequestInput, CustomerContext, DialogTurn } from "@/lib/contracts";
import type { AmoClient } from "./client";
import type { StoredMessage } from "./messages";
import type { Contact, CustomFieldValue, Lead, Note } from "./types";

/** Сколько последних реплик отдавать ядру */
const HISTORY_LIMIT = 20;

/** Маркер наших примечаний: их не надо принимать за переписку */
export const BOT_NOTE_PREFIX = "🤖";

const toIso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

/**
 * Реплики из примечаний сделки. Берём только SMS (sms_in → клиент, sms_out → менеджер):
 * обычные примечания common — внутренние комментарии сотрудников, а не диалог с клиентом.
 */
const SMS_ROLES: Record<string, DialogTurn["role"]> = { sms_in: "client", sms_out: "manager" };

export function notesToTurns(notes: Note[]): (DialogTurn & { at: number })[] {
  return notes.flatMap((n) => {
    const text = n.params?.text?.trim();
    const role = SMS_ROLES[n.note_type];
    if (!role || !text || text.startsWith(BOT_NOTE_PREFIX)) return [];
    return [{ role, text, ts: toIso(n.created_at), at: n.created_at }];
  });
}

export function buildDialogHistory(messages: StoredMessage[], notes: Note[]): DialogTurn[] {
  const turns = [
    ...messages.map((m) => ({ role: m.role, text: m.text, ts: toIso(m.created_at), at: m.created_at })),
    ...notesToTurns(notes),
  ];
  return turns
    .sort((a, b) => a.at - b.at)
    .slice(-HISTORY_LIMIT)
    .map(({ role, text, ts }) => ({ role, text, ts }));
}

// ---------- customer_context ----------

let knownProductIds: Promise<Set<string> | null> | undefined;

/** id товаров из data/kb/products.json (файл ведёт kb-builder); null — если прочитать не удалось */
function loadKnownProductIds(): Promise<Set<string> | null> {
  knownProductIds ??= readFile(path.join(process.cwd(), "data", "kb", "products.json"), "utf8")
    .then((raw) => {
      const list = JSON.parse(raw) as { id?: unknown }[];
      return new Set(list.map((p) => p.id).filter((id): id is string => typeof id === "string"));
    })
    .catch(() => null);
  return knownProductIds;
}

/**
 * Купленные товары — из доп. поля контакта (AMOCRM_PURCHASES_FIELD_ID). Это наша договорённость
 * для демо, а не стандартное поле amoCRM: значения — id товаров из базы знаний через запятую
 * или по одному в значении поля.
 */
export async function extractPastPurchases(
  fields: CustomFieldValue[] | null | undefined,
  fieldId: number | null,
): Promise<string[]> {
  if (!fields || fieldId === null) return [];
  const field = fields.find((f) => f.field_id === fieldId);
  if (!field) return [];

  const ids = field.values
    .flatMap((v) => (typeof v.value === "string" ? v.value.split(/[,;\n]/) : []))
    .map((s) => s.trim())
    .filter(Boolean);

  const known = await loadKnownProductIds();
  if (!known) return [...new Set(ids)];
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) console.warn(`[amocrm] товары не из базы знаний, пропущены: ${unknown.join(", ")}`);
  return [...new Set(ids.filter((id) => known.has(id)))];
}

function contactName(contact: Contact | null): string | undefined {
  return contact?.first_name?.trim() || contact?.name?.trim() || undefined;
}

export async function buildCustomerContext(
  client: AmoClient,
  lead: Lead,
  contact: Contact | null,
  purchasesFieldId: number | null,
): Promise<CustomerContext> {
  let dealStatus = String(lead.status_id);
  try {
    dealStatus = (await client.getPipelineStatus(lead.pipeline_id, lead.status_id)).name;
  } catch (err) {
    console.warn(`[amocrm] не удалось получить название этапа ${lead.status_id}:`, (err as Error).message);
  }

  return {
    name: contactName(contact),
    past_purchases: await extractPastPurchases(contact?.custom_fields_values, purchasesFieldId),
    deal_status: dealStatus,
  };
}

export async function loadMainContact(client: AmoClient, lead: Lead): Promise<Contact | null> {
  const contacts = lead._embedded?.contacts ?? [];
  const main = contacts.find((c) => c.is_main) ?? contacts[0];
  if (!main) return null;
  try {
    return await client.getContact(main.id);
  } catch (err) {
    console.warn(`[amocrm] не удалось получить контакт ${main.id}:`, (err as Error).message);
    return null;
  }
}

export function toAssistRequest(
  clientMessage: string,
  history: DialogTurn[],
  customer: CustomerContext,
): AssistRequestInput {
  return { client_message: clientMessage, dialog_history: history, customer_context: customer };
}
