import type { AssistResult } from "@/lib/contracts";

/** Мок-ответ по контракту — для UI и тестов, пока нет реального ядра. */
export const mockAssistResult: AssistResult = {
  response: {
    client_reply:
      "Здравствуйте! Спасибо за вопрос. Уточню детали и вернусь к вам в ближайшее время.",
    upsell: {
      recommended: true,
      rule_id: "upsell-015",
      product_id: "mineral-bottle",
      product_name: "Минеральная бутылка (500ml) + минеральные шарики",
      why: "Мок: тексты правила upsell-015 из data/kb/upsell-matrix.json.",
      manager_phrase:
        "Во время курса инструкция советует пить достаточно воды. Многим удобно держать её под рукой в Минеральной бутылке на 500 мл. Показать?",
    },
    intent: "product_question",
    sentiment: "neutral",
    needs_human: false,
    sources: ["policy:delivery"],
  },
  meta: {
    usage: { inputTokens: 0, outputTokens: 0 },
    latency_ms: 0,
    prompt_version: "v0-stub",
  },
};

/** Вариант для сценария «жалоба / противопоказания»: без допродажи, нужен человек. */
export const mockAssistResultNeedsHuman: AssistResult = {
  response: {
    client_reply:
      "Понимаю ваше беспокойство. Передаю вопрос менеджеру, он свяжется с вами. По вопросам здоровья рекомендуем проконсультироваться с врачом.",
    upsell: { recommended: false, why: "Жалоба/медицинский вопрос — допродажа неуместна." },
    intent: "contraindications",
    sentiment: "negative",
    needs_human: true,
    needs_human_reason: "Вопрос о противопоказаниях",
    sources: [],
  },
  meta: {
    usage: { inputTokens: 0, outputTokens: 0 },
    latency_ms: 0,
    prompt_version: "v0-stub",
  },
};
