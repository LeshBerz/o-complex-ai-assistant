/**
 * POST /api/assist: AssistRequest → AssistResult ({ response, meta }). Зона backend-dev.
 * Ошибки: 400 — невалидный вход, 502 — ошибка модели, 504 — таймаут, 500 — конфигурация/прочее.
 * Тело ошибки: { error: string }.
 */
import { z } from "zod";
import { AssistRequestSchema } from "@/lib/contracts";
import { assist } from "@/lib/assist";
import { LlmCallError, LlmConfigError, LlmTimeoutError } from "@/lib/llm";

// onnxruntime-node (локальные эмбеддинги) работает только в Node.js
export const runtime = "nodejs";

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Тело запроса должно быть JSON");
  }

  const parsed = AssistRequestSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, `Невалидный запрос: ${z.prettifyError(parsed.error)}`);
  }

  try {
    return Response.json(await assist(parsed.data));
  } catch (err) {
    if (err instanceof LlmTimeoutError) return error(504, err.message);
    if (err instanceof LlmCallError) return error(502, err.message);
    if (err instanceof LlmConfigError) return error(500, err.message);
    console.error("[api/assist]", err);
    return error(500, "Внутренняя ошибка сервиса");
  }
}
