/**
 * Формат data/eval/cases.json. Зона prompt-engineer.
 * Проверка: npx tsx data/eval/validate.ts
 */
import { z } from "zod";
import {
  CustomerContextSchema,
  DialogTurnSchema,
  IntentSchema,
  SentimentSchema,
  type AssistRequest,
} from "../../src/lib/contracts";

export const EvalCategorySchema = z.enum([
  "product_question",
  "delivery_payment",
  "price",
  "order",
  "contraindications",
  "pregnancy",
  "children",
  "medical_claim",
  "out_of_kb",
  "complaint",
  "irritated",
  "returning_customer",
  "prompt_injection",
  "english",
]);
export type EvalCategory = z.infer<typeof EvalCategorySchema>;

/** Товар, о котором идёт речь в кейсе. id появятся после сборки базы. */
export const EvalProductRefSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  /** id из data/kb/products.json, если уже известен */
  id: z.string().optional(),
});

/** Логическое значение или «любое допустимо» (зависит от наполнения базы). */
const BoolOrAny = z.union([z.boolean(), z.literal("any")]);

export const EvalExpectedSchema = z.object({
  /** допустимые intent (любой из списка засчитывается) */
  intent: z.array(IntentSchema).min(1),
  /** допустимые sentiment; не задано — не проверяем */
  sentiment: z.array(SentimentSchema).min(1).optional(),
  needs_human: BoolOrAny,
  upsell_recommended: BoolOrAny,
  /** какие upsell.product_id допустимы; при recommended=false должен быть пуст */
  allowed_upsell_ids: z.array(z.string()),
  /** пометка, если id ещё неизвестны: "TODO: заполнить после kb" */
  allowed_upsell_ids_todo: z.string().optional(),
  /** язык client_reply */
  reply_language: z.enum(["ru", "en"]),
  /** что по смыслу должно быть в ответе (для LLM-судьи) */
  must: z.array(z.string()).default([]),
  /** запрещённые утверждения по смыслу (для LLM-судьи) */
  forbidden_claims: z.array(z.string()).min(1),
  /** регулярные выражения (флаг i), которых не должно быть в client_reply */
  forbidden_patterns: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const EvalCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case"),
    category: EvalCategorySchema,
    /** что проверяет кейс */
    description: z.string().min(1),
    products: z.array(EvalProductRefSchema).default([]),
    input: z.object({
      client_message: z.string().min(1),
      customer_context: CustomerContextSchema.optional(),
    }),
    dialog_history: z.array(DialogTurnSchema).default([]),
    expected: EvalExpectedSchema,
  })
  .superRefine((c, ctx) => {
    const e = c.expected;
    if (e.upsell_recommended === false && e.allowed_upsell_ids.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["expected", "allowed_upsell_ids"],
        message: "upsell_recommended=false, список допустимых id должен быть пуст",
      });
    }
    if (
      e.upsell_recommended !== false &&
      e.allowed_upsell_ids.length === 0 &&
      !e.allowed_upsell_ids_todo
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["expected", "allowed_upsell_ids_todo"],
        message: "допродажа возможна, но id не заданы: нужна пометка TODO",
      });
    }
    e.forbidden_patterns.forEach((p, i) => {
      try {
        new RegExp(p, "i");
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["expected", "forbidden_patterns", i],
          message: `невалидный regex: ${p}`,
        });
      }
    });
  });
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export const EvalSetSchema = z
  .object({
    version: z.string(),
    /** пояснения к набору */
    notes: z.array(z.string()).default([]),
    cases: z.array(EvalCaseSchema).min(15).max(20),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>();
    s.cases.forEach((c, i) => {
      if (seen.has(c.id)) {
        ctx.addIssue({ code: "custom", path: ["cases", i, "id"], message: `дубль id: ${c.id}` });
      }
      seen.add(c.id);
    });
  });
export type EvalSet = z.infer<typeof EvalSetSchema>;

/** Кейс → запрос к assist() */
export function toAssistRequest(c: EvalCase): AssistRequest {
  return {
    client_message: c.input.client_message,
    dialog_history: c.dialog_history,
    customer_context: c.input.customer_context,
  };
}
