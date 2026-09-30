"use client";

import {
  Ban,
  BookOpen,
  ChevronDown,
  CircleAlert,
  CornerDownLeft,
  Headset,
  RotateCcw,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import type { AssistResult, Intent, Sentiment } from "@/lib/contracts";
import { Badge, Button, Card, CardHeader, CopyButton, Skeleton } from "@/components/ui";

const intentLabels: Record<Intent, string> = {
  product_question: "Вопрос о товаре",
  delivery_payment: "Доставка и оплата",
  contraindications: "Противопоказания",
  complaint: "Жалоба",
  order: "Заказ",
  other: "Другое",
};

const sentimentLabels: Record<Sentiment, { label: string; tone: "green" | "neutral" | "red" }> = {
  positive: { label: "Позитивный", tone: "green" },
  neutral: { label: "Нейтральный", tone: "neutral" },
  negative: { label: "Негативный", tone: "red" },
};

export type ResultState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; result: AssistResult; isMock: boolean };

export function ResultPanel({
  state,
  onInsert,
  onRetry,
}: {
  state: ResultState;
  onInsert: (text: string) => void;
  onRetry: () => void;
}) {
  switch (state.status) {
    case "empty":
      return <EmptyState />;
    case "loading":
      return <LoadingState />;
    case "error":
      return <ErrorState message={state.message} onRetry={onRetry} />;
    case "success":
      return <SuccessState result={state.result} isMock={state.isMock} onInsert={onInsert} />;
  }
}

function EmptyState() {
  return (
    <Card className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 border-dashed px-8 text-center">
      <div className="rounded-full bg-emerald-50 p-3 text-emerald-700">
        <Sparkles className="size-6" />
      </div>
      <p className="text-sm font-medium text-stone-700">Здесь появится подсказка ассистента</p>
      <p className="max-w-sm text-sm text-stone-500">
        Выберите сценарий или введите обращение клиента и нажмите «Получить подсказку». Ассистент
        предложит ответ клиенту и идею для допродажи.
      </p>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загрузка ответа">
      <Card>
        <CardHeader icon={<Sparkles className="size-4" />} title="Ответ клиенту" />
        <div className="space-y-2.5 p-5">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Card>
      <Card>
        <CardHeader icon={<ShoppingBag className="size-4" />} title="Подсказка по допродаже" />
        <div className="space-y-2.5 p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-rose-200">
      <div className="flex flex-col items-start gap-3 p-5" role="alert">
        <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
          <CircleAlert className="size-4" />
          Не удалось получить подсказку
        </div>
        <p className="text-sm text-stone-600">{message}</p>
        <Button onClick={onRetry}>
          <RotateCcw className="size-4" />
          Повторить
        </Button>
      </div>
    </Card>
  );
}

function SuccessState({
  result,
  isMock,
  onInsert,
}: {
  result: AssistResult;
  isMock: boolean;
  onInsert: (text: string) => void;
}) {
  const { response, meta } = result;
  const sentiment = sentimentLabels[response.sentiment];

  return (
    <div className="space-y-4">
      {response.needs_human && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5"
        >
          <Headset className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Нужен менеджер</p>
            <p className="text-sm text-amber-800">
              {response.needs_human_reason ?? "Ассистент рекомендует подключить менеджера."}
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          icon={<Sparkles className="size-4" />}
          title="Ответ клиенту"
          aside={
            <div className="flex flex-wrap justify-end gap-1.5">
              <Badge>{intentLabels[response.intent]}</Badge>
              <Badge tone={sentiment.tone}>{sentiment.label}</Badge>
            </div>
          }
        />
        <div className="space-y-4 p-5">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
            {response.client_reply}
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={response.client_reply} />
            <Button variant="primary" onClick={() => onInsert(response.client_reply)}>
              <CornerDownLeft className="size-4" />
              Вставить в чат
            </Button>
          </div>
        </div>
      </Card>

      <UpsellCard upsell={response.upsell} />

      <details className="group rounded-2xl border border-stone-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm text-stone-600 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <BookOpen className="size-4 text-stone-400" />
            Источники и метрики
            {isMock && <Badge tone="amber">мок</Badge>}
          </span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-stone-100 px-5 py-4 text-sm">
          <dt className="text-stone-500">Источники</dt>
          <dd className="flex flex-wrap gap-1.5">
            {response.sources.length ? (
              response.sources.map((s) => (
                <code key={s} className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-700">
                  {s}
                </code>
              ))
            ) : (
              <span className="text-stone-400">нет</span>
            )}
          </dd>
          <dt className="text-stone-500">Токены</dt>
          <dd className="text-stone-700">
            {meta.usage.inputTokens} вход / {meta.usage.outputTokens} выход
          </dd>
          <dt className="text-stone-500">Время ответа</dt>
          <dd className="text-stone-700">{formatLatency(meta.latency_ms)}</dd>
          <dt className="text-stone-500">Версия промпта</dt>
          <dd>
            <code className="font-mono text-xs text-stone-700">{meta.prompt_version}</code>
          </dd>
        </dl>
      </details>
    </div>
  );
}

function UpsellCard({ upsell }: { upsell: AssistResult["response"]["upsell"] }) {
  if (!upsell.recommended) {
    return (
      <Card>
        <CardHeader icon={<ShoppingBag className="size-4" />} title="Подсказка по допродаже" />
        <div className="flex items-start gap-3 p-5">
          <Ban className="mt-0.5 size-5 shrink-0 text-stone-400" />
          <div>
            <p className="text-sm font-medium text-stone-700">Допродажа сейчас не рекомендуется</p>
            <p className="text-sm text-stone-500">{upsell.why}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={<ShoppingBag className="size-4" />}
        title="Подсказка по допродаже"
        aside={<Badge tone="green">Рекомендуется</Badge>}
      />
      <div className="space-y-3 p-5">
        <p className="text-base font-semibold text-stone-900">
          {upsell.product_name ?? upsell.product_id ?? "Товар не указан"}
        </p>
        {upsell.rule_id && (
          <p className="-mt-2 text-xs text-stone-400">Правило матрицы: {upsell.rule_id}</p>
        )}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Почему подходит</p>
          <p className="text-sm text-stone-700">{upsell.why}</p>
        </div>
        {upsell.manager_phrase && (
          <div className="rounded-xl bg-emerald-50 p-3.5">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-800/70">
              Фраза для менеджера
            </p>
            <p className="text-sm italic text-emerald-950">«{upsell.manager_phrase}»</p>
            <div className="mt-2.5">
              <CopyButton text={upsell.manager_phrase} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function formatLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} с` : `${Math.round(ms)} мс`;
}
