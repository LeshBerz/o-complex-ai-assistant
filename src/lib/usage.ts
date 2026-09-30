/**
 * Журнал вызовов модели: logs/usage.jsonl, одна строка на запрос. Зона backend-dev.
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface UsageRecord {
  ts: string;
  provider: string;
  model: string;
  prompt_version: string;
  inputTokens: number;
  outputTokens: number;
  latency_ms: number;
  attempts: number;
  retrieved: number;
  ok: boolean;
  error?: string;
}

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "usage.jsonl");

/** Ошибка записи лога не должна ронять ответ (на Vercel файловая система только для чтения) */
export async function logUsage(record: UsageRecord): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.warn("[usage] не удалось записать logs/usage.jsonl:", err);
  }
}
