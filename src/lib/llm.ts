/**
 * LLM-слой: выбор провайдера по env и структурированный вывод. Зона backend-dev.
 *
 * В AI SDK v7 `generateObject` помечен @deprecated, рекомендованный способ —
 * `generateText` с `output: Output.object({ schema })` (node_modules/ai/docs,
 * 03-ai-sdk-core/10-generating-structured-data.mdx).
 *
 * Новый провайдер (google, gigachat) добавляется одной записью в PROVIDERS,
 * assist.ts при этом не меняется.
 */
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { z } from "zod";

// ---------- Ошибки (route.ts маппит их в HTTP-коды) ----------

export class LlmConfigError extends Error {
  override name = "LlmConfigError";
}
export class LlmTimeoutError extends Error {
  override name = "LlmTimeoutError";
}
export class LlmCallError extends Error {
  override name = "LlmCallError";
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// ---------- Провайдеры ----------

type ProviderFactory = (modelId: string) => LanguageModel;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new LlmConfigError(`Не задана переменная окружения ${name}`);
  return value;
}

function listFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const PROVIDERS: Record<string, ProviderFactory> = {
  openrouter: (modelId) =>
    createOpenRouter({ apiKey: requireEnv("OPENROUTER_API_KEY") }).chat(modelId, {
      // free-модели часто отвечают 429 из общего пула: OpenRouter сам переключится
      // на следующую модель из списка в рамках одного запроса
      models: [modelId, ...listFromEnv("LLM_FALLBACK_MODELS")],
      // только провайдеры модели, которые поддерживают response_format (structured outputs)
      provider: { require_parameters: true },
      // чинит битый JSON (лишний markdown, запятые) на стороне OpenRouter
      plugins: [{ id: "response-healing" }],
      // free-модели рассуждающие: без ограничения тратят сотни токенов и секунды на reasoning
      reasoning: { effort: "low", exclude: true },
    }),
};

export interface ModelInfo {
  provider: string;
  modelId: string;
}

export function getModelInfo(): ModelInfo {
  const provider = (process.env.LLM_PROVIDER?.trim() || "openrouter").toLowerCase();
  if (!PROVIDERS[provider]) {
    throw new LlmConfigError(
      `LLM_PROVIDER="${provider}" не поддерживается. Доступно: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return { provider, modelId: requireEnv("LLM_MODEL") };
}

function getModel({ provider, modelId }: ModelInfo): LanguageModel {
  return PROVIDERS[provider](modelId);
}

// ---------- Структурированная генерация ----------

export interface GenerateStructuredParams<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  instructions: string;
  messages: ModelMessage[];
  /** таймаут на одну попытку */
  timeoutMs?: number;
  temperature?: number;
}

export interface GenerateStructuredResult<T> {
  object: T;
  usage: { inputTokens: number; outputTokens: number };
  model: ModelInfo;
  /** модель, которая реально ответила (может быть запасной из LLM_FALLBACK_MODELS) */
  servedModel: string;
  /** 1 или 2: вторая — повтор после невалидного ответа */
  attempts: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;

export async function generateStructured<T>(
  params: GenerateStructuredParams<T>,
): Promise<GenerateStructuredResult<T>> {
  const info = getModelInfo();
  const model = getModel(info);
  const timeoutMs = params.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const usage = { inputTokens: 0, outputTokens: 0 };

  // Одна повторная попытка только при невалидном ответе: лимит free-моделей 50 запросов в день.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const result = await generateText({
        model,
        instructions: params.instructions,
        messages: params.messages,
        output: Output.object({ schema: params.schema, name: params.schemaName }),
        temperature: params.temperature ?? 0.2,
        // сетевые ретраи SDK (429/5xx) не нужны: каждый тратит дневной лимит
        maxRetries: 0,
        abortSignal: signal,
      });
      usage.inputTokens += result.usage.inputTokens ?? 0;
      usage.outputTokens += result.usage.outputTokens ?? 0;
      return {
        object: result.output,
        usage,
        model: info,
        servedModel: result.response.modelId,
        attempts: attempt,
      };
    } catch (err) {
      if (signal.aborted) {
        throw new LlmTimeoutError(`Модель не ответила за ${timeoutMs} мс`);
      }
      if (NoObjectGeneratedError.isInstance(err)) {
        usage.inputTokens += err.usage?.inputTokens ?? 0;
        usage.outputTokens += err.usage?.outputTokens ?? 0;
        if (attempt === 1) {
          console.warn("[llm] невалидный ответ модели, повторяю:", err.cause ?? err.message);
          continue;
        }
        throw new LlmCallError(`Модель дважды вернула ответ не по схеме: ${err.message}`);
      }
      if (APICallError.isInstance(err)) {
        console.error(`[llm] ${info.provider} ${err.statusCode}:`, err.responseBody?.slice(0, 1000));
        throw new LlmCallError(`Ошибка провайдера ${info.provider}: ${err.message}`, err.statusCode);
      }
      throw err;
    }
  }
  // недостижимо: цикл либо возвращает результат, либо бросает ошибку
  throw new LlmCallError("generateStructured: попытки исчерпаны");
}
