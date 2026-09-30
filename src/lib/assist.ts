/**
 * Ядро ассистента. Зона backend-dev.
 * Сейчас заглушка: возвращает валидный по контракту фиктивный ответ.
 */
import {
  AssistRequestSchema,
  AssistResultSchema,
  type AssistFn,
} from "@/lib/contracts";
import { PROMPT_VERSION } from "@/lib/prompts/system";

export const assist: AssistFn = async (req) => {
  const started = Date.now();
  const parsed = AssistRequestSchema.parse(req);

  const result = {
    response: {
      client_reply: `Здравствуйте${parsed.customer_context?.name ? `, ${parsed.customer_context.name}` : ""}! Спасибо за обращение. Менеджер уточнит детали и ответит вам. (stub)`,
      upsell: { recommended: false, why: "stub: ядро ещё не реализовано" },
      intent: "other" as const,
      sentiment: "neutral" as const,
      needs_human: true,
      needs_human_reason: "stub: ядро ещё не реализовано",
      sources: [],
    },
    meta: {
      usage: { inputTokens: 0, outputTokens: 0 },
      latency_ms: Date.now() - started,
      prompt_version: PROMPT_VERSION,
    },
  };

  return AssistResultSchema.parse(result);
};
