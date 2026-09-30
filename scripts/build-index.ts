/**
 * data/kb/chunks.json (+ chunks.dev.json при KB_DEV_FIXTURES=1) → эмбеддинги → data/kb/index.json.
 * Запуск: npm run build-index. Зона backend-dev.
 */
import { writeFileSync } from "node:fs";
import { loadChunks, devFixturesEnabled } from "@/lib/kb";
import { embedPassages, embeddingModelName } from "@/lib/embeddings";
import { INDEX_PATH, type IndexFile } from "@/lib/retrieval";

async function main() {
  const started = Date.now();
  const chunks = loadChunks();
  const model = embeddingModelName();
  console.log(`build-index: ${chunks.length} чанков, модель ${model}${devFixturesEnabled() ? ", с dev-фикстурами" : ""}`);

  const vectors = await embedPassages(chunks.map((c) => c.text));
  const dim = vectors[0]?.length ?? 0;

  const index: IndexFile = {
    model,
    dim,
    built_at: new Date().toISOString(),
    items: chunks.map((c, i) => ({ id: c.id, embedding: vectors[i] })),
  };
  writeFileSync(INDEX_PATH, JSON.stringify(index));
  console.log(`build-index: dim ${dim}, записано в data/kb/index.json за ${Date.now() - started} мс`);
}

main().catch((err: unknown) => {
  console.error("build-index:", err);
  process.exit(1);
});
