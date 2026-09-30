/**
 * Векторный поиск по базе знаний: cosine в памяти, top-k. Зона backend-dev.
 * Индекс строит `npm run build-index` → data/kb/index.json.
 * Если индекса нет или он устарел, недостающие векторы считаются на лету.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { KB_DIR, getKnowledgeBase, type Chunk } from "@/lib/kb";
import { cosine, embedPassages, embedQuery, embeddingModelName } from "@/lib/embeddings";
import type { RetrievedChunk } from "@/lib/prompts/system";

export const INDEX_PATH = path.join(KB_DIR, "index.json");

export const IndexFileSchema = z.object({
  model: z.string(),
  dim: z.number().int().positive(),
  built_at: z.string(),
  items: z.array(z.object({ id: z.string(), embedding: z.array(z.number()) })),
});
export type IndexFile = z.infer<typeof IndexFileSchema>;

export interface RetrieveOptions {
  /** сколько чанков вернуть максимум */
  k?: number;
  /** абсолютный порог cosine */
  minScore?: number;
  /** на сколько чанк может отставать от top-1 */
  maxGap?: number;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== "" ? value : fallback;
}

// Пороги подобраны на dev-фикстурах (6 чанков, см. docs/ai-log.md): у e5 баллы сжаты,
// релевантный top-1 0.78–0.89, запрос не по теме ≤0.72. minScore отсекает оффтоп,
// maxGap — шум рядом с top-1. Пересмотреть на реальной базе.
export const DEFAULTS = {
  k: 5,
  minScore: 0.75,
  maxGap: 0.04,
};

interface IndexedChunk {
  chunk: Chunk;
  embedding: number[];
}

const globalForIndex = globalThis as typeof globalThis & {
  __kbIndex?: Promise<IndexedChunk[]>;
};

function readIndexFile(model: string): Map<string, number[]> {
  if (!existsSync(INDEX_PATH)) {
    console.warn("[retrieval] data/kb/index.json не найден, эмбеддинги считаются на лету (npm run build-index)");
    return new Map();
  }
  const parsed = IndexFileSchema.safeParse(JSON.parse(readFileSync(INDEX_PATH, "utf8")));
  if (!parsed.success) {
    console.warn("[retrieval] index.json повреждён, пересчитываю на лету");
    return new Map();
  }
  if (parsed.data.model !== model) {
    console.warn(`[retrieval] index.json построен моделью ${parsed.data.model}, а сейчас ${model}; пересчитываю на лету`);
    return new Map();
  }
  return new Map(parsed.data.items.map((i) => [i.id, i.embedding]));
}

async function buildIndex(): Promise<IndexedChunk[]> {
  const { chunks } = getKnowledgeBase();
  const stored = readIndexFile(embeddingModelName());
  const missing = chunks.filter((c) => !stored.has(c.id));
  if (missing.length > 0 && stored.size > 0) {
    console.warn(`[retrieval] в index.json нет ${missing.length} чанк(ов), считаю на лету: ${missing.map((c) => c.id).join(", ")}`);
  }
  const fresh = await embedPassages(missing.map((c) => c.text));
  missing.forEach((c, i) => stored.set(c.id, fresh[i]));
  return chunks.map((chunk) => ({ chunk, embedding: stored.get(chunk.id)! }));
}

function getIndex(): Promise<IndexedChunk[]> {
  if (!globalForIndex.__kbIndex) {
    const promise = buildIndex();
    promise.catch(() => {
      if (globalForIndex.__kbIndex === promise) globalForIndex.__kbIndex = undefined;
    });
    globalForIndex.__kbIndex = promise;
  }
  return globalForIndex.__kbIndex;
}

/** Сбросить кэш индекса (после пересборки базы) */
export function resetIndexCache(): void {
  globalForIndex.__kbIndex = undefined;
}

export async function retrieve(query: string, options: RetrieveOptions = {}): Promise<RetrievedChunk[]> {
  const k = options.k ?? numberFromEnv("RETRIEVAL_TOP_K", DEFAULTS.k);
  const minScore = options.minScore ?? numberFromEnv("RETRIEVAL_MIN_SCORE", DEFAULTS.minScore);
  const maxGap = options.maxGap ?? numberFromEnv("RETRIEVAL_MAX_GAP", DEFAULTS.maxGap);

  const [index, q] = await Promise.all([getIndex(), embedQuery(query)]);
  const scored = index
    .map(({ chunk, embedding }) => ({ chunk, score: cosine(q, embedding) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0]?.score ?? 0;
  return scored
    .filter((s) => s.score >= minScore && top - s.score <= maxGap)
    .slice(0, k)
    .map(({ chunk, score }) => ({
      id: chunk.id,
      text: chunk.text,
      source: chunk.source,
      type: chunk.type,
      score: Math.round(score * 1000) / 1000,
    }));
}
