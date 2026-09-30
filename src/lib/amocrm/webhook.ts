/**
 * Разбор вебхука amoCRM.
 *
 * amoCRM шлёт вебхуки как application/x-www-form-urlencoded с ключами вида
 * `leads[status][0][id]=123` (документация: crm_platform/webhooks-format). Здесь ключи
 * разворачиваются во вложенный объект, объекты с ключами "0","1",... становятся массивами,
 * затем результат валидируется zod-схемой.
 */
import { z } from "zod";

type Nested = { [key: string]: Nested | string };

/** `a[b][0][c]` → ["a", "b", "0", "c"] */
function splitKey(key: string): string[] {
  const first = key.indexOf("[");
  if (first === -1) return [key];
  const parts = [key.slice(0, first)];
  for (const m of key.slice(first).matchAll(/\[([^\]]*)\]/g)) parts.push(m[1]);
  return parts;
}

function toArrays(node: Nested | string): unknown {
  if (typeof node === "string") return node;
  const keys = Object.keys(node);
  const converted = Object.fromEntries(keys.map((k) => [k, toArrays(node[k])]));
  const isList = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
  return isList
    ? keys.sort((a, b) => Number(a) - Number(b)).map((k) => converted[k])
    : converted;
}

export function parseBracketForm(params: URLSearchParams): unknown {
  const root: Nested = {};
  for (const [rawKey, value] of params) {
    const parts = splitKey(rawKey);
    let node = root;
    parts.forEach((part, i) => {
      if (part === "__proto__" || part === "constructor" || part === "prototype") return;
      if (i === parts.length - 1) {
        node[part] = value;
        return;
      }
      const next = node[part];
      if (typeof next !== "object") node[part] = {};
      node = node[part] as Nested;
    });
  }
  return toArrays(root);
}

// ---------- Схемы событий (поля — по примерам из документации) ----------

/** message[add][N] — входящее сообщение клиента (событие add_message) */
export const IncomingMessageSchema = z.looseObject({
  id: z.string().min(1),
  chat_id: z.string().optional(),
  talk_id: z.coerce.number().int().positive().optional(),
  contact_id: z.coerce.number().int().positive().optional(),
  text: z.string().default(""),
  created_at: z.coerce.number().int().optional(),
  message_type: z.string().optional(),
  author: z.looseObject({ type: z.string().optional(), name: z.string().optional() }).optional(),
  element_id: z.coerce.number().int().positive().optional(),
  element_type: z.string().optional(),
});
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

/** outgoing_message[add][N] — сообщение менеджера клиенту (событие add_outgoing_message) */
export const OutgoingMessageSchema = z.looseObject({
  id: z.string().min(1),
  talk_id: z.coerce.number().int().positive().optional(),
  contact_id: z.coerce.number().int().positive().optional(),
  text: z.string().default(""),
  created_at: z.coerce.number().int().optional(),
});
export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;

/** leads[status|add][N] — сделка создана или сменила этап */
export const LeadEventSchema = z.looseObject({
  id: z.coerce.number().int().positive(),
  status_id: z.coerce.number().int().optional(),
  old_status_id: z.coerce.number().int().optional(),
  pipeline_id: z.coerce.number().int().optional(),
});
export type LeadEvent = z.infer<typeof LeadEventSchema>;

export const WebhookPayloadSchema = z.looseObject({
  leads: z
    .looseObject({
      add: z.array(LeadEventSchema).optional(),
      status: z.array(LeadEventSchema).optional(),
    })
    .optional(),
  message: z.looseObject({ add: z.array(IncomingMessageSchema).optional() }).optional(),
  outgoing_message: z.looseObject({ add: z.array(OutgoingMessageSchema).optional() }).optional(),
  account: z
    .looseObject({ id: z.string().optional(), subdomain: z.string().optional() })
    .optional(),
});
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
