/**
 * Шлёт фикстуру вебхука amoCRM на локальный сервер и ждёт примечание в logs/amocrm-notes.jsonl.
 *
 *   npx tsx scripts/amocrm-mock-webhook.ts [message-add|lead-status] [--url http://localhost:3000]
 *
 * Сервер должен быть запущен с AMOCRM_MODE=mock и тем же AMOCRM_WEBHOOK_SECRET
 * (секрет берётся из env или .env.local).
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const fixture = args.find((a) => !a.startsWith("--")) ?? "message-add";
const urlIdx = args.indexOf("--url");
const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : "http://localhost:3000";
const TIMEOUT_MS = 90_000;

const NOTES_LOG = path.join(process.cwd(), "logs", "amocrm-notes.jsonl");

async function fileSize(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // .env.local необязателен, если переменные заданы в окружении
  }
  const secret = process.env.AMOCRM_WEBHOOK_SECRET;
  if (!secret) throw new Error("Задайте AMOCRM_WEBHOOK_SECRET (env или .env.local)");

  const bodyFile = path.join("data", "amocrm-mock", `webhook-${fixture}.form.txt`);
  const body = (await readFile(bodyFile, "utf8")).trim();
  const before = await fileSize(NOTES_LOG);

  const url = new URL("/api/amocrm/webhook", baseUrl);
  url.searchParams.set("secret", secret);

  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  console.log(`→ ${bodyFile}\n← ${res.status} за ${Date.now() - started} мс: ${await res.text()}`);
  if (!res.ok) process.exit(1);

  // В mock-режиме примечание дописывается в лог после ответа (after())
  process.stdout.write("Жду примечание в logs/amocrm-notes.jsonl");
  while (Date.now() - started < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1000));
    process.stdout.write(".");
    if ((await fileSize(NOTES_LOG)) > before) {
      // before — размер в байтах, поэтому режем Buffer, а не строку (кириллица многобайтовая)
      const added = (await readFile(NOTES_LOG)).subarray(before).toString("utf8").trim().split("\n");
      const last = JSON.parse(added[added.length - 1]) as { lead_id: number; params: { text: string } };
      console.log(`\n\nПримечание в сделку ${last.lead_id}:\n${last.params.text}`);
      return;
    }
  }
  console.log("\nПримечание не появилось. Смотрите консоль next dev (AMOCRM_MODE=mock?).");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
