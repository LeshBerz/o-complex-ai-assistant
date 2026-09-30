/**
 * POST /api/amocrm/webhook?secret=... — приёмник вебхуков amoCRM.
 *
 * amoCRM ждёт ответ не дольше 2 секунд, иначе считает доставку неудачной и повторяет
 * (webhooks-format). Поэтому отвечаем 200 сразу, а контекст → assist() → примечание
 * выполняем в after() после отправки ответа.
 */
import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { getAmoConfig } from "@/lib/amocrm/config";
import { processWebhook } from "@/lib/amocrm/process";
import { parseBracketForm, WebhookPayloadSchema } from "@/lib/amocrm/webhook";

/** Сколько может жить обработка в after() на платформах, которые это учитывают */
export const maxDuration = 60;

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(request: NextRequest): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  const raw = await request.text();
  // Для ручной отладки принимаем и JSON (уже разобранное тело, как в data/amocrm-mock/*.json)
  if (type.includes("application/json")) return JSON.parse(raw);
  return parseBracketForm(new URLSearchParams(raw));
}

export async function POST(request: NextRequest) {
  const { webhookSecret } = getAmoConfig();
  if (!webhookSecret) {
    return Response.json({ error: "AMOCRM_WEBHOOK_SECRET не задан" }, { status: 503 });
  }
  if (!secretMatches(request.nextUrl.searchParams.get("secret"), webhookSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readBody(request);
  } catch {
    return Response.json({ error: "не удалось разобрать тело" }, { status: 400 });
  }

  const parsed = WebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "неверный формат вебхука", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const events =
    (payload.message?.add?.length ?? 0) +
    (payload.outgoing_message?.add?.length ?? 0) +
    (payload.leads?.add?.length ?? 0) +
    (payload.leads?.status?.length ?? 0);

  // Неподдерживаемые события подтверждаем 200, чтобы amoCRM не слал повторы
  if (events === 0) return Response.json({ ok: true, accepted: 0 });

  after(async () => {
    await processWebhook(payload);
  });

  return Response.json({ ok: true, accepted: events });
}
