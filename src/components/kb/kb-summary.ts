/**
 * Сводка базы знаний для окна «База знаний». Только для серверного кода (src/app/page.tsx):
 * JSON базы импортируется при сборке, клиенту уходит компактная сводка, а не 50 КБ чанков.
 * В клиентских компонентах — только `import type`.
 */
import { z } from "zod";
import { ChunkSchema, ProductSchema, UpsellRuleSchema } from "@/lib/kb";
import productsJson from "../../../data/kb/products.json";
import chunksJson from "../../../data/kb/chunks.json";
import upsellJson from "../../../data/kb/upsell-matrix.json";

export type KbSummary = {
  /** дата сбора — из шапок data/kb/faq.md и policies.md */
  collectedAt: string;
  chunkCount: number;
  products: {
    id: string;
    name: string;
    category: string;
    priceRub: number | null;
    sourceUrl: string;
    todo: string[];
  }[];
  faq: { id: string; question: string; source: string }[];
  policies: { id: string; title: string; source: string }[];
  rules: { id: string; triggers: string[]; offer: string; why: string; sourceUrl?: string }[];
};

export function buildKbSummary(): KbSummary {
  const products = z.array(ProductSchema).parse(productsJson);
  const chunks = z.array(ChunkSchema).parse(chunksJson);
  const rules = z.array(UpsellRuleSchema).parse(upsellJson);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  // политики нарезаны на несколько чанков (policy:returns:1, :2) — показываем раздел один раз
  const policies = new Map<string, { id: string; title: string; source: string }>();
  for (const c of chunks.filter((c) => c.type === "policy")) {
    const id = c.id.split(":").slice(0, 2).join(":");
    if (policies.has(id)) continue;
    // текст чанка начинается с «O-complex, доставка: …»
    const topic = c.text.match(/^O-complex,\s*([^:]+):/)?.[1] ?? id;
    policies.set(id, { id, title: topic.charAt(0).toUpperCase() + topic.slice(1), source: c.source });
  }

  return {
    collectedAt: "30.09.2026",
    chunkCount: chunks.length,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      priceRub: p.price_rub ?? null,
      sourceUrl: p.source_url,
      todo: p.todo ?? [],
    })),
    faq: chunks
      .filter((c) => c.type === "faq")
      .map((c) => ({
        id: c.id,
        question: c.text.match(/^Вопрос:\s*([\s\S]+?)\s*Ответ:/)?.[1] ?? c.id,
        source: c.source,
      })),
    policies: [...policies.values()],
    rules: rules.map((r) => ({
      id: r.id,
      triggers: r.trigger_product_ids.map(nameOf),
      offer: nameOf(r.offer_product_id),
      why: r.why,
      sourceUrl: r.source_url,
    })),
  };
}
