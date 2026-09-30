/**
 * Ядро ассистента: запрос → retrieval → промпт → структурированный ответ модели → проверки. Зона backend-dev.
 * Экспорт `assist: AssistFn` вызывают /api/assist, amocrm-интеграция и eval — сигнатуру не менять.
 */
import { z } from "zod";
import {
  AssistRequestSchema,
  AssistResultSchema,
  IntentSchema,
  SentimentSchema,
  type AssistFn,
  type AssistRequest,
  type AssistResponse,
  type Upsell,
} from "@/lib/contracts";
import { buildSystemPrompt, PROMPT_VERSION } from "@/lib/prompts/system";
import { getKnowledgeBase, type KnowledgeBase } from "@/lib/kb";
import { retrieve } from "@/lib/retrieval";
import { generateStructured, getModelInfo } from "@/lib/llm";
import { logUsage } from "@/lib/usage";

/**
 * Схема для модели. Повторяет AssistResponseSchema, но необязательные поля — `nullable`:
 * strict structured outputs требуют, чтобы все ключи были в `required`.
 */
const LlmResponseSchema = z.object({
  client_reply: z.string(),
  upsell: z.object({
    recommended: z.boolean(),
    product_id: z.string().nullable(),
    product_name: z.string().nullable(),
    why: z.string(),
    manager_phrase: z.string().nullable(),
  }),
  intent: IntentSchema,
  sentiment: SentimentSchema,
  needs_human: z.boolean(),
  needs_human_reason: z.string().nullable(),
  sources: z.array(z.string()),
});
type LlmResponse = z.infer<typeof LlmResponseSchema>;

const ROLE_LABEL = { client: "Клиент", manager: "Менеджер" } as const;
const HISTORY_TURNS = 10;

/**
 * Временный адаптер user-сообщения. prompt-engineer добавит buildUserMessage(req)
 * в src/lib/prompts/system.ts — при слиянии переключиться на него.
 */
function buildUserMessageLocal(req: AssistRequest): string {
  const history = req.dialog_history
    .slice(-HISTORY_TURNS)
    .map((t) => `${ROLE_LABEL[t.role]}: ${t.text}`)
    .join("\n");
  return [
    history ? `## История диалога\n${history}` : "## История диалога\n(пусто)",
    `## Новое сообщение клиента\n${req.client_message}`,
  ].join("\n\n");
}

/** Короткие реплики («а сколько стоит?») ищем вместе с предыдущими словами клиента */
function buildRetrievalQuery(req: AssistRequest): string {
  const lastClientTurns = req.dialog_history
    .filter((t) => t.role === "client")
    .slice(-2)
    .map((t) => t.text);
  return [...lastClientTurns, req.client_message].join("\n");
}

/** Допродажа только из upsell-matrix.json и не при жалобе/негативе/противопоказаниях */
function checkUpsell(raw: LlmResponse, kb: KnowledgeBase): Upsell {
  const off = (why: string): Upsell => ({ recommended: false, why });
  const { upsell } = raw;
  if (!upsell.recommended) return off(upsell.why);

  const productId = upsell.product_id ?? "";
  const rules = kb.upsellMatrix.filter((r) => r.offer_product_id === productId);
  if (rules.length === 0) {
    return off(`Подсказка отключена: товара «${productId || "без id"}» нет в матрице допродаж.`);
  }
  if (raw.intent === "complaint" || raw.sentiment === "negative") {
    return off("Подсказка отключена: при жалобе или негативе допродажу не предлагаем.");
  }
  // негатив уже отсечён выше, остаётся проверить exclude_if по intent
  const rule = rules.find((r) => !(r.exclude_if ?? []).includes(raw.intent));
  if (!rule) {
    return off(`Подсказка отключена: правило допродажи исключает ситуацию «${raw.intent}».`);
  }

  // Модель выбирает правило, а тексты берём из проверенной матрицы и каталога:
  // в своих формулировках модель добавляет обещания эффекта и выдумывает названия.
  const product = kb.products.find((p) => p.id === productId);
  return {
    recommended: true,
    product_id: productId,
    product_name: product?.name,
    why: rule.why,
    manager_phrase: rule.manager_phrase,
  };
}

/**
 * Страховка поверх модели: беременность, дети, болезни, лекарства → всегда человек.
 * \b в JS не работает с кириллицей, поэтому граница слова задана вручную
 * (иначе «дет» совпал бы с «детокс»).
 */
const SENSITIVE_TOPIC =
  /(^|[^а-яё])(беремен|кормлю грудью|грудн\S* вскармлив|лактац|ребен|ребён|детям|детей|дети|детск|малыш|подрост|хронич|заболеван|болезн|болею|диабет|гипертон|онколог|противопоказ|аллерги|лекарств|операци)/i;

export function isSensitiveTopic(text: string): boolean {
  return SENSITIVE_TOPIC.test(text);
}

function postProcess(
  raw: LlmResponse,
  kb: KnowledgeBase,
  retrievedIds: Set<string>,
  clientMessage: string,
): AssistResponse {
  let needsHuman = raw.needs_human;
  let reason = raw.needs_human_reason ?? undefined;
  const sensitive = raw.intent === "contraindications" || isSensitiveTopic(clientMessage);
  // правила домена: здоровье и жалобы всегда передаются менеджеру
  if (sensitive && !needsHuman) {
    needsHuman = true;
    reason = "Вопрос о здоровье или противопоказаниях: ответ сверяет менеджер, клиенту — консультация врача.";
  } else if (raw.intent === "complaint" && !needsHuman) {
    needsHuman = true;
    reason = "Жалоба клиента: решение (возврат, замену) принимает менеджер.";
  }
  return {
    client_reply: raw.client_reply,
    upsell: sensitive
      ? { recommended: false, why: "Подсказка отключена: вопрос о здоровье или противопоказаниях." }
      : checkUpsell(raw, kb),
    intent: raw.intent,
    sentiment: raw.sentiment,
    needs_human: needsHuman,
    needs_human_reason: needsHuman ? reason : undefined,
    // только id, которые реально вернул retrieval
    sources: [...new Set(raw.sources)].filter((id) => retrievedIds.has(id)),
  };
}

export const assist: AssistFn = async (req) => {
  const started = Date.now();
  const parsed = AssistRequestSchema.parse(req);
  const kb = getKnowledgeBase();
  const modelInfo = getModelInfo();

  const chunks = await retrieve(buildRetrievalQuery(parsed));
  const instructions = buildSystemPrompt({
    chunks,
    upsellMatrix: JSON.stringify(kb.upsellMatrix, null, 2),
    policies: kb.policies,
    customer: parsed.customer_context,
  });

  try {
    const result = await generateStructured({
      schema: LlmResponseSchema,
      schemaName: "assist_response",
      instructions,
      messages: [{ role: "user", content: buildUserMessageLocal(parsed) }],
    });
    const latency = Date.now() - started;
    await logUsage({
      ts: new Date().toISOString(),
      provider: modelInfo.provider,
      model: result.servedModel,
      prompt_version: PROMPT_VERSION,
      ...result.usage,
      latency_ms: latency,
      attempts: result.attempts,
      retrieved: chunks.length,
      ok: true,
    });

    return AssistResultSchema.parse({
      response: postProcess(result.object, kb, new Set(chunks.map((c) => c.id)), parsed.client_message),
      meta: { usage: result.usage, latency_ms: latency, prompt_version: PROMPT_VERSION },
    });
  } catch (err) {
    await logUsage({
      ts: new Date().toISOString(),
      provider: modelInfo.provider,
      model: modelInfo.modelId,
      prompt_version: PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      latency_ms: Date.now() - started,
      attempts: 0,
      retrieved: chunks.length,
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }
};
