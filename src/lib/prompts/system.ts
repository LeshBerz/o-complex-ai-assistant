/**
 * Системный промпт ассистента. Зона prompt-engineer.
 * Сейчас заглушка: сигнатура зафиксирована, содержимое заменит prompt-engineer.
 */
import type { CustomerContext } from "@/lib/contracts";

export const PROMPT_VERSION = "v0-stub";

/** Фрагмент базы знаний, найденный retrieval */
export interface RetrievedChunk {
  id: string;
  text: string;
  source: string;
  type: "product" | "faq" | "policy" | "upsell";
  score?: number;
}

export interface SystemPromptInput {
  /** top-k чанков из retrieval */
  chunks: RetrievedChunk[];
  /** data/kb/upsell-matrix.json, сериализованный (подмешивается всегда) */
  upsellMatrix: string;
  /** data/kb/policies.md (подмешивается всегда) */
  policies: string;
  customer?: CustomerContext;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const kb = input.chunks.map((c) => `[${c.id}] ${c.text}`).join("\n");
  return [
    "Ты ассистент менеджера O-complex. TODO: полный промпт (prompt-engineer).",
    "## База знаний",
    kb,
    "## Политики",
    input.policies,
    "## Матрица допродаж",
    input.upsellMatrix,
    input.customer ? `## Клиент\n${JSON.stringify(input.customer)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
