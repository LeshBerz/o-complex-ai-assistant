/**
 * Локальное хранилище переписки по сделкам.
 *
 * Зачем: REST API amoCRM v4 не отдаёт текст сообщений чатов — события incoming_chat_message /
 * outgoing_chat_message содержат только id сообщения (crm_platform/events-and-notes), а Chat API
 * предназначен для интеграций-каналов чатов. Текст приходит только в вебхуках add_message и
 * add_outgoing_message, поэтому сервис копит его сам в logs/amocrm-messages.jsonl.
 * В mock-режиме хранилище дополнительно засевается из data/amocrm-mock/lead-with-history.json.
 *
 * Ограничение: хранится только то, что пришло после подключения вебхука; файл — демо-решение,
 * для продакшена нужна БД.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { LOGS_DIR, MOCK_DIR } from "./config";

export const StoredMessageSchema = z.object({
  lead_id: z.number().int(),
  message_id: z.string(),
  role: z.enum(["client", "manager"]),
  text: z.string(),
  /** unix seconds */
  created_at: z.number().int(),
});
export type StoredMessage = z.infer<typeof StoredMessageSchema>;

export const MESSAGES_LOG = path.join(LOGS_DIR, "amocrm-messages.jsonl");
const MOCK_SEED = path.join(MOCK_DIR, "lead-with-history.json");

async function readJsonl(file: string): Promise<StoredMessage[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      const parsed = StoredMessageSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    });
}

async function readSeed(): Promise<StoredMessage[]> {
  const raw = JSON.parse(await readFile(MOCK_SEED, "utf8"));
  return z.object({ messages: z.array(StoredMessageSchema) }).parse(raw).messages;
}

/**
 * Ошибка записи (например, файловая система только для чтения на serverless) не должна
 * останавливать подсказку: теряется только история для следующих подсказок, о чём пишем в лог.
 */
export async function appendMessage(msg: StoredMessage): Promise<void> {
  try {
    await mkdir(LOGS_DIR, { recursive: true });
    await appendFile(MESSAGES_LOG, JSON.stringify(msg) + "\n", "utf8");
  } catch (err) {
    console.warn(`[amocrm] сообщение ${msg.message_id} не сохранено в историю:`, (err as Error).message);
  }
}

/** Переписка по сделке, от старых к новым, без дублей по message_id */
export async function listLeadMessages(
  leadId: number,
  opts: { includeMockSeed: boolean },
): Promise<StoredMessage[]> {
  const all = [...(opts.includeMockSeed ? await readSeed() : []), ...(await readJsonl(MESSAGES_LOG))];
  const seen = new Set<string>();
  return all
    .filter((m) => m.lead_id === leadId && !seen.has(m.message_id) && seen.add(m.message_id))
    .sort((a, b) => a.created_at - b.created_at);
}
