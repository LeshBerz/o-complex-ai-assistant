# Предложения по изменению контрактов

Агенты **не меняют** `src/lib/contracts.ts` и формат `data/kb/` сами. Предложение пишется сюда, тимлид принимает или отклоняет.

```
## ГГГГ-ММ-ДД [роль] — краткое название
**Что изменить:** поле/схема
**Зачем:** ...
**Кого затрагивает:** backend / frontend / amocrm / eval
**Статус:** предложено | принято | отклонено (причина)
```

---

## 2026-09-30 [backend-dev] — модель, которая реально ответила, в meta
**Что изменить:** `AssistMetaSchema` + `model: z.string()` (например `"nvidia/nemotron-3-super-120b-a12b:free"`).
**Зачем:** с `LLM_FALLBACK_MODELS` OpenRouter может ответить не той моделью, что указана в `LLM_MODEL`. Для eval и разбора ответов важно знать, какая модель дала конкретный ответ. Сейчас это видно только в `logs/usage.jsonl`.
**Кого затрагивает:** backend (одна строка), eval (группировка метрик), frontend (можно показать в UI).
**Статус:** предложено

## 2026-09-30 [backend-dev] — buildUserMessage и RetrievedChunk.product_id
**Что изменить:** в `src/lib/prompts/system.ts` экспортировать `buildUserMessage(req: AssistRequest): string` (уже в планах prompt-engineer). В `RetrievedChunk` добавить необязательное `product_id?: string`.
**Зачем:** сейчас `assist.ts` использует локальный адаптер `buildUserMessageLocal`, при слиянии его нужно заменить. `product_id` позволит промпту связать найденные чанки с `trigger_product_ids` матрицы допродаж.
**Кого затрагивает:** prompt-engineer, backend.
**Статус:** предложено
