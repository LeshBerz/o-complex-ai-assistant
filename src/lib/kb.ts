/**
 * Загрузка базы знаний из data/kb/. Зона backend-dev.
 * Формат файлов описан в data/kb/README.md (зона kb-builder).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { IntentSchema } from "@/lib/contracts";

export const KB_DIR = path.join(process.cwd(), "data", "kb");

export const ChunkSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source: z.string(),
  type: z.enum(["product", "faq", "policy", "upsell"]),
  product_id: z.string().optional(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const ProductSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  category: z.string(),
  short_description: z.string(),
  composition: z.string().optional(),
  usage: z.string().optional(),
  contraindications: z.string().optional(),
  price_rub: z.number().nullable().optional(),
  url: z.string(),
  source_url: z.string(),
  todo: z.array(z.string()).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

export const UpsellRuleSchema = z.object({
  id: z.string().min(1),
  trigger_product_ids: z.array(z.string()),
  trigger_intents: z.array(IntentSchema).optional(),
  offer_product_id: z.string().min(1),
  why: z.string(),
  manager_phrase: z.string(),
  exclude_if: z.array(z.string()).optional(),
  source_url: z.string().optional(),
});
export type UpsellRule = z.infer<typeof UpsellRuleSchema>;

export interface KnowledgeBase {
  chunks: Chunk[];
  products: Product[];
  upsellMatrix: UpsellRule[];
  /** содержимое policies.md; пустая строка, если файла ещё нет */
  policies: string;
}

function readJson<T>(file: string, schema: z.ZodType<T>): T {
  const raw: unknown = JSON.parse(readFileSync(path.join(KB_DIR, file), "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`data/kb/${file}: неверный формат — ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

function readOptionalText(file: string): string {
  const full = path.join(KB_DIR, file);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

export function loadChunks(): Chunk[] {
  const chunks = readJson("chunks.json", z.array(ChunkSchema));
  const seen = new Set<string>();
  for (const c of chunks) {
    if (seen.has(c.id)) throw new Error(`data/kb: повторяющийся id чанка "${c.id}"`);
    seen.add(c.id);
  }
  return chunks;
}

let cached: KnowledgeBase | null = null;

/** База читается один раз на процесс */
export function getKnowledgeBase(): KnowledgeBase {
  if (!cached) {
    cached = {
      chunks: loadChunks(),
      products: readJson("products.json", z.array(ProductSchema)),
      upsellMatrix: readJson("upsell-matrix.json", z.array(UpsellRuleSchema)),
      policies: readOptionalText("policies.md"),
    };
  }
  return cached;
}
