import {
  AssistResultSchema,
  type AssistRequestInput,
  type AssistResult,
} from "@/lib/contracts";
import {
  mockAssistResult,
  mockAssistResultNeedsHuman,
  mockAssistResultRepeatBuyer,
} from "@/components/__mocks__/assist-response";

export type DataSource = "mock" | "api";

/** Какой мок-ответ показывать в режиме «Мок» */
export type MockVariant = "default" | "needs_human" | "repeat_buyer";

const mocks: Record<MockVariant, AssistResult> = {
  default: mockAssistResult,
  needs_human: mockAssistResultNeedsHuman,
  repeat_buyer: mockAssistResultRepeatBuyer,
};

/** Источник по умолчанию: NEXT_PUBLIC_USE_MOCK=1 включает мок. */
export const defaultDataSource: DataSource =
  process.env.NEXT_PUBLIC_USE_MOCK === "1" ? "mock" : "api";

const MOCK_DELAY_MS = 900;

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

async function fetchMock(
  variant: MockVariant,
  signal?: AbortSignal,
): Promise<AssistResult> {
  await wait(MOCK_DELAY_MS, signal);
  return mocks[variant];
}

async function fetchApi(req: AssistRequestInput, signal?: AbortSignal): Promise<AssistResult> {
  let res: Response;
  try {
    res = await fetch("/api/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error("Сервер недоступен. Проверьте, что приложение запущено.");
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Сервер ответил ${res.status} ${res.statusText}`.trim();
    throw new Error(message);
  }

  const parsed = AssistResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Ответ сервера не соответствует контракту AssistResult.");
  }
  return parsed.data;
}

export function requestAssist(
  req: AssistRequestInput,
  opts: { source: DataSource; mockVariant: MockVariant; signal?: AbortSignal },
): Promise<AssistResult> {
  return opts.source === "mock"
    ? fetchMock(opts.mockVariant, opts.signal)
    : fetchApi(req, opts.signal);
}
