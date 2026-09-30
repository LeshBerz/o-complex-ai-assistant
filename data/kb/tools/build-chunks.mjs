// Собирает data/kb/chunks.json из products.json, faq.md и policies.md.
// Запуск: node data/kb/tools/build-chunks.mjs
// Падает с ошибкой, если чанк вне 300–800 символов или у заголовка нет slug.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KB = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN = 300;
const MAX = 800;

const FAQ_SLUGS = {
  "Как оформить заказ?": "kak-oformit-zakaz",
  "Как и за сколько доставляют заказ?": "dostavka-sroki",
  "Какие есть способы оплаты?": "sposoby-oplaty",
  "Как получить скидку или промокод?": "promokod-skidka",
  "Можно ли вернуть или обменять товар?": "vozvrat-obmen",
  "Чем отличаются ЦЕОЛИТ МИНИ, СТАНДАРТ и МАКС?": "zeolite-formaty",
  "Как принимать цеолит?": "kak-prinimat-zeolite",
  "Цеолит растворяется в воде?": "zeolite-rastvoryaetsya",
  "Как принимать Минеральный комплекс?": "kak-prinimat-mineral-complex",
  "Можно ли принимать цеолит вместе с лекарствами?": "sovmestimost-s-lekarstvami",
  "Можно ли при беременности, кормлении грудью или детям?": "beremennost-deti",
  "Какие противопоказания у продуктов?": "protivopokazaniya",
  "Как часто менять минеральные шарики в бутылке?": "zamena-sharikov",
  "Как ухаживать за сорбентом-очистителем для воды?": "uhod-za-filtrom",
  "Как хранить продукты?": "hranenie",
  "Как связаться с O-complex?": "kontakty",
};

const POLICY_SLUGS = {
  "Доставка": "delivery",
  "Оплата": "payment",
  "Возврат и обмен": "returns",
  "Медицинские ограничения": "medical",
  "Тон общения": "tone",
  "Допродажи": "upsell-rules",
};

/** Разбивает markdown на секции `## `: { title, body, source } */
function parseSections(md) {
  return md
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [title, ...rest] = block.trim().split("\n");
      const lines = rest.map((l) => l.trim()).filter(Boolean);
      const srcLine = lines.find((l) => l.startsWith("Источник:"));
      const body = lines.filter((l) => l !== srcLine).join(" ");
      return { title: title.trim(), body, source: srcLine?.replace("Источник:", "").trim() };
    });
}

// Граница предложения: знак конца + пробел + заглавная/цифра/кавычка.
// Так не рвутся e-mail, url и сокращения вида «1 ст. ложка».
const sentencesOf = (text) =>
  text.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z0-9«(`])/).map((s) => s.trim()).filter(Boolean);

/**
 * Делит предложения на n кусков примерно равной длины (с учётом префикса),
 * увеличивая n, пока каждый кусок не влезет в MAX.
 */
function splitBalanced(prefix, sentences) {
  const total = sentences.join(" ").length;
  for (let n = Math.max(1, Math.ceil((prefix.length + total) / MAX)); n <= sentences.length; n++) {
    const target = total / n;
    const parts = [];
    let cur = [];
    for (const s of sentences) {
      const len = cur.join(" ").length;
      if (cur.length && parts.length < n - 1 && len + s.length / 2 > target) {
        parts.push(cur.join(" "));
        cur = [];
      }
      cur.push(s);
    }
    parts.push(cur.join(" "));
    const texts = parts.map((p) => prefix + p);
    if (texts.every((t) => t.length <= MAX)) return texts;
  }
  throw new Error(`не удалось уложить в ${MAX} символов: ${prefix}`);
}

const chunks = [];

// ---------- товары ----------
const products = JSON.parse(readFileSync(join(KB, "products.json"), "utf8"));
for (const p of products) {
  const promo = (p.todo ?? []).join(" ").match(/цена с промокодом ([\d\s]+) ₽/)?.[1]?.trim();
  const price =
    p.price_rub == null
      ? "Цена: TODO: проверить."
      : `Цена на сайте: ${p.price_rub.toLocaleString("ru-RU")} ₽ без промокода` +
        (promo ? `, ${promo} ₽ с промокодом` : "") +
        " (данные на 2026-09-30).";
  const segments = [
    `Категория «${p.category}». ${p.short_description} ${price}`,
    p.composition && `Состав: ${p.composition}`,
    p.usage && `Как применять: ${p.usage}`,
    p.contraindications && `Противопоказания: ${p.contraindications}`,
  ].filter(Boolean);
  const title = p.aliases?.length ? `${p.name} (клиенты также называют: ${p.aliases.join(", ")})` : p.name;
  splitBalanced(`${title}. `, segments.flatMap(sentencesOf)).forEach((text, i) => {
    chunks.push({ id: `product:${p.id}:${i + 1}`, text, source: p.url, type: "product", product_id: p.id });
  });
}

// ---------- FAQ и политики ----------
for (const [file, type, slugs, prefixFn] of [
  ["faq.md", "faq", FAQ_SLUGS, (t) => `Вопрос: ${t} Ответ: `],
  ["policies.md", "policy", POLICY_SLUGS, (t) => `O-complex, ${t.toLowerCase()}: `],
]) {
  for (const sec of parseSections(readFileSync(join(KB, file), "utf8"))) {
    const slug = slugs[sec.title];
    if (!slug) throw new Error(`${file}: нет slug для заголовка «${sec.title}»`);
    const source = sec.source?.startsWith("http") ? sec.source : `data/kb/${file}`;
    const parts = splitBalanced(prefixFn(sec.title), sentencesOf(sec.body));
    parts.forEach((text, i) => {
      chunks.push({ id: parts.length > 1 ? `${type}:${slug}:${i + 1}` : `${type}:${slug}`, text, source, type });
    });
  }
}

// ---------- проверки ----------
const errors = [];
const ids = new Set();
for (const c of chunks) {
  if (ids.has(c.id)) errors.push(`дубль id ${c.id}`);
  ids.add(c.id);
  if (c.text.length < MIN || c.text.length > MAX) errors.push(`${c.id}: ${c.text.length} символов`);
}
for (const p of products) {
  if (!chunks.some((c) => c.product_id === p.id)) errors.push(`товар ${p.id} не попал в чанки`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

writeFileSync(join(KB, "chunks.json"), JSON.stringify(chunks, null, 2) + "\n");
const byType = chunks.reduce((a, c) => ({ ...a, [c.type]: (a[c.type] ?? 0) + 1 }), {});
console.log(`chunks.json: ${chunks.length} чанков`, byType);
