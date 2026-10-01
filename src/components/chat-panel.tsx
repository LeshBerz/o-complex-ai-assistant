"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle, MessageSquareText, RotateCcw, Send } from "lucide-react";
import type { CustomerContext, DialogTurn } from "@/lib/contracts";
import type { DemoScenario } from "@/components/demo-scenarios";
import { Badge, Button, Card, CardHeader, cn } from "@/components/ui";

type Props = {
  scenarios: DemoScenario[];
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  history: DialogTurn[];
  customer?: CustomerContext;
  draft: string;
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  loading: boolean;
};

export function ChatPanel({
  scenarios,
  scenarioId,
  onScenarioChange,
  history,
  customer,
  draft,
  onDraftChange,
  onSubmit,
  onReset,
  loading,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length, loading]);

  const canSubmit = draft.trim().length > 0 && !loading;

  return (
    <Card className="flex min-h-[32rem] flex-col lg:h-full lg:min-h-0">
      <CardHeader
        icon={<MessageSquareText className="size-4" />}
        title="Диалог с клиентом"
        aside={
          <Button variant="ghost" onClick={onReset} disabled={loading} title="Очистить диалог">
            <RotateCcw className="size-4" />
            <span className="hidden sm:inline">Сбросить</span>
          </Button>
        }
      />

      <div data-tour="scenario" className="space-y-3 border-b border-stone-100 px-5 py-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
          Сценарий
          <select
            value={scenarioId}
            onChange={(e) => onScenarioChange(e.target.value)}
            disabled={loading}
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-normal text-stone-800 focus:outline-2 focus:outline-emerald-600"
          >
            <option value="">Свой вопрос</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        {customer && (customer.name || customer.deal_status || customer.past_purchases?.length) ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
            <span>Клиент:</span>
            {customer.name && <Badge>{customer.name}</Badge>}
            {customer.deal_status && <Badge>Этап: {customer.deal_status}</Badge>}
            {customer.past_purchases?.length ? (
              <Badge tone="green">Покупки: {customer.past_purchases.join(", ")}</Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      <div data-tour="dialog" className="flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          className="max-h-[55dvh] flex-1 space-y-3 overflow-y-auto bg-stone-50/60 px-5 py-4 lg:max-h-none"
          aria-live="polite"
        >
          {history.length === 0 && (
            <p className="py-10 text-center text-sm text-stone-400">
              История диалога пуста. Выберите сценарий или напишите обращение клиента ниже.
            </p>
          )}
          {history.map((turn, i) => (
            <Message key={i} turn={turn} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <LoaderCircle className="size-3.5 animate-spin" />
              Ассистент готовит подсказку…
            </div>
          )}
        </div>

        <form
          className="flex flex-col gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }}
        >
          <label htmlFor="client-message" className="text-xs font-medium text-stone-500">
            Новое сообщение клиента
          </label>
          <textarea
            id="client-message"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canSubmit) {
                e.preventDefault();
                onSubmit();
              }
            }}
            rows={3}
            placeholder="Например: подскажите, как принимать комплекс?"
            className="resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-2 focus:outline-emerald-600"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="hidden text-xs text-stone-400 sm:inline">Ctrl + Enter — отправить</span>
            <Button type="submit" variant="primary" disabled={!canSubmit} className="ml-auto" data-tour="send">
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              Получить подсказку
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

function Message({ turn }: { turn: DialogTurn }) {
  const isManager = turn.role === "manager";
  return (
    <div className={cn("flex flex-col gap-1", isManager ? "items-end" : "items-start")}>
      <span className="px-1 text-[11px] text-stone-400">{isManager ? "Менеджер" : "Клиент"}</span>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isManager
            ? "rounded-br-sm bg-emerald-700 text-white"
            : "rounded-bl-sm border border-stone-200 bg-white text-stone-800",
        )}
      >
        {turn.text}
      </div>
    </div>
  );
}
