/**
 * Текст примечания с подсказкой для карточки сделки.
 */
import type { AssistResult } from "@/lib/contracts";
import { BOT_NOTE_PREFIX } from "./context";

export function formatAssistNote({ response }: AssistResult): string {
  const lines = [`${BOT_NOTE_PREFIX} Черновик ответа клиенту:`, response.client_reply.trim(), ""];

  const { upsell } = response;
  if (upsell.recommended) {
    const product = upsell.product_name ?? upsell.product_id ?? "товар из матрицы";
    const rule = upsell.rule_id ? ` (правило ${upsell.rule_id})` : "";
    lines.push(`💡 Допродажа: ${product}${rule} — ${upsell.why}`);
    if (upsell.manager_phrase) lines.push(`Как предложить: «${upsell.manager_phrase}»`);
  } else {
    lines.push(`💡 Допродажа: не предлагать — ${upsell.why}`);
  }

  if (response.needs_human) {
    lines.push("", `⚠️ Нужен менеджер: ${response.needs_human_reason ?? "см. черновик"}`);
  }

  lines.push("", `Тема: ${response.intent} · тон клиента: ${response.sentiment}`);
  return lines.join("\n");
}
