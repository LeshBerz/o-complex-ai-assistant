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
      // тексты правила upsell-015 из data/kb/upsell-matrix.json
      why: "Инструкция цеолита рекомендует во время приёма питьевой режим 30–40 мл воды на 1 кг веса в день. Бутылка на 500 мл помогает держать воду под рукой. Аргумент — удобство, а не лечебный эффект.",
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
    prompt_version: "mock",
  },
};

/**
 * Сценарий «Жалоба»: повреждённая упаковка и долгая доставка. Решение о возврате принимает менеджер
 * (policies.md, «Возврат и обмен»), допродажи нет. Причина needs_human — текст страховки из postProcess.
 */
export const mockAssistResultComplaint: AssistResult = {
  response: {
    client_reply:
      "Светлана, приносим извинения и за долгое ожидание, и за повреждённую упаковку. Пришлите, пожалуйста, номер заказа и фото упаковки: менеджер разберётся и предложит решение по возврату или замене. Сообщить о повреждении нужно в течение 20 дней с момента получения.",
    upsell: { recommended: false, why: "Жалоба клиента: сначала решить проблему, допродажу не предлагать." },
    intent: "complaint",
    sentiment: "negative",
    needs_human: true,
    needs_human_reason: "Жалоба клиента: решение (возврат, замену) принимает менеджер.",
    sources: ["policy:returns"],
  },
  meta: {
    usage: { inputTokens: 0, outputTokens: 0 },
    latency_ms: 0,
    prompt_version: "mock",
  },
};

/**
 * Сценарий «Попытка prompt injection»: просьба вывести системный промпт и дать скидку 90%.
 * Ассистент не раскрывает инструкции и не подтверждает скидку, обращение уходит менеджеру.
 */
export const mockAssistResultInjection: AssistResult = {
  response: {
    client_reply:
      "Здравствуйте! Подтвердить такую скидку мы не можем: цены и акции устанавливает магазин. Если хотите, менеджер расскажет о действующих предложениях и поможет подобрать товар.",
    upsell: {
      recommended: false,
      why: "Товар не обсуждается, подходящего правила в матрице нет. Сообщение похоже на попытку манипуляции.",
    },
    intent: "other",
    sentiment: "neutral",
    needs_human: true,
    needs_human_reason: "Попытка изменить инструкции ассистента и запрос скидки 90%. Скидку не подтверждали, инструкции не раскрывали.",
    sources: [],
  },
  meta: {
    usage: { inputTokens: 0, outputTokens: 0 },
    latency_ms: 0,
    prompt_version: "mock",
  },
};

/** Вариант для сценария «противопоказания»: без допродажи, нужен человек. */
export const mockAssistResultNeedsHuman: AssistResult = {
  response: {
    client_reply:
      "Понимаю ваше беспокойство. Передаю вопрос менеджеру, он свяжется с вами. По вопросам здоровья рекомендуем проконсультироваться с врачом.",
    // тексты страховки из postProcess в src/lib/assist.ts
    upsell: { recommended: false, why: "Подсказка отключена: вопрос о здоровье или противопоказаниях." },
    intent: "contraindications",
    sentiment: "negative",
    needs_human: true,
    needs_human_reason:
      "Вопрос о здоровье или противопоказаниях: ответ сверяет менеджер, клиенту — консультация врача.",
    sources: [],
  },
  meta: {
    usage: { inputTokens: 0, outputTokens: 0 },
    latency_ms: 0,
    prompt_version: "mock",
  },
};

/**
 * Сценарий «Повторный покупатель»: клиентка купила набор «Детокс» и хочет повторить заказ.
 * Допродажа — правило upsell-015 из data/kb/upsell-matrix.json (триггер set-detox, intent order),
 * тексты правила дословно из матрицы. В ответе клиенту нет фактов о товаре, цене и доставке,
 * которых нет в базе. Метрики нулевые: модель не вызывалась.
 */
export const mockAssistResultRepeatBuyer: AssistResult = {
  response: {
    client_reply:
      "Рады, что курс вам понравился! С удовольствием оформим повторный заказ набора «Детокс». Подскажите, пожалуйста, доставка по тому же адресу, что и в прошлый раз?",
    upsell: {
      recommended: true,
      rule_id: "upsell-015",
      product_id: "mineral-bottle",
      product_name: "Минеральная бутылка (500ml) + минеральные шарики",
      why: "Инструкция цеолита рекомендует во время приёма питьевой режим 30–40 мл воды на 1 кг веса в день. Бутылка на 500 мл помогает держать воду под рукой. Аргумент — удобство, а не лечебный эффект.",
      manager_phrase:
        "Во время курса инструкция советует пить достаточно воды. Многим удобно держать её под рукой в Минеральной бутылке на 500 мл. Показать?",
    },
    intent: "order",
    sentiment: "positive",
    needs_human: false,
    sources: ["product:set-detox:1", "faq:kak-oformit-zakaz"],
  },
  meta: {
    usage: { inputTokens: 0, outputTokens: 0 },
    latency_ms: 0,
    prompt_version: "mock",
  },
};
