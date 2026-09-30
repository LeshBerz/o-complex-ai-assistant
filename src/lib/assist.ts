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
  type Intent,
  type Sentiment,
  type Upsell,
} from "@/lib/contracts";
import { buildSystemPrompt, buildUserMessage, PROMPT_VERSION } from "@/lib/prompts/system";
import { fewShotMessages } from "@/lib/prompts/few-shots";
import { getKnowledgeBase, type ExcludeIf, type KnowledgeBase, type UpsellRule } from "@/lib/kb";
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
    rule_id: z.string().nullable(),
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
export type LlmResponse = z.infer<typeof LlmResponseSchema>;

const HISTORY_TURNS = 10;

/** Каталог «id | название | категория» для <catalog> в системном промпте */
function buildCatalog(kb: KnowledgeBase): string {
  return kb.products.map((p) => `${p.id} | ${p.name} | ${p.category}`).join("\n");
}

/** Короткие реплики («а сколько стоит?») ищем вместе с предыдущими словами клиента */
function buildRetrievalQuery(req: AssistRequest): string {
  const lastClientTurns = req.dialog_history
    .filter((t) => t.role === "client")
    .slice(-2)
    .map((t) => t.text);
  return [...lastClientTurns, req.client_message].join("\n");
}

/** Что известно о ситуации, чтобы проверить правило матрицы */
interface UpsellContext {
  intent: Intent;
  sentiment: Sentiment;
  needsHuman: boolean;
  sensitive: boolean;
  minor: boolean;
  /** товары, которые клиент купил или обсуждает */
  mentioned: Set<string>;
  pastPurchases: Set<string>;
}

const EXCLUDE_CHECKS: Record<ExcludeIf, (ctx: UpsellContext) => boolean> = {
  complaint: (ctx) => ctx.intent === "complaint",
  negative_sentiment: (ctx) => ctx.sentiment === "negative",
  contraindications: (ctx) => ctx.intent === "contraindications" || ctx.sensitive,
  needs_human: (ctx) => ctx.needsHuman,
  minor: (ctx) => ctx.minor,
};

/** Причина, по которой правило не подходит, или null */
function ruleBlockReason(rule: UpsellRule, ctx: UpsellContext): string | null {
  if (!rule.trigger_product_ids.some((id) => ctx.mentioned.has(id))) {
    return `товары-триггеры правила ${rule.id} не обсуждаются и не куплены`;
  }
  if (rule.trigger_intents && !rule.trigger_intents.includes(ctx.intent)) {
    return `правило ${rule.id} не для ситуации «${ctx.intent}»`;
  }
  const excluded = (rule.exclude_if ?? []).find((e) => EXCLUDE_CHECKS[e](ctx));
  if (excluded) return `правило ${rule.id} исключено: ${excluded}`;
  if (ctx.pastPurchases.has(rule.offer_product_id)) {
    return `товар ${rule.offer_product_id} клиент уже покупал`;
  }
  return null;
}

/**
 * Допродажа только по правилу из upsell-matrix.json, прошедшему все проверки.
 * Модель называет rule_id; если правило не подходит или его нет, пробуем другие правила
 * с тем же товаром (один товар предлагается по разным правилам).
 */
function checkUpsell(raw: LlmResponse, kb: KnowledgeBase, ctx: UpsellContext): Upsell {
  const off = (why: string): Upsell => ({ recommended: false, why });
  const { upsell } = raw;
  if (!upsell.recommended) return off(upsell.why);

  const byId = kb.upsellMatrix.find((r) => r.id === upsell.rule_id);
  const offerId = byId?.offer_product_id ?? upsell.product_id;
  const candidates = [
    ...(byId ? [byId] : []),
    ...kb.upsellMatrix.filter((r) => r !== byId && r.offer_product_id === offerId),
  ];
  if (candidates.length === 0) {
    return off(
      `Подсказка отключена: правила «${upsell.rule_id ?? "без id"}» и товара «${upsell.product_id ?? "без id"}» нет в матрице допродаж.`,
    );
  }
  const reasons = candidates.map((r) => ruleBlockReason(r, ctx));
  const rule = candidates.find((_, i) => reasons[i] === null);
  if (!rule) return off(`Подсказка отключена: ${reasons[0]}.`);

  // Модель выбирает правило, а тексты берём из проверенной матрицы и каталога:
  // в своих формулировках модель добавляет обещания эффекта и выдумывает названия.
  const product = kb.products.find((p) => p.id === rule.offer_product_id);
  return {
    recommended: true,
    rule_id: rule.id,
    product_id: rule.offer_product_id,
    product_name: product?.name,
    why: rule.why,
    manager_phrase: rule.manager_phrase,
  };
}

const normalizeName = (s: string) => s.toLowerCase().replace(/[«»"()]/g, "").replace(/\s+/g, " ").trim();

/** Купленные товары, товары из найденных чанков и товары, названные в диалоге по имени */
function mentionedProducts(req: AssistRequest, kb: KnowledgeBase, retrievedIds: Set<string>): Set<string> {
  const ids = new Set(req.customer_context?.past_purchases ?? []);
  for (const c of kb.chunks) {
    if (c.product_id && retrievedIds.has(c.id)) ids.add(c.product_id);
  }
  const dialog = normalizeName([...req.dialog_history.map((t) => t.text), req.client_message].join("\n"));
  for (const p of kb.products) {
    if ([p.name, ...(p.aliases ?? [])].some((n) => dialog.includes(normalizeName(n)))) ids.add(p.id);
  }
  return ids;
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

/** exclude_if "minor": речь о несовершеннолетнем */
const MINOR_TOPIC =
  /(^|[^а-яё])(ребен|ребён|детям|детей|дети|детск|малыш|подрост|несовершеннолет|школьни|сыну|сына|сынок|дочк|дочер|дочь)/i;

/**
 * Язык текста по буквам, букв нет → null. Русский, если кириллицы хотя бы 40%:
 * русские клиенты пишут латиницей бренды и служебные слова («SYSTEM», теги), английские кириллицу — почти никогда.
 */
export function detectLanguage(text: string): "ru" | "en" | null {
  const cyr = text.match(/[а-яё]/gi)?.length ?? 0;
  const lat = text.match(/[a-z]/gi)?.length ?? 0;
  if (cyr + lat === 0) return null;
  return cyr / (cyr + lat) >= 0.4 ? "ru" : "en";
}

export function postProcess(
  raw: LlmResponse,
  kb: KnowledgeBase,
  retrievedIds: Set<string>,
  req: AssistRequest,
): AssistResponse {
  const clientMessage = req.client_message;
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
  // ответ не на языке клиента не отправляем без проверки
  const clientLang = detectLanguage(clientMessage);
  const replyLang = detectLanguage(raw.client_reply);
  if (clientLang && replyLang && clientLang !== replyLang) {
    const langReason = `Черновик написан не на языке клиента (${replyLang} вместо ${clientLang}): перепишите перед отправкой.`;
    reason = needsHuman && reason ? `${reason} ${langReason}` : langReason;
    needsHuman = true;
  }
  return {
    client_reply: raw.client_reply,
    upsell: sensitive
      ? { recommended: false, why: "Подсказка отключена: вопрос о здоровье или противопоказаниях." }
      : checkUpsell(raw, kb, {
          intent: raw.intent,
          sentiment: raw.sentiment,
          needsHuman,
          sensitive,
          minor: MINOR_TOPIC.test(clientMessage),
          mentioned: mentionedProducts(req, kb, retrievedIds),
          pastPurchases: new Set(req.customer_context?.past_purchases ?? []),
        }),
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
    catalog: buildCatalog(kb),
  });
  const userMessage = buildUserMessage({
    ...parsed,
    dialog_history: parsed.dialog_history.slice(-HISTORY_TURNS),
  });

  try {
    const result = await generateStructured({
      schema: LlmResponseSchema,
      schemaName: "assist_response",
      instructions,
      messages: [...fewShotMessages(), { role: "user", content: userMessage }],
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
      response: postProcess(result.object, kb, new Set(chunks.map((c) => c.id)), parsed),
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
