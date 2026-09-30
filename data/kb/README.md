# Формат базы знаний

Зона ответственности: **kb-builder**. Формат менять только через тимлида (`docs/contract-changes.md`).

Общие правила:
- Всё, что взято с сайта O-complex, хранит `source_url`.
- Всё, что не подтверждено источником, помечается строкой `TODO: проверить` (в поле или в тексте).
- Никаких обещаний лечебного эффекта в текстах: только формулировки производителя.
- id: латиница, kebab-case, стабильные (на них ссылаются матрица допродаж, чанки и `past_purchases`).

| Файл | Что внутри | Кто читает |
|---|---|---|
| `products.json` | каталог товаров | retrieval (через chunks), UI, upsell |
| `upsell-matrix.json` | правила допродаж | LLM-слой (подмешивается всегда) |
| `faq.md` | частые вопросы | сборка chunks |
| `policies.md` | доставка, оплата, возврат, мед. дисклеймеры | сборка chunks + подмешивается всегда |
| `chunks.json` | нарезанные фрагменты для поиска | `scripts/build-index.ts` → `index.json` |
| `index.json` | эмбеддинги (генерируется, в git не попадает) | `src/lib/retrieval.ts` |

---

## products.json

Массив объектов:

```ts
{
  id: string;                 // "product-slug"
  name: string;               // название как на сайте
  aliases?: string[];         // как товар называют клиенты ("детокс-комплекс"); попадает в текст чанка и в поиск упоминаний
  category: string;           // например "детокс", "витамины" — как на сайте
  short_description: string;  // 1–2 предложения, формулировки производителя
  composition?: string;       // состав
  usage?: string;             // способ применения (как на сайте)
  contraindications?: string; // противопоказания (как на сайте); нет данных -> "TODO: проверить"
  price_rub?: number | null;  // null, если цена не подтверждена
  url: string;                // карточка товара
  source_url: string;         // откуда взяты данные
  todo?: string[];            // что осталось проверить
}
```

Пример (данные вымышлены и нужны только для иллюстрации формата):

```json
[
  {
    "id": "example-detox-complex",
    "name": "Пример: детокс-комплекс",
    "category": "детокс",
    "short_description": "TODO: проверить — описание с сайта",
    "composition": "TODO: проверить",
    "usage": "TODO: проверить",
    "contraindications": "Индивидуальная непереносимость компонентов, беременность и кормление грудью. TODO: проверить",
    "price_rub": null,
    "url": "https://example.com/product/example-detox-complex",
    "source_url": "https://example.com/product/example-detox-complex",
    "todo": ["цена", "состав"]
  }
]
```

## upsell-matrix.json

Массив правил. Допродажа предлагается **только** по этим правилам.

```ts
{
  id: string;                  // "upsell-001"
  trigger_product_ids: string[]; // товары, которые клиент купил/обсуждает (id из products.json)
  trigger_intents?: Intent[];  // необязательно: для каких intent правило уместно
  offer_product_id: string;    // что предложить (id из products.json)
  why: string;                 // логика для менеджера (без мед. обещаний)
  manager_phrase: string;      // готовая фраза менеджеру
  exclude_if?: ExcludeIf[];    // когда НЕ предлагать (словарь ниже)
  source_url?: string;         // если связка взята с сайта (комплекты, "с этим покупают")
}
```

`Intent` = `product_question | delivery_payment | contraindications | complaint | order | other` (см. `src/lib/contracts.ts`).

`ExcludeIf` — фиксированный словарь (проверяется zod-схемой в `src/lib/kb.ts`):

| значение | правило отключается, если |
|---|---|
| `complaint` | intent = complaint |
| `negative_sentiment` | sentiment = negative |
| `contraindications` | intent = contraindications или в обращении есть вопрос о здоровье |
| `needs_human` | обращение передаётся менеджеру (`needs_human = true`) |
| `minor` | речь о несовершеннолетнем (ребёнок, подросток, «сыну/дочке») |

Модель в ответе называет `upsell.rule_id` (id правила), backend проверяет правило целиком: триггер, `trigger_intents`, `exclude_if`, что `offer_product_id` не куплен ранее.

Пример:

```json
[
  {
    "id": "upsell-001",
    "trigger_product_ids": ["example-detox-complex"],
    "trigger_intents": ["product_question", "order"],
    "offer_product_id": "example-probiotic",
    "why": "Пример: товары входят в один комплект на сайте. TODO: проверить",
    "manager_phrase": "Кстати, к этому комплексу часто берут ... — рассказать подробнее?",
    "exclude_if": ["complaint", "negative_sentiment", "contraindications"]
  }
]
```

## faq.md

Markdown. Каждый вопрос — заголовок `## `, ответ — абзац под ним. В конце ответа строка `Источник: <url>`.

```md
## Как принимать детокс-комплекс?
TODO: проверить — ответ по данным сайта.
Источник: https://example.com/faq
```

## policies.md

Markdown, разделы `## Доставка`, `## Оплата`, `## Возврат и обмен`, `## Медицинские ограничения` (дисклеймер: не является лекарством, консультация врача при беременности, детям, хронических заболеваниях). Каждый раздел заканчивается строкой `Источник: <url>`.

## chunks.json

Фрагменты для векторного поиска: 300–800 символов, один смысловой блок на чанк.

```ts
{
  id: string;      // "<type>:<slug>[:n]" — например "product:example-detox-complex:1", "faq:kak-prinimat", "policy:delivery"
  text: string;    // самодостаточный текст (включает название товара/тему)
  source: string;  // url или путь к файлу базы ("data/kb/faq.md")
  type: "product" | "faq" | "policy" | "upsell";
  product_id?: string; // если чанк про конкретный товар
}
```

Пример:

```json
[
  {
    "id": "policy:delivery",
    "text": "Доставка O-complex: TODO: проверить — сроки и стоимость доставки по данным сайта.",
    "source": "data/kb/policies.md",
    "type": "policy"
  }
]
```

Именно эти `id` возвращаются в `AssistResponse.sources`.

## index.json (генерируется)

`npm run build-index` → `{ model: string, dim: number, built_at: string, items: { id, embedding: number[] }[] }`. Не коммитится.
