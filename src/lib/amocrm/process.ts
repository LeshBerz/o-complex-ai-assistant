/**
 * Обработка вебхука: событие amoCRM → контекст сделки → ядро assist() → примечание в сделку.
 * Вызывается из route handler после ответа 200 (через after()).
 */
import { assist } from "@/lib/assist";
import { AssistRequestSchema } from "@/lib/contracts";
import { createAmoClient, type AmoClient } from "./client";
import { getAmoConfig, type AmoConfig } from "./config";
import {
  BOT_NOTE_PREFIX,
  buildCustomerContext,
  buildDialogHistory,
  loadMainContact,
  toAssistRequest,
} from "./context";
import { appendMessage, listLeadMessages } from "./messages";
import { formatAssistNote } from "./note";
import type { IncomingMessage, LeadEvent, OutgoingMessage, WebhookPayload } from "./webhook";

export type ProcessOutcome =
  | { kind: "note_added"; leadId: number; noteId: number | null }
  | { kind: "stored"; leadId: number }
  | { kind: "skipped"; reason: string };

/** Уже обработанные id сообщений (защита от повторной доставки вебхука в рамках процесса) */
const seen: Set<string> = ((globalThis as { __amoSeenMessages?: Set<string> }).__amoSeenMessages ??=
  new Set<string>());

/**
 * Сообщения, по которым примечание уже добавлено. Смена этапа сразу после сообщения
 * не должна тратить второй запрос к модели на ту же реплику.
 */
const suggested: Set<string> = ((globalThis as { __amoSuggestedMessages?: Set<string> }).__amoSuggestedMessages ??=
  new Set<string>());

/**
 * Модель не ответила (лимит, таймаут): amoCRM уже получил 200 и повторять не будет,
 * поэтому оставляем менеджеру примечание, чтобы обращение не потерялось молча.
 */
async function addFailureNote(client: AmoClient, leadId: number, err: unknown): Promise<void> {
  const reason = err instanceof Error ? err.message : String(err);
  try {
    await client.addNote(leadId, {
      note_type: "common",
      params: {
        text: `${BOT_NOTE_PREFIX} Подсказку подготовить не удалось (${reason.slice(0, 200)}). Ответьте клиенту вручную.`,
      },
    });
  } catch (noteErr) {
    console.error(`[amocrm] сделка ${leadId}: не удалось добавить и примечание об ошибке:`, noteErr);
  }
}

/**
 * Сделка по сообщению: через беседу (GET /api/v4/talks/{id} → entity_type/entity_id — по документации).
 * Запасной путь element_type=2 → element_id — ПРЕДПОЛОЖЕНИЕ (в документации к вебхуку типы не расписаны;
 * 2 = сделка по старой нумерации типов сущностей amoCRM).
 */
async function resolveLeadId(
  client: AmoClient,
  msg: Pick<IncomingMessage, "talk_id" | "element_id" | "element_type">,
): Promise<number | null> {
  if (msg.talk_id) {
    try {
      const talk = await client.getTalk(msg.talk_id);
      if (talk.entity_type === "lead" && talk.entity_id) return talk.entity_id;
    } catch (err) {
      console.warn(`[amocrm] беседа ${msg.talk_id} не получена:`, (err as Error).message);
    }
  }
  if (msg.element_type === "2" && msg.element_id) return msg.element_id;
  return null;
}

async function suggestForLead(
  client: AmoClient,
  config: AmoConfig,
  leadId: number,
  clientMessage: string,
  excludeMessageId?: string,
): Promise<ProcessOutcome> {
  const lead = await client.getLead(leadId);
  const [contact, notes, stored] = await Promise.all([
    loadMainContact(client, lead),
    client.getLeadNotes(leadId),
    listLeadMessages(leadId, { includeMockSeed: config.mode === "mock" }),
  ]);

  const history = buildDialogHistory(
    stored.filter((m) => m.message_id !== excludeMessageId),
    notes,
  );
  const customer = await buildCustomerContext(client, lead, contact, config.purchasesFieldId);
  const request = AssistRequestSchema.parse(toAssistRequest(clientMessage, history, customer));

  let result;
  try {
    result = await assist(request);
  } catch (err) {
    await addFailureNote(client, leadId, err);
    throw err;
  }
  const note = await client.addNote(leadId, {
    note_type: "common",
    params: { text: formatAssistNote(result) },
  });
  console.log(
    `[amocrm] сделка ${leadId}: примечание добавлено (${note.mode}), ` +
      `intent=${result.response.intent}, needs_human=${result.response.needs_human}, ` +
      `tokens=${result.meta.usage.inputTokens}/${result.meta.usage.outputTokens}, ${result.meta.latency_ms} мс`,
  );
  if (excludeMessageId) suggested.add(excludeMessageId);
  return { kind: "note_added", leadId, noteId: note.id };
}

async function onIncomingMessage(
  client: AmoClient,
  config: AmoConfig,
  msg: IncomingMessage,
): Promise<ProcessOutcome> {
  const text = msg.text.trim();
  if (!text) return { kind: "skipped", reason: `сообщение ${msg.id} без текста (${msg.message_type ?? "?"})` };
  if (seen.has(msg.id)) return { kind: "skipped", reason: `сообщение ${msg.id} уже обработано` };
  seen.add(msg.id);

  const leadId = await resolveLeadId(client, msg);
  if (!leadId) return { kind: "skipped", reason: `сообщение ${msg.id}: сделка не найдена` };

  const createdAt = msg.created_at ?? Math.floor(Date.now() / 1000);
  // Сначала сохраняем сообщение в историю: если модель упадёт, оно не потеряется для следующих подсказок.
  // В контекст текущей подсказки оно не попадёт дважды: suggestForLead исключает его по id.
  await appendMessage({ lead_id: leadId, message_id: msg.id, role: "client", text, created_at: createdAt });
  return suggestForLead(client, config, leadId, text, msg.id);
}

async function onOutgoingMessage(client: AmoClient, msg: OutgoingMessage): Promise<ProcessOutcome> {
  const text = msg.text.trim();
  if (!text) return { kind: "skipped", reason: `исходящее ${msg.id} без текста` };
  const leadId = await resolveLeadId(client, { talk_id: msg.talk_id });
  if (!leadId) return { kind: "skipped", reason: `исходящее ${msg.id}: сделка не найдена` };
  await appendMessage({
    lead_id: leadId,
    message_id: msg.id,
    role: "manager",
    text,
    created_at: msg.created_at ?? Math.floor(Date.now() / 1000),
  });
  return { kind: "stored", leadId };
}

/**
 * Создание сделки / смена этапа: подсказка по последнему сообщению клиента из истории.
 * Если клиент ещё ничего не писал — отвечать не на что, пропускаем.
 */
async function onLeadEvent(client: AmoClient, config: AmoConfig, evt: LeadEvent): Promise<ProcessOutcome> {
  const stored = await listLeadMessages(evt.id, { includeMockSeed: config.mode === "mock" });
  const lastClient = stored.findLast((m) => m.role === "client");
  if (!lastClient) return { kind: "skipped", reason: `сделка ${evt.id}: нет сообщений клиента` };
  if (suggested.has(lastClient.message_id)) {
    return { kind: "skipped", reason: `сделка ${evt.id}: подсказка на сообщение ${lastClient.message_id} уже есть` };
  }
  return suggestForLead(client, config, evt.id, lastClient.text, lastClient.message_id);
}

export async function processWebhook(payload: WebhookPayload): Promise<ProcessOutcome[]> {
  const config = getAmoConfig();
  const client = createAmoClient(config);

  const jobs: (() => Promise<ProcessOutcome>)[] = [
    ...(payload.outgoing_message?.add ?? []).map((m) => () => onOutgoingMessage(client, m)),
    ...(payload.message?.add ?? []).map((m) => () => onIncomingMessage(client, config, m)),
    ...[...(payload.leads?.add ?? []), ...(payload.leads?.status ?? [])].map(
      (e) => () => onLeadEvent(client, config, e),
    ),
  ];

  // Последовательно: не упираться в лимит 7 запросов/с и не путать порядок истории
  const outcomes: ProcessOutcome[] = [];
  for (const job of jobs) {
    try {
      outcomes.push(await job());
    } catch (err) {
      console.error("[amocrm] ошибка обработки события:", err);
      outcomes.push({ kind: "skipped", reason: (err as Error).message });
    }
  }
  for (const o of outcomes) if (o.kind === "skipped") console.log(`[amocrm] пропущено: ${o.reason}`);
  return outcomes;
}
