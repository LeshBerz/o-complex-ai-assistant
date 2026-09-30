/**
 * Единый источник правды для запроса/ответа ассистента.
 * Менять ТОЛЬКО через тимлида. Предложения — в docs/contract-changes.md.
 */
import { z } from "zod";

// ---------- Запрос ----------

export const DialogTurnSchema = z.object({
  role: z.enum(["client", "manager"]),
  text: z.string(),
  ts: z.string().optional(), // ISO 8601
});
export type DialogTurn = z.infer<typeof DialogTurnSchema>;

export const CustomerContextSchema = z.object({
  name: z.string().optional(),
  /** id товаров из data/kb/products.json */
  past_purchases: z.array(z.string()).optional(),
  /** статус сделки в amoCRM (название этапа или id) */
  deal_status: z.string().optional(),
});
export type CustomerContext = z.infer<typeof CustomerContextSchema>;

export const AssistRequestSchema = z.object({
  client_message: z.string().min(1),
  dialog_history: z.array(DialogTurnSchema).default([]),
  customer_context: CustomerContextSchema.optional(),
});
export type AssistRequest = z.infer<typeof AssistRequestSchema>;
/** То, что можно прислать в API (dialog_history необязателен) */
export type AssistRequestInput = z.input<typeof AssistRequestSchema>;

// ---------- Ответ ----------

export const IntentSchema = z.enum([
  "product_question",
  "delivery_payment",
  "contraindications",
  "complaint",
  "order",
  "other",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const SentimentSchema = z.enum(["positive", "neutral", "negative"]);
export type Sentiment = z.infer<typeof SentimentSchema>;

export const UpsellSchema = z.object({
  recommended: z.boolean(),
  /** id правила из data/kb/upsell-matrix.json (например "upsell-015"); заполнено при recommended=true */
  rule_id: z.string().optional(),
  /** offer_product_id этого правила (это id из data/kb/products.json) */
  product_id: z.string().optional(),
  product_name: z.string().optional(),
  why: z.string(),
  manager_phrase: z.string().optional(),
});
export type Upsell = z.infer<typeof UpsellSchema>;

export const AssistResponseSchema = z.object({
  client_reply: z.string(),
  upsell: UpsellSchema,
  intent: IntentSchema,
  sentiment: SentimentSchema,
  needs_human: z.boolean(),
  needs_human_reason: z.string().optional(),
  /** id чанков из data/kb/chunks.json */
  sources: z.array(z.string()),
});
export type AssistResponse = z.infer<typeof AssistResponseSchema>;

// ---------- Метаданные ----------

export const AssistMetaSchema = z.object({
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  latency_ms: z.number().nonnegative(),
  prompt_version: z.string(),
});
export type AssistMeta = z.infer<typeof AssistMetaSchema>;

/** Тело ответа POST /api/assist */
export const AssistResultSchema = z.object({
  response: AssistResponseSchema,
  meta: AssistMetaSchema,
});
export type AssistResult = z.infer<typeof AssistResultSchema>;

// ---------- Сигнатура ядра ----------

export type AssistFn = (req: AssistRequest) => Promise<AssistResult>;
