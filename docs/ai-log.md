# Журнал работы ИИ

Каждый агент после задачи дописывает запись по шаблону. Тимлид (человек) дописывает свои наблюдения после каждой волны.

```
## [роль] ГГГГ-ММ-ДД — задача
**Что сделал ИИ:** ...
**Где ошибся / что пришлось поправить:** ...
**Итог:** ...
```

---

## [lead] 2026-09-30 — волна 0: каркас и контракты
**Что сделал ИИ:** проверил версии через `npm view`, развернул Next.js 16 (App Router, TS strict, Tailwind 4, ESLint, `src/`) через `create-next-app` во временной папке и перенёс в проект (в текущую папку напрямую нельзя: там уже лежат `README.md`/`CLAUDE.md`, а имя папки с кириллицей и пробелами не годится как npm-имя). Поставил `ai`, `@ai-sdk/openai`, `zod`, `tsx`. Написал `src/lib/contracts.ts`, формат базы `data/kb/README.md`, заглушки (`assist.ts`, `prompts/system.ts`, UI-мок, моки amoCRM, скрипты `build-index`/`eval`), документы.
**Где ошибся / что пришлось поправить:**
- `.gitignore` из шаблона Next.js содержит `.env*`, из-за чего `.env.example` не попал бы в репозиторий. Добавил исключение `!.env.example`.
- `create-next-app` создаёт свой `CLAUDE.md` (`@AGENTS.md`) и `README.md`. Их не переносил, чтобы не затереть проектные. `AGENTS.md` (предупреждение, что Next 16 отличается от обучающих данных) оставил и сослался на него из `CLAUDE.md`.
- Формат вебхука amoCRM написан по памяти и помечен как предположение. Сверку должен сделать amocrm-integrator.
- Модель в `.env.example` помечена `TODO: проверить`.
**Итог:** контракты зафиксированы, `typecheck` (с `next typegen`: без него нет глобального `LayoutProps`) и `lint` проходят, заглушка `assist()` возвращает ответ, который проходит zod-валидацию, можно запускать волну 1.

## [lead] 2026-09-30 — смена провайдера модели
**Что сделал ИИ:** сравнил бесплатные варианты: OpenAI, Anthropic, Gemini, GitHub Models, GigaChat, OpenRouter, Ollama. Перевёл проект на OpenRouter (`@openrouter/ai-sdk-provider@3.1.0`) и локальные эмбеддинги (`@huggingface/transformers@4.3.0`, `Xenova/multilingual-e5-small`). Проверил эмбеддинги запуском на Windows: dim 384, около 16 с на первую загрузку, осмысленная близость на русском. Обновил `.env.example`, `CLAUDE.md` (стек), `docs/decisions.md`, промпт backend-dev.
**Где ошибся / что пришлось поправить:**
- Сначала выбрал OpenAI и не подумал, что у кандидата может не быть способа оплаты. Бесплатных кредитов у OpenAI нет с 2025 года.
- Рекомендовал GitHub Models по сторонним статьям. На официальной странице оказалось, что сервис закрыт 30.07.2026. Поймал это только когда полез в первоисточник перед изменениями. Вывод: выбор внешних сервисов проверять по официальной документации, а не по обзорам.
- Первый вызов для правки `decisions.md` через heredoc проглотил часть команды. Проверил результат через `git diff` и Read, а не поверил на слово.
**Итог:** генерация бесплатна в пределах 50 запросов в день, эмбеддинги бесплатны без лимитов. Риски и способы их смягчить записаны в `docs/decisions.md`.

## [backend-dev] 2026-09-30 — ядро: retrieval, LLM-слой, /api/assist
**Что сделал ИИ:**
- `src/lib/kb.ts` читает `data/kb/*` и валидирует zod-схемами по формату из README. `chunks.dev.json` (5 временных чанков с пометкой dev-fixture) подмешивается только при `KB_DEV_FIXTURES=1`.
- `src/lib/embeddings.ts`: pipeline `feature-extraction` из `@huggingface/transformers` (singleton в `globalThis`, чтобы переживать HMR), `dtype: "q8"`, mean pooling + normalize, e5-префиксы `query: ` / `passage: `.
- `scripts/build-index.ts` пишет `data/kb/index.json` в формате README (6 чанков, dim 384, 1.8 с при прогретом кэше модели). `src/lib/retrieval.ts` делает cosine top-k. Если индекса нет, он построен другой моделью или в нём не хватает чанков, недостающие векторы считаются на лету.
- Пороги подобраны на данных. Релевантный top-1 получает 0.78–0.89 («доставка в Казань» 0.776, «детокс-комплекс» 0.891), оффтоп («погода в Москве») не выше 0.715. Выбрал `minScore=0.75` и `maxGap=0.04` (допустимое отставание от top-1), оба переопределяются через env. На реальной базе пороги нужно пересмотреть.
- `src/lib/llm.ts`: реестр `PROVIDERS` по `LLM_PROVIDER` (сейчас только openrouter; google/gigachat добавляются одной записью без правок assist.ts). Таймаут через `AbortSignal.timeout`, одна повторная попытка только при `NoObjectGeneratedError`, `maxRetries: 0` (сетевые ретраи тратят дневной лимит). В OpenRouter включены `provider.require_parameters`, плагин `response-healing`, `reasoning: {effort: "low", exclude: true}` и цепочка `models` из `LLM_FALLBACK_MODELS`.
- **AI SDK v7:** `generateObject` остался, но помечен `@deprecated Use generateText with an output setting instead`. Проверил в `node_modules/ai/dist/index.d.ts` и `node_modules/ai/docs/03-ai-sdk-core/10-generating-structured-data.mdx`: документация лежит в самом пакете и точно соответствует установленной версии, поэтому WebFetch не понадобился. Использую `generateText({ output: Output.object({ schema }), instructions })`, где `system` → `instructions` (тоже переименование v7).
- `src/lib/assist.ts`: retrieval (запрос = последние 2 реплики клиента + новое сообщение) → `buildSystemPrompt` → локальный адаптер user-сообщения (пока нет `buildUserMessage` от prompt-engineer) → модель → постобработка. Для модели своя схема, в которой необязательные поля сделаны `nullable`: strict structured outputs требуют все ключи в `required`. Постобработка:
  - `sources` фильтруются по id из выдачи retrieval;
  - `upsell` принимается, только если `product_id` есть среди `offer_product_id` матрицы, нет жалобы или негатива и `exclude_if` правила не исключает intent; `why`/`manager_phrase` берутся из матрицы, `product_name` — из каталога;
  - детерминированная страховка: беременность, дети, болезни, лекарства (регэксп с ручной границей слова, так что «детокс» не совпадает с «дети») и `intent=complaint` → `needs_human: true`.
- `src/lib/usage.ts` пишет `logs/usage.jsonl`: модель, которая реально ответила, токены, латентность, попытки, число чанков, ошибка.
- `POST /api/assist` возвращает 400 на битый JSON или невалидный вход, 502 на ошибку провайдера, 504 на таймаут, 500 на конфигурацию; тело ошибки `{ error }`.
- `next.config.ts`: `serverExternalPackages` (оба пакета уже есть во встроенном списке Next 16, указал явно). После `next build` проверил `.nft.json` роута: бинарники `onnxruntime-node` в трейс не попадали. Добавил их (только linux/x64) и `data/kb` в `outputFileTracingIncludes`. Кэш модели e5 (`node_modules/@huggingface/transformers/.cache`) трейсится сам, то есть на Vercel модель, скорее всего, не будет скачиваться при холодном старте (сам деплой не проверял).

**Выбор модели:** через `GET /api/v1/models` (лимит не тратит) нашёл 16 free-моделей. `structured_outputs` поддерживают 4: `qwen/qwen3.8-27b`, `nvidia/nemotron-3-super-120b-a12b`, `dots-studio/dots-3-note-preview`, `liquid/lfm-2.5-2.6b` (2.6B — слишком мала). Основная — **nvidia/nemotron-3-super-120b-a12b:free**: дала все успешные ответы на русском. Запасные: `qwen/qwen3.8-27b:free` (в этот день отвечал только `429 rate-limited upstream`) и `dots-studio/dots-3-note-preview:free` (не вызывалась). За всю отладку потрачено 6 запросов из 50.

**Где ошибся / что пришлось поправить:**
- Первый вызов вернул `403 Access denied by security policy`. Сначала подозревал плагин response-healing, но прямой curl с ним прошёл. Реальная причина: у curl в окружении `HTTPS_PROXY` (VPN, выход NL), а Node `fetch` прокси игнорирует и выходит напрямую из RU (проверил через ipinfo: curl → NL, node → RU). Помогает `NODE_USE_ENV_PROXY=1` (Node ≥22.21). Переменная нужна до старта процесса, из `.env.local` она не сработает. Записал в `.env.example`.
- Сначала основной моделью поставил qwen, потому что «хорошо знает русский», и написал в `.env.example` «проверено». На деле qwen ни разу не ответил. Поменял основную на nemotron и переписал комментарий честно.
- Первый ответ модели: `product_name` для `example-probiotic` выдуман (такого товара нет в `products.json`), а в `why` появилось обещание эффекта («улучшить пищеварение»). Теперь тексты допродажи берутся из матрицы и каталога.
- На вопрос «я беременна, можно ли?» модель (с промптом-заглушкой) поставила `intent: product_question`, `needs_human: false`, а на жалобу пообещала «вернём деньги» и тоже поставила `needs_human: false`. Добавил страховку в коде. Обещание возврата в тексте остаётся задачей промпта (prompt-engineer).
- `curl -d '...кириллица...'` из git-bash на Windows портит кодировку (модель получила «�����»). Тела запросов передаю только файлами через `--data-binary @file`.
- Первый вариант `checkUpsell` сравнивал sentiment с `negative` уже после того, как негатив был отсечён. Поймал `tsc`.

**Вывод curl** (next dev, `KB_DEV_FIXTURES=1`, промпт `v0-stub`). r1 получен вызовом `assist()` через tsx до того, как тексты допродажи стали браться из матрицы; r2 и r3 — через curl после всех правок:
```
$ curl -s -X POST localhost:3100/api/assist -d 'not json'
{"error":"Тело запроса должно быть JSON"} [400]
$ curl -s -X POST localhost:3100/api/assist -d '{"client_message":""}'
{"error":"Невалидный запрос: ✖ Too small: expected string to have >=1 characters\n  → at client_message"} [400]

# r1: "Здравствуйте! Расскажите про детокс-комплекс и сколько идёт доставка?", past_purchases:["example-detox-complex"]
{"response":{"client_reply":"Здравствуйте, Ольга! Рады помочь вам с информацией о нашем детокс‑комплексе и условиях доставки.",
 "upsell":{"recommended":true,"product_id":"example-probiotic","product_name":"Пробиотический комплекс","why":"…пробиотики помогут улучшить пищеварение…"},   <- до правки
 "intent":"product_question","sentiment":"neutral","needs_human":false,
 "sources":["product:example-detox-complex:1","product:example-detox-complex:contra","policy:delivery:dev"]},
 "meta":{"usage":{"inputTokens":559,"outputTokens":715},"latency_ms":10389,"prompt_version":"v0-stub"}}
 usage.jsonl: "model":"nvidia/nemotron-3-super-120b-a12b:free" (qwen → 429 → fallback)

$ curl -s -X POST localhost:3100/api/assist --data-binary @r2.json   # "Я беременна, можно ли мне пить ваш детокс-комплекс?"
{"response":{"client_reply":"Анна, спасибо за ваш вопрос. Согласно информации о нашем детокс‑комплексе, одним из противопоказаний является беременность (а также период лактации). Поэтому мы не рекомендуем принимать этот продукт во время беременности без предварительной консультации с вашим лечащим врачом. …",
 "upsell":{"recommended":false,"why":"Подсказка отключена: вопрос о здоровье или противопоказаниях."},
 "intent":"product_question","sentiment":"neutral","needs_human":true,
 "needs_human_reason":"Вопрос о здоровье или противопоказаниях: ответ сверяет менеджер, клиенту — консультация врача.",
 "sources":["product:example-detox-complex:contra"]},
 "meta":{"usage":{"inputTokens":322,"outputTokens":392},"latency_ms":4511,"prompt_version":"v0-stub"}}  [HTTP 200, 4.56s]

$ curl -s -X POST localhost:3100/api/assist --data-binary @r3.json   # "Это безобразие! Заказ пришёл с разбитой банкой, хочу вернуть деньги."
{"response":{"client_reply":"Очень жаль, что вы получили товар с повреждением. Примите наши извинения за доставленные неудобства. Чтобы оформить возврат или замену, пожалуйста, пришлите, пожалуйста, номер вашего заказа и фотографию разбитой банки … решим вопрос о возврате средств или отправке нового товара.",
 "upsell":{"recommended":false,"why":""},"intent":"complaint","sentiment":"negative","needs_human":true,
 "needs_human_reason":"Жалоба клиента: решение (возврат, замену) принимает менеджер.","sources":["policy:returns:dev"]},
 "meta":{"usage":{"inputTokens":537,"outputTokens":363},"latency_ms":6082,"prompt_version":"v0-stub"}}  [HTTP 200, 6.11s]

# ошибки (прямой вызов POST() из route.ts)
LLM_TIMEOUT_MS=1            -> 504 {"error":"Модель не ответила за 1 мс"}
LLM_MODEL=no-such/model     -> 502 {"error":"Ошибка провайдера openrouter: no-such/model:free is not a valid model ID"}
LLM_PROVIDER=gigachat       -> 500 {"error":"LLM_PROVIDER=\"gigachat\" не поддерживается. Доступно: openrouter"}
# next build + next start с фиктивным ключом: retrieval в прод-сборке нашёл 5 чанков, затем 401 -> 502, запись ok:false в usage.jsonl
```
**Итог:** эндпоинт возвращает валидный по `AssistResultSchema` ответ на реальной free-модели. `npm run typecheck`, `npm run lint` и `next build` проходят. Качество `client_reply` (r1 не ответил про доставку, r3 обещает возврат денег) зависит от промпта-заглушки и перейдёт к prompt-engineer. `.env.local` устарел: там `LLM_PROVIDER=openai`, `LLM_MODEL=gpt-4o-mini`, `EMBEDDING_MODEL=text-embedding-3-small`, его нужно обновить по `.env.example`. При проверке эти переменные переопределялись через окружение.

## [kb-builder] 2026-09-30 — база знаний O-complex и матрица допродаж
**Что сделал ИИ:** нашёл официальный сайт o-complex.com. Скачал `curl` каталог, 11 карточек товаров, 7 карточек наборов, 12 официальных инструкций, страницы «Доставка и оплата», «Контакты» и оферту, перевёл HTML в текст. Собрал `products.json` (11 товаров и 4 набора), `faq.md` (16 вопросов), `policies.md` (доставка, оплата, возврат, медицинские ограничения, тон, допродажи) и `upsell-matrix.json` (18 правил: логика через формат, курс, комплект и выгоду набора). Написал генератор `data/kb/tools/build-chunks.mjs`: он собирает `chunks.json` (49 чанков по 305–786 символов: 25 product, 16 faq, 8 policy) и сам проверяет длины, дубли id и покрытие товаров. Источники, допущения и расхождения на сайте описаны в `docs/kb-sources.md`, пять предложений по формату — в `docs/contract-changes.md`.
Проверка матрицы (`node -e`, id из `trigger_product_ids` и `offer_product_id` против `products.json`):
```
products: 15 | rules: 18 | chunks: 49
unknown ids in upsell-matrix: none
products without chunk: none
```
**Где ошибся / что пришлось поправить:**
- WebFetch отдаёт пересказ страницы маленькой моделью, а мне нужны точные цены и составы. Перешёл на `curl` и разбор текста своим скриптом.
- На карточках товаров противопоказаний нет, только общая строка в футере. Сначала решил, что везде будет «TODO», но нашёл страницы `/instrukcii/<slug>/`: у цеолита, Минерального комплекса и масок противопоказания там есть.
- Первая версия нарезки делила текст по точке и порвала e-mail `info@o-complex.com` на два чанка. Заметил только при чтении готовых чанков. Исправил правило границы предложения (точка + пробел + заглавная буква) и добавил проверку, что e-mail и «1 ст. ложка» остались целыми.
- Жадная склейка давала хвостовые чанки короче 300 символов. Заменил её на сбалансированное деление.
- Правка FAQ одной командой с кривым heredoc применилась дважды и задвоила предложение. Нашёл через grep и убрал.
- Сайт полон медицинских утверждений («выводит вирусы», «помогает избавиться от аллергии»). Их не переносил, схемы из «Методических рекомендаций» для заболеваний тоже. Наборы с «медицинскими» названиями («Антиаллергия», «Мощный иммунитет», «Планирование беременности») в базу не включил. Прошёл grep по стоп-словам, в базе их нет.
- Сначала написал, что цеолит «пищевой товар и возврату не подлежит». Это моя трактовка оферты, прямо она там не сказана, поэтому переформулировал в `TODO: проверить`.
**Итог:** база собрана с реального сайта, все id матрицы существуют в `products.json`, каждый товар есть в чанках, `npm run typecheck` и `npm run lint` проходят. Открытые TODO: актуальность цен, противопоказания и способ применения паст, бутылки и фильтра, совместимость с лекарствами, отнесение цеолита к продовольственным товарам при возврате.

## [prompt-engineer] 2026-09-30 — системный промпт v1, few-shot, eval-набор
**Что сделал ИИ:** написал `src/lib/prompts/system.ts` (`PROMPT_VERSION = "v1"`, сигнатура `buildSystemPrompt` сохранена, добавлены `buildUserMessage` и `escapeData`), `src/lib/prompts/few-shots.ts` (5 примеров на вымышленных `example-*` товарах, `FEW_SHOTS` + `fewShotMessages()`), `data/eval/schema.ts` (zod-схема набора), `data/eval/cases.json` (18 кейсов), `data/eval/validate.ts` (проверка набора, few-shot ответов по `AssistResponseSchema` и экранирования тегов), `docs/prompt-design.md`, 4 предложения в `docs/contract-changes.md`.
**Где ошибся / что пришлось поправить:**
- Первая версия `system.ts` реэкспортировала few-shot, а `few-shots.ts` импортирует из `system.ts`. Получался циклический импорт, реэкспорт убрал.
- Часть регулярок в `forbidden_patterns` срабатывала бы на правильные отказы («скидка не согласована», «не могу сказать, совместим ли»). Убрал их или добавил `(?<!не )`, смысловые запреты оставил LLM-судье.
- Правка JSON через `node -e` в bash сломалась на экранировании. Переделал через точечные правки файла.
- Негативный тест схемы (запрещённый upsell id, отсутствие TODO, дубль id, битый regex) проверил отдельным скриптом, все четыре ошибки ловятся.
**Итог:** `npx tsx data/eval/validate.ts` → OK (18 кейсов, few-shot валидны, инъекция закрывающим тегом обезврежена), `npm run typecheck` и `npm run lint` проходят. Ответы реальной модели ещё не проверялись: это прогон eval после появления ядра и базы.
