/**
 * Локальные эмбеддинги через @huggingface/transformers. Зона backend-dev.
 * Модель по умолчанию — Xenova/multilingual-e5-small (dim 384).
 * У e5 обязательны префиксы: "query: " для запроса, "passage: " для чанков.
 */
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const DEFAULT_EMBEDDING_MODEL = "Xenova/multilingual-e5-small";

export function embeddingModelName(): string {
  return process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

// Синглтон на процесс: первая загрузка модели ~16 с, дальше — миллисекунды.
// Promise храним в globalThis, чтобы HMR в next dev не грузил модель заново.
const globalForEmbeddings = globalThis as typeof globalThis & {
  __embeddingPipeline?: { model: string; promise: Promise<FeatureExtractionPipeline> };
};

function getExtractor(): Promise<FeatureExtractionPipeline> {
  const model = embeddingModelName();
  const current = globalForEmbeddings.__embeddingPipeline;
  if (current && current.model === model) return current.promise;

  const promise = pipeline("feature-extraction", model, { dtype: "q8" });
  // Неудачную загрузку не кэшируем: следующий вызов попробует снова.
  promise.catch(() => {
    if (globalForEmbeddings.__embeddingPipeline?.promise === promise) {
      globalForEmbeddings.__embeddingPipeline = undefined;
    }
  });
  globalForEmbeddings.__embeddingPipeline = { model, promise };
  return promise;
}

async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([`query: ${text}`]);
  return vector;
}

export async function embedPassages(texts: string[]): Promise<number[][]> {
  return embed(texts.map((t) => `passage: ${t}`));
}

/** Векторы нормализованы, поэтому cosine = скалярное произведение */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: разная размерность ${a.length} и ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
