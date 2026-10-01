"use client";

import { useRef, useState, type ReactNode } from "react";
import { BookOpenCheck, Compass, FlaskConical, Leaf, Server } from "lucide-react";
import type { AssistRequestInput, CustomerContext, DialogTurn } from "@/lib/contracts";
import { demoScenarios } from "@/components/demo-scenarios";
import { defaultDataSource, requestAssist, type DataSource, type MockVariant } from "@/components/assist-client";
import { ChatPanel } from "@/components/chat-panel";
import { ResultPanel, type ResultState } from "@/components/result-panel";
import { Button, cn } from "@/components/ui";
import { Tour } from "@/components/tour/tour";
import { tourSteps } from "@/components/tour/steps";
import { KbDialog } from "@/components/kb/kb-dialog";
import type { KbSummary } from "@/components/kb/kb-summary";

type PendingRequest = { req: AssistRequestInput; mockVariant: MockVariant };

export function AssistantDemo({ kb, autoStartTour = false }: { kb: KbSummary; autoStartTour?: boolean }) {
  // экскурсия идёт в «Моке», чтобы не тратить дневной лимит модели
  const [source, setSource] = useState<DataSource>(autoStartTour ? "mock" : defaultDataSource);
  const [scenarioId, setScenarioId] = useState("");
  const [history, setHistory] = useState<DialogTurn[]>([]);
  const [customer, setCustomer] = useState<CustomerContext | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<ResultState>({ status: "empty" });
  const [lastRequest, setLastRequest] = useState<PendingRequest | null>(null);
  const [submitCount, setSubmitCount] = useState(0);
  const [tour, setTour] = useState({ open: autoStartTour, run: 0 });
  const [kbOpen, setKbOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const scenario = demoScenarios.find((s) => s.id === scenarioId);

  function cancelInFlight() {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  async function run(pending: PendingRequest, from: DataSource = source) {
    cancelInFlight();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLastRequest(pending);
    setResult({ status: "loading" });

    try {
      const data = await requestAssist(pending.req, {
        source: from,
        mockVariant: pending.mockVariant,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult({ status: "success", result: data, isMock: from === "mock" });
    } catch (e) {
      if (controller.signal.aborted) return;
      setResult({
        status: "error",
        message: e instanceof Error ? e.message : "Неизвестная ошибка",
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function handleScenarioChange(id: string) {
    cancelInFlight();
    const next = demoScenarios.find((s) => s.id === id);
    setScenarioId(id);
    setHistory(next?.request.dialog_history ?? []);
    setCustomer(next?.request.customer_context);
    setDraft(next?.request.client_message ?? "");
    setResult({ status: "empty" });
    setLastRequest(null);
  }

  function handleSubmit() {
    const text = draft.trim();
    if (!text) return;
    const req: AssistRequestInput = {
      client_message: text,
      dialog_history: history,
      customer_context: customer,
    };
    setHistory([...history, { role: "client", text }]);
    setDraft("");
    setSubmitCount((n) => n + 1);
    void run({ req, mockVariant: scenario?.mockVariant ?? "default" });
  }

  function handleInsert(text: string) {
    setHistory((h) => [...h, { role: "manager", text }]);
    setResult({ status: "empty" });
  }

  function handleReset() {
    handleScenarioChange(scenarioId);
  }

  function startTour() {
    cancelInFlight();
    setSource("mock");
    handleScenarioChange("");
    setTour((t) => ({ open: true, run: t.run + 1 }));
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-700 p-2 text-white">
              <Leaf className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-stone-900">ИИ-ассистент менеджера</h1>
              <p className="text-xs text-stone-500">Ответ клиенту и подсказка по допродаже по базе знаний</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setKbOpen(true)} data-tour="kb-button">
              <BookOpenCheck className="size-4" />
              База знаний
            </Button>
            <Button variant="ghost" onClick={startTour} data-tour="tour-button">
              <Compass className="size-4" />
              Экскурсия
            </Button>
            <SourceToggle
              value={source}
              onChange={(s) => {
                cancelInFlight();
                setSource(s);
                if (result.status === "loading") setResult({ status: "empty" });
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:h-[calc(100dvh-4.25rem)] lg:flex-none lg:grid-cols-2 lg:gap-6">
        <ChatPanel
          scenarios={demoScenarios}
          scenarioId={scenarioId}
          onScenarioChange={handleScenarioChange}
          history={history}
          customer={customer}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
          onReset={handleReset}
          loading={result.status === "loading"}
        />
        <div data-tour="result" className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <ResultPanel
            state={result}
            onInsert={handleInsert}
            onRetry={() => lastRequest && void run(lastRequest)}
          />
        </div>
      </main>

      <KbDialog kb={kb} open={kbOpen} onClose={() => setKbOpen(false)} />

      {tour.open && (
        <Tour
          key={tour.run}
          steps={tourSteps}
          ctx={{ scenarioId, resultStatus: result.status, submitCount }}
          actions={{ selectScenario: handleScenarioChange, submit: handleSubmit }}
          onClose={() => setTour((t) => ({ ...t, open: false }))}
        />
      )}
    </div>
  );
}

function SourceToggle({ value, onChange }: { value: DataSource; onChange: (s: DataSource) => void }) {
  const options: Array<{ id: DataSource; label: string; icon: ReactNode }> = [
    { id: "mock", label: "Мок", icon: <FlaskConical className="size-3.5" /> },
    { id: "api", label: "API", icon: <Server className="size-3.5" /> },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Источник данных"
      data-tour="source-toggle"
      className="flex rounded-lg bg-stone-100 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors",
            value === o.id ? "bg-white text-emerald-800 shadow-sm" : "text-stone-500 hover:text-stone-700",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
