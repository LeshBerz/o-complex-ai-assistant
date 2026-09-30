# Волна 0 — каркас и контракты (запускать первой, в одной сессии)

Скопируйте текст ниже в Claude Code целиком.

---

Ты тимлид проекта. Прочитай `CLAUDE.md` и `README.md`. Сейчас подготовь каркас, чтобы 5 агентов могли дальше работать параллельно, не мешая друг другу. Субагентов пока **не запускай**.

1. **Инициализация проекта**
   - Проверь актуальные версии (`npm view next version`, `ai`, `zod`, `tailwindcss` и нужного провайдера модели) и создай Next.js-проект (App Router, TypeScript strict, Tailwind, ESLint, папка `src/`) в текущей директории, не затирая `CLAUDE.md`, `README.md`, `.claude/`, `prompts/`.
   - Скрипты в `package.json`: `dev`, `build`, `typecheck`, `lint`, `build-index`, `eval`.
   - `.gitignore` должен включать `.env.local`, `logs/`, `data/kb/index.json`.

2. **Контракт `src/lib/contracts.ts`** (zod + экспорт TS-типов):
   - `AssistRequest`: `client_message` (string), `dialog_history` (массив `{role: 'client'|'manager', text, ts?}`), `customer_context` (optional: имя, прошлые покупки — массив id товаров, статус сделки).
   - `AssistResponse`:
     - `client_reply: string`
     - `upsell: { recommended: boolean, product_id?: string, product_name?: string, why: string, manager_phrase?: string }`
     - `intent: 'product_question'|'delivery_payment'|'contraindications'|'complaint'|'order'|'other'`
     - `sentiment: 'positive'|'neutral'|'negative'`
     - `needs_human: boolean`, `needs_human_reason?: string`
     - `sources: string[]` (id чанков)
   - `AssistMeta`: `usage` (inputTokens, outputTokens), `latency_ms`, `prompt_version`.
   - Сигнатура ядра: `export type AssistFn = (req: AssistRequest) => Promise<{ response: AssistResponse; meta: AssistMeta }>`.

3. **Формат базы знаний `data/kb/README.md`**: опиши схемы `products.json`, `upsell-matrix.json`, `chunks.json` (id, text, source, type), `faq.md`, `policies.md`. Добавь по одному примеру-записи в каждый JSON.

4. **Заглушки, чтобы параллельная работа не блокировалась:**
   - `src/lib/prompts/system.ts`: `export const PROMPT_VERSION = 'v0-stub'` и `buildSystemPrompt(...)` с корректной сигнатурой;
   - `src/lib/assist.ts`: реализация `AssistFn`, пока возвращает фиктивный валидный ответ;
   - `src/components/__mocks__/assist-response.ts`: мок-ответ по схеме;
   - `data/amocrm-mock/`: пример тела вебхука и пример сделки с историей (формат пометь как «предположение, уточнит amocrm-integrator»).

5. **Документы:** создай `docs/ai-log.md` (с шаблоном записи из CLAUDE.md), `docs/contract-changes.md`, `docs/decisions.md` (зафиксируй стек и почему), `.env.example`.

6. `npm run typecheck && npm run lint` должны пройти. Сделай первый коммит `lead: bootstrap + contracts`.

7. В конце выведи мне краткий отчёт: какие версии пакетов выбраны, дерево файлов, что осталось заглушками.
