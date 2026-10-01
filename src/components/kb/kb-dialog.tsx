"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CircleAlert, ExternalLink, X } from "lucide-react";
import type { KbSummary } from "@/components/kb/kb-summary";
import { Badge, cn } from "@/components/ui";

type Tab = "products" | "faq" | "policies" | "rules";

const priceFormat = new Intl.NumberFormat("ru-RU");

/**
 * Окно «База знаний»: показывает, что база собрана с o-complex.com, а не придумана.
 * Нативный <dialog> + showModal(): ловушка фокуса, Esc и возврат фокуса — силами браузера.
 */
export function KbDialog({ kb, open, onClose }: { kb: KbSummary; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("products");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const todoCount = kb.products.reduce((n, p) => n + p.todo.length, 0);
  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "products", label: "Товары", count: kb.products.length },
    { id: "faq", label: "FAQ", count: kb.faq.length },
    { id: "policies", label: "Условия", count: kb.policies.length },
    { id: "rules", label: "Допродажи", count: kb.rules.length },
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby="kb-title"
      onClose={onClose}
      // клик по затемнению вокруг окна закрывает его
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="tour-in m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-2xl bg-white p-0 text-stone-800 shadow-xl backdrop:bg-stone-900/50 open:flex open:flex-col"
    >
      {open && (
        <>
          <header className="shrink-0 space-y-3 border-b border-stone-100 px-5 pt-4 pb-3 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id="kb-title" className="text-lg font-semibold text-stone-900">
                База знаний ассистента
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="-mr-1.5 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">
              Это не придуманный пример, а данные с официального сайта o-complex.com на {kb.collectedAt}: цены,
              инструкции, доставка, оплата, возврат. У каждой записи есть ссылка на страницу-источник. Чего на сайте
              нет, то не додумано, а помечено «проверить».
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="green">{kb.products.length} товаров и наборов</Badge>
              <Badge tone="green">{kb.faq.length} вопросов FAQ</Badge>
              <Badge tone="green">{kb.policies.length} разделов условий</Badge>
              <Badge tone="green">{kb.rules.length} правил допродаж</Badge>
              <Badge>{kb.chunkCount} фрагментов для поиска</Badge>
              {todoCount > 0 && <Badge tone="amber">{todoCount} пунктов на проверку</Badge>}
            </div>
          </header>

          <div role="tablist" aria-label="Разделы базы" className="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-100 px-3 sm:px-5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`kb-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="kb-panel"
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-2 py-2.5 sm:px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600",
                  tab === t.id
                    ? "border-emerald-700 text-emerald-800"
                    : "border-transparent text-stone-500 hover:text-stone-700",
                )}
              >
                {t.label} <span className="hidden text-stone-400 tabular-nums sm:inline">{t.count}</span>
              </button>
            ))}
          </div>

          <div id="kb-panel" role="tabpanel" aria-labelledby={`kb-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
            {tab === "products" && <Products kb={kb} />}
            {tab === "faq" && (
              <List>
                {kb.faq.map((f) => (
                  <Row key={f.id} title={f.question} source={f.source} />
                ))}
              </List>
            )}
            {tab === "policies" && (
              <List>
                {kb.policies.map((p) => (
                  <Row key={p.id} title={p.title} source={p.source} />
                ))}
              </List>
            )}
            {tab === "rules" && (
              <List>
                {kb.rules.map((r) => (
                  <li key={r.id} className="space-y-1 px-5 py-3 sm:px-6">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <code className="font-mono text-xs text-stone-400">{r.id}</code>
                      <span className="text-stone-600">{r.triggers.join(", ")}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-stone-400" aria-label="предложить" />
                      <span className="font-medium text-stone-900">{r.offer}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-stone-500">{r.why}</p>
                    {r.sourceUrl && <SourceLink source={r.sourceUrl} />}
                  </li>
                ))}
              </List>
            )}
          </div>

          <footer className="shrink-0 border-t border-stone-100 px-5 py-2.5 text-xs text-stone-400 sm:px-6">
            Файлы: <code className="font-mono">data/kb/products.json</code>, <code className="font-mono">faq.md</code>,{" "}
            <code className="font-mono">policies.md</code>, <code className="font-mono">upsell-matrix.json</code> → для
            поиска нарезаны на {kb.chunkCount} фрагментов (<code className="font-mono">chunks.json</code>)
          </footer>
        </>
      )}
    </dialog>
  );
}

function Products({ kb }: { kb: KbSummary }) {
  return (
    <List>
      {kb.products.map((p) => (
        <li key={p.id} className="space-y-1 px-5 py-3 sm:px-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-stone-900">
              {p.name} <span className="font-normal text-stone-400">· {p.category}</span>
            </p>
            <p className="shrink-0 text-sm tabular-nums text-stone-700">
              {p.priceRub !== null ? `${priceFormat.format(p.priceRub)} ₽` : "цена не подтверждена"}
            </p>
          </div>
          <SourceLink source={p.sourceUrl} />
          {p.todo.length > 0 && (
            <details className="text-xs text-amber-800">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                <CircleAlert className="size-3.5" />
                Проверить: {p.todo.length}
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900/80">
                {p.todo.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </List>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-stone-100">{children}</ul>;
}

function Row({ title, source }: { title: string; source: string }) {
  return (
    <li className="space-y-1 px-5 py-3 sm:px-6">
      <p className="text-sm text-stone-900">{title}</p>
      <SourceLink source={source} />
    </li>
  );
}

function SourceLink({ source }: { source: string }) {
  if (!/^https?:\/\//.test(source)) {
    // разделы «Тон общения» и «Допродажи» — правила ассистента, а не данные сайта
    return <p className="text-xs text-stone-400">Правило проекта, не с сайта</p>;
  }
  const label = source.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return (
    <a
      href={source}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-xs text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}
