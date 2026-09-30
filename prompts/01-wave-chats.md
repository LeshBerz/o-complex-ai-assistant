# Волна 1: промпты для отдельных чатов (вариант Б, git worktree)

Worktree уже созданы от коммита волны 0, у каждого своя ветка:

| Чат | Папка | Ветка |
|---|---|---|
| kb-builder | `../oc-kb` | `feat/kb` |
| prompt-engineer | `../oc-prompt` | `feat/prompt` |
| backend-dev | `../oc-backend` | `feat/backend` |
| amocrm-integrator | `../oc-amocrm` | `feat/amocrm` |
| frontend-dev | `../oc-frontend` | `feat/frontend` |

**Перед стартом** (в каждой папке один раз):
```bash
npm install
```
```bash
cp "../AmoCRM AI Assistant/.env.local" .
```
(`.env.local` нужен как минимум backend-dev; остальным, если ключ используется.)

Затем в каждой папке новый чат Claude Code (`claude` или вкладка Code в приложении с этой папкой) и вставить соответствующий промпт ниже целиком.

---

## Общий блок (уже включён в каждый промпт)

- Работай **только** в своей зоне файлов. Чужие файлы только читать.
- `src/lib/contracts.ts` и формат из `data/kb/README.md` не менять. Нужно изменение: запиши предложение в `docs/contract-changes.md` (в конец файла, по шаблону) и продолжай с текущим контрактом.
- `docs/ai-log.md`: запись только **в конец файла**, по шаблону. Другие записи не трогать: при слиянии веток так не будет конфликтов.
- Перед финалом: `npm run typecheck` и `npm run lint` проходят, результат проверен запуском.
- Коммиты маленькие, формат `<роль>: <что сделано>`, в ветку текущего worktree. Не делать merge, rebase, push и не переключать ветки.
- В конце выведи отчёт: что сделано / что не получилось / допущения / изменённые файлы / предложения по контракту.

---

## 1. kb-builder (папка `oc-kb`)

```
Действуй как субагент kb-builder из .claude/agents/kb-builder.md и выполни его задачу полностью.
Сначала прочитай CLAUDE.md, src/lib/contracts.ts и data/kb/README.md.

Уточнения тимлида:
- Формат файлов задаёт data/kb/README.md (это контракт), а не описание роли. В upsell-matrix.json
  используются поля `why` и `exclude_if` (в описании роли они названы `reason` и `when_not_to_offer`;
  используй названия из README). id товаров в kebab-case, стабильные.
- Примеры-заглушки с id `example-*` в products.json, upsell-matrix.json и chunks.json замени реальными данными.
- В chunks.json id строятся по схеме `<type>:<slug>[:n]`. Каждый товар из products.json должен
  попасть хотя бы в один чанк с полем product_id. Политики и FAQ тоже нарезаются на чанки.
- В матрице допродаж offer_product_id и trigger_product_ids должны существовать в products.json:
  проверь это скриптом (node -e ...) и приложи вывод к записи в ai-log.
- Медицинских обещаний не должно быть нигде. Противопоказания бери только с сайта, если на сайте
  их нет, ставь "TODO: проверить".

Зона: data/kb/ (кроме README.md: там только пометка «демо-база», если сайт недоступен) и docs/kb-sources.md.

Правила:
- Работай только в своей зоне. Контракт не меняй, предложения пиши в конец docs/contract-changes.md.
- Запись в ai-log добавляй в конец docs/ai-log.md по шаблону.
- Коммиты с префиксом «kb-builder: ...» в текущую ветку. Без merge, push и смены ветки.
- В конце отчёт: что сделано / что не получилось / допущения / изменённые файлы / предложения по контракту.
```

---

## 2. prompt-engineer (папка `oc-prompt`)

```
Действуй как субагент prompt-engineer из .claude/agents/prompt-engineer.md и выполни его задачу полностью.
Сначала прочитай CLAUDE.md, src/lib/contracts.ts и data/kb/README.md.

Уточнения тимлида:
- Сигнатура в src/lib/prompts/system.ts зафиксирована, её использует backend-dev:
  PROMPT_VERSION, типы RetrievedChunk и SystemPromptInput, функция buildSystemPrompt(input): string.
  Поля SystemPromptInput можно дополнять только необязательными. Удалять и переименовывать нельзя.
  Если нужно больше, пиши в docs/contract-changes.md.
- dialog_history и client_message не входят в системный промпт, их backend-dev передаёт в messages.
  Поэтому экспортируй ещё и buildUserMessage(req: AssistRequest): string, который заворачивает
  <dialog_history>, <customer_context> и <client_message> в XML-теги. Few-shot примеры экспортируй
  отдельно (например, FEW_SHOTS) так, чтобы backend мог подставить их в messages.
- Поля reasoning_brief в контракте нет, рассуждение не выводи.
- PROMPT_VERSION поменяй с "v0-stub" на "v1".
- Реальной базы пока нет (kb-builder собирает её параллельно). В eval-кейсах для товаров указывай
  их названия и категории, а expected.allowed_upsell_ids оставь пустыми с пометкой
  "TODO: заполнить после kb" там, где id ещё неизвестны.
- Формат data/eval/cases.json опиши zod-схемой в data/eval/schema.ts (эта зона твоя) и проверь
  файл скриптом через npx tsx.

Зона: src/lib/prompts/, data/eval/, docs/prompt-design.md.

Правила:
- Работай только в своей зоне. Контракт не меняй, предложения пиши в конец docs/contract-changes.md.
- Запись в ai-log добавляй в конец docs/ai-log.md по шаблону.
- Коммиты с префиксом «prompt-engineer: ...» в текущую ветку. Без merge, push и смены ветки.
- В конце отчёт: что сделано / что не получилось / допущения / изменённые файлы / предложения по контракту.
```

---

## 3. backend-dev (папка `oc-backend`)

```
Действуй как субагент backend-dev из .claude/agents/backend-dev.md и выполни его задачу полностью.
Сначала прочитай CLAUDE.md, AGENTS.md, src/lib/contracts.ts и data/kb/README.md.

Уточнения тимлида:
- Провайдер выбран: OpenAI через @ai-sdk/openai (уже установлен). Эмбеддинги берутся из env
  EMBEDDING_MODEL, генерация из LLM_MODEL. Актуальные имена моделей проверь по документации,
  не угадывай. Если «gpt-4o-mini» в .env.example устарела, исправь .env.example.
- В проекте стоят ai@7 и zod@4. Документацию AI SDK сверяй именно для v7 (WebFetch на
  ai-sdk.dev). Проверь, остался ли generateObject в v7 или его заменил generateText с
  output/Output.object. Выбери рекомендованный способ и запиши выбор в ai-log.
- Next.js 16: перед тем как писать route handler, прочитай гайд в node_modules/next/dist/docs/.
- src/lib/assist.ts тоже твой. Он экспортирует `assist: AssistFn`, и этот экспорт вызывают
  amocrm-integrator и eval, поэтому имя и сигнатуру не менять.
- POST /api/assist принимает AssistRequest (парсинг через AssistRequestSchema) и возвращает
  AssistResult = { response, meta }. 400 при невалидном входе, 502 или 504 при ошибке модели или
  таймауте, тело ошибки { error: string }.
- Промпт бери из src/lib/prompts/system.ts (buildSystemPrompt, PROMPT_VERSION). Сейчас там
  заглушка, её параллельно переписывает prompt-engineer. Сам этот файл не меняй. Если нужна
  функция для user-сообщения, сделай локальный адаптер у себя. prompt-engineer добавит
  buildUserMessage(req), на него переключимся при слиянии.
- Реальной базы пока нет, работай на примерах из data/kb/. Добавь в data/kb/ 3–5 временных чанков
  в отдельный файл data/kb/chunks.dev.json (с пометкой "dev-fixture"). chunks.json не трогай: его
  заменит kb-builder.
- После ответа модели проверяй, что upsell.product_id есть в upsell-matrix.json. Если его там нет,
  ставь recommended=false. То же с sources: оставляй только id, которые реально были в выдаче retrieval.
- Если .env.local без ключа, прогон на реальной модели не делай и явно напиши об этом в отчёте.

Зона: src/lib/assist.ts, src/lib/retrieval.ts, src/lib/llm.ts, src/lib/kb.ts, src/lib/usage.ts,
src/app/api/assist/, scripts/build-index.ts, .env.example, data/kb/chunks.dev.json.

Правила:
- Работай только в своей зоне. Контракт не меняй, предложения пиши в конец docs/contract-changes.md.
- Запись в ai-log добавляй в конец docs/ai-log.md по шаблону, с выводом curl.
- Коммиты с префиксом «backend-dev: ...» в текущую ветку. Без merge, push и смены ветки.
- В конце отчёт: что сделано / что не получилось / допущения / изменённые файлы / предложения по контракту.
```

---

## 4. amocrm-integrator (папка `oc-amocrm`)

```
Действуй как субагент amocrm-integrator из .claude/agents/amocrm-integrator.md и выполни его задачу полностью.
Сначала прочитай CLAUDE.md, AGENTS.md, src/lib/contracts.ts и data/amocrm-mock/README.md.

Уточнения тимлида:
- Фикстуры в data/amocrm-mock/ тимлид написал по памяти, и они помечены как предположение.
  Сверь их с официальной документацией amoCRM API v4 и перепиши под реальный формат. Эта папка
  теперь твоя зона. В docs/amocrm-setup.md отдельно отметь, что проверено в документации, а что нет.
- Ядро вызывай так: import { assist } from "@/lib/assist" (сигнатура AssistFn из контракта).
  Сейчас это заглушка, реальную версию параллельно пишет backend-dev. Файл assist.ts не меняй.
- Next.js 16: перед тем как писать route handler, прочитай гайд в node_modules/next/dist/docs/.
  Для «ответить 200 сразу, а обработать потом» проверь, есть ли в этой версии after() из next/server,
  и используй его вместо висящего промиса.
- Вебхук защити секретом (AMOCRM_WEBHOOK_SECRET в query) и валидируй вход zod-схемой.
- Режим задаётся env AMOCRM_MODE=mock|live (уже есть в .env.example). В mock-режиме addNote не
  шлёт запросов, а пишет примечание в logs/amocrm-notes.jsonl и в консоль.
- Для проверки end-to-end сделай скрипт scripts/amocrm-mock-webhook.ts: он шлёт фикстуру на
  локальный вебхук. Если нужна npm-команда, запиши её в отчёт, package.json сам не трогай.
- Если нужны новые переменные env, перечисли их в отчёте, .env.example не трогай
  (его правит backend-dev).

Зона: src/lib/amocrm/, src/app/api/amocrm/, data/amocrm-mock/, docs/amocrm-setup.md, scripts/amocrm-*.ts.

Правила:
- Работай только в своей зоне. Контракт не меняй, предложения пиши в конец docs/contract-changes.md.
- Запись в ai-log добавляй в конец docs/ai-log.md по шаблону.
- Коммиты с префиксом «amocrm-integrator: ...» в текущую ветку. Без merge, push и смены ветки.
- В конце отчёт: что сделано / что не получилось / допущения / изменённые файлы / предложения по контракту.
```

---

## 5. frontend-dev (папка `oc-frontend`)

```
Действуй как субагент frontend-dev из .claude/agents/frontend-dev.md и выполни его задачу полностью.
Сначала прочитай CLAUDE.md, AGENTS.md и src/lib/contracts.ts.

Уточнения тимлида:
- Типы берутся только из @/lib/contracts (AssistRequest, AssistResult и т.д.).
- Ответ API: POST /api/assist принимает AssistRequest и возвращает AssistResult = { response, meta }.
  При ошибке приходит { error: string } со статусом 4xx или 5xx.
- Сделай переключатель источника данных: env NEXT_PUBLIC_USE_MOCK=1 или тумблер в UI
  «мок / API». Мок берётся из src/components/__mocks__/assist-response.ts (там два варианта:
  обычный и needs_human).
- data/eval/cases.json пока не существует (его пишет prompt-engineer). Демо-сценарии для
  выпадающего списка положи в src/components/demo-scenarios.ts: 5–6 штук (вопрос о товаре,
  доставка, беременность, жалоба, повторный покупатель, попытка prompt injection). Названия
  товаров в сценариях пиши обобщённо, без выдуманных фактов.
- Next.js 16 и React 19: перед тем как писать код, прочитай гайды в node_modules/next/dist/docs/.
- shadcn/ui и lucide-react можно ставить. Установка меняет package.json, это допустимо, но
  перечисли в отчёте, что добавил.
- Проверь в браузере через npm run dev все состояния: пусто, загрузка, ответ с допродажей,
  needs_human, ошибка. Если скриншоты сделать нельзя, опиши, что проверил.

Зона: src/app/page.tsx, src/app/layout.tsx, src/app/globals.css, src/components/ (кроме __mocks__/, их только читать), public/.

Правила:
- Работай только в своей зоне. Контракт не меняй, предложения пиши в конец docs/contract-changes.md.
- Запись в ai-log добавляй в конец docs/ai-log.md по шаблону.
- Коммиты с префиксом «frontend-dev: ...» в текущую ветку. Без merge, push и смены ветки.
- В конце отчёт: что сделано / что не получилось / допущения / изменённые файлы / предложения по контракту.
```

---

## После всех пяти: промпт для основного чата (папка `AmoCRM AI Assistant`)

```
Все пять веток волны 1 готовы. Слей feat/kb, feat/prompt, feat/backend, feat/amocrm, feat/frontend
в main по одной, в этом порядке.
- Конфликты в docs/ai-log.md и docs/contract-changes.md решай объединением: сохраняй все записи
  в хронологическом порядке.
- Конфликты в package.json и package-lock.json: объедини зависимости, потом npm install.
- При конфликтах в коде остановись и покажи мне конфликт вместе со своим вариантом решения.
После слияния:
1. npm install, npm run typecheck, npm run lint, npm run build-index.
2. Переключи backend на buildUserMessage из prompts, если prompt-engineer его сделал, и заполни
   allowed_upsell_ids в eval-кейсах по реальной матрице допродаж.
3. Удали chunks.dev.json, если реальная база готова.
4. Сведи отчёты в таблицу (агент / статус / допущения / риски). Покажи предложения из
   docs/contract-changes.md и не применяй их без моего ОК.
5. Удали worktree (git worktree remove ../oc-<роль>).
```
