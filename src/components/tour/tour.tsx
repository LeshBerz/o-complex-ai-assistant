"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, MousePointerClick, X } from "lucide-react";
import type { ResultState } from "@/components/result-panel";
import type { TourPlacement, TourStep } from "@/components/tour/steps";
import { Button, cn } from "@/components/ui";

/** Состояние демо, по которому экскурсия понимает, что пользователь сделал действие */
export type TourContext = {
  scenarioId: string;
  resultStatus: ResultState["status"];
  /** растёт на каждую отправку обращения */
  submitCount: number;
};

export type TourActions = {
  selectScenario: (id: string) => void;
  submit: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };
/** lost — элемент для подсветки так и не нашёлся, показываем окно по центру */
type Layout = { rect: Rect | null; lost: boolean; pop: { w: number; h: number } | null; vw: number; vh: number };

/** отступ рамки подсветки от элемента */
const PAD = 6;
/** расстояние от рамки до поповера */
const GAP = 14;
/** минимальный отступ поповера от края окна */
const EDGE = 12;
/** уже этого поповер становится нижним листом */
const SHEET_BREAKPOINT = 640;
const AUTO_ADVANCE_MS = 400;
const GLIDE_MS = 220;
/** скругление выреза, как у карточек (rounded-2xl) */
const RADIUS = 16;

export function Tour({
  steps,
  ctx,
  actions,
  onClose,
}: {
  steps: TourStep[];
  ctx: TourContext;
  actions: TourActions;
  onClose: () => void;
}) {
  // entry — состояние демо в момент входа на шаг: действие засчитывается, только если сделано на этом шаге
  const [nav, setNav] = useState({ index: 0, entry: { scenarioId: ctx.scenarioId, submitCount: ctx.submitCount } });
  const [layout, setLayout] = useState<Layout>({ rect: null, lost: false, pop: null, vw: 0, vh: 0 });
  const [glide, setGlide] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const preparedRef = useRef("");
  const titleId = useId();
  const bodyId = useId();
  const reducedMotion = usePrefersReducedMotion();

  const { index, entry } = nav;
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const loading = ctx.resultStatus === "loading";
  const resultMissing = step.needsResult && ctx.resultStatus !== "success";
  // при ошибке подсвечиваем колонку результата: там карточка ошибки с кнопкой «Повторить»
  const target = loading
    ? undefined
    : resultMissing
      ? ctx.resultStatus === "error"
        ? "result"
        : undefined
      : step.target;
  const isSheet = layout.vw > 0 && layout.vw < SHEET_BREAKPOINT;

  const action = step.action;
  const actionDone =
    action?.type === "select-scenario"
      ? ctx.scenarioId === action.scenarioId && entry.scenarioId !== action.scenarioId
      : action?.type === "submit"
        ? ctx.submitCount > entry.submitCount
        : false;

  function goTo(next: number) {
    if (next < 0) return;
    if (next >= steps.length) return onClose();
    setNav({ index: next, entry: { scenarioId: ctx.scenarioId, submitCount: ctx.submitCount } });
    setGlide(true);
  }

  function next() {
    // «Далее» делает действие за пользователя, чтобы запись не застряла
    if (action && !actionDone) {
      if (action.type === "select-scenario" && ctx.scenarioId !== action.scenarioId) {
        actions.selectScenario(action.scenarioId);
      }
      if (action.type === "submit" && (ctx.resultStatus === "empty" || ctx.resultStatus === "error")) {
        actions.submit();
      }
    }
    goTo(index + 1);
  }

  const advanceAfterAction = useEffectEvent(() => goTo(index + 1));
  useEffect(() => {
    if (!actionDone) return;
    const t = setTimeout(advanceAfterAction, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [actionDone]);

  useEffect(() => {
    if (!glide) return;
    const t = setTimeout(() => setGlide(false), GLIDE_MS + 30);
    return () => clearTimeout(t);
  }, [glide]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    // открыто окно «База знаний»: клавиши его, а не экскурсии
    if (el?.closest("dialog[open]")) return;
    const inField = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    if (e.key === "Escape" && el?.tagName !== "SELECT") {
      e.preventDefault();
      onClose();
    } else if (!inField && e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (!inField && e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Позиция элемента читается каждый кадр: так подсветка не отстаёт при скролле, ресайзе
  // и когда карточки результата меняют высоту.
  const prepareTarget = useEffectEvent((el: HTMLElement, key: string) => {
    if (preparedRef.current === key) return;
    preparedRef.current = key;
    if (step.openSources && el instanceof HTMLDetailsElement) el.open = true;
    if (window.innerWidth < SHEET_BREAKPOINT) {
      // нижний лист закрывает до 55% экрана: если элемент не виден над ним, поднимаем его к верхнему краю
      const r = el.getBoundingClientRect();
      if (r.top < EDGE || r.bottom > window.innerHeight * 0.45) {
        window.scrollTo({ top: Math.max(0, window.scrollY + r.top - EDGE) });
      }
    } else {
      // без smooth: прокрутка мгновенная, плавность даёт переезд подсветки
      el.scrollIntoView({ block: "nearest" });
    }
  });
  useEffect(() => {
    let raf = 0;
    let misses = 0;
    const tick = () => {
      const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
      if (el) prepareTarget(el, `${index}:${target}`);
      const r = el?.getBoundingClientRect();
      const rect = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      misses = el ? 0 : misses + 1;
      const p = popRef.current;
      const pop = p ? { w: p.offsetWidth, h: p.offsetHeight } : null;
      const nextLayout = { rect, lost: misses > 15, pop, vw: window.innerWidth, vh: window.innerHeight };
      setLayout((prev) => (sameLayout(prev, nextLayout) ? prev : nextLayout));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, index]);

  // фокус — в поповер на каждом шаге; после закрытия — туда, где был до экскурсии
  useEffect(() => {
    const prev = document.activeElement;
    return () => {
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);
  const shown = !loading && (!target || !!layout.rect || layout.lost);
  useEffect(() => {
    if (shown) popRef.current?.focus({ preventScroll: true });
  }, [index, shown]);

  if (loading) {
    return (
      <div
        role="status"
        className="tour-in fixed bottom-4 left-4 z-[70] flex items-center gap-2 rounded-full border border-stone-200 bg-white py-2 pr-2 pl-4 text-sm text-stone-600 shadow-lg"
      >
        <LoaderCircle className="size-4 animate-spin text-emerald-700" />
        Ассистент готовит ответ…
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть экскурсию"
          className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const content = (
    <TourCard
      step={step}
      index={index}
      total={steps.length}
      isLast={isLast}
      actionDone={actionDone}
      note={
        !resultMissing
          ? undefined
          : ctx.resultStatus === "error"
            ? "Сервис ответил ошибкой. Нажмите «Повторить» или переключитесь на «Мок» и отправьте ещё раз."
            : "Ответа пока нет: вернитесь на шаг отправки и нажмите «Получить подсказку»."
      }
      titleId={titleId}
      bodyId={bodyId}
      onBack={() => goTo(index - 1)}
      onNext={next}
      onClose={onClose}
    />
  );

  const dialogProps = {
    ref: popRef,
    role: "dialog",
    "aria-modal": false,
    "aria-labelledby": titleId,
    "aria-describedby": bodyId,
    tabIndex: -1,
  } as const;

  // элемент ещё ищем (первые кадры после смены шага)
  if (target && !layout.rect && !layout.lost) return null;

  // окно по центру: приветствие, финал или нет элемента для подсветки
  if (!target || !layout.rect) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/50 p-4">
        <div
          key={step.id}
          {...dialogProps}
          className="tour-in max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl outline-none"
        >
          {content}
        </div>
      </div>
    );
  }

  const rect = layout.rect;
  const spotlight = (
    <Spotlight rect={rect} vw={layout.vw} vh={layout.vh} glide={glide && !reducedMotion} />
  );

  if (isSheet) {
    return (
      <>
        {spotlight}
        <div
          key={step.id}
          {...dialogProps}
          className="tour-sheet-in fixed inset-x-0 bottom-0 z-[70] max-h-[55dvh] overflow-y-auto rounded-t-2xl border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(28,25,23,0.15)] outline-none"
        >
          {content}
        </div>
      </>
    );
  }

  const pos = layout.pop ? placePopover(rect, layout.pop, layout.vw, layout.vh, step.placement ?? "right") : null;

  return (
    <>
      {spotlight}
      <div
        key={step.id}
        {...dialogProps}
        className="tour-in fixed z-[70] w-[22.5rem] rounded-2xl border border-stone-200 bg-white shadow-xl outline-none"
        style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
      >
        {pos?.arrow && <Arrow side={pos.arrow.side} offset={pos.arrow.offset} />}
        {content}
      </div>
    </>
  );
}

/**
 * Затемнение с вырезом под элемент: SVG-путь с fill-rule evenodd.
 * Тень на 9999px дешевле написать, но браузер перерисовывает её тяжело и с артефактами.
 */
function Spotlight({ rect, vw, vh, glide }: { rect: Rect; vw: number; vh: number; glide: boolean }) {
  const x = rect.left - PAD;
  const y = rect.top - PAD;
  const w = rect.width + PAD * 2;
  const h = rect.height + PAD * 2;
  const r = Math.min(RADIUS, w / 2, h / 2);
  const hole =
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const transition = glide ? `all ${GLIDE_MS}ms ease-out` : undefined;
  return (
    <>
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-[60]" width={vw} height={vh}>
        <path
          fillRule="evenodd"
          fill="rgba(28, 25, 23, 0.55)"
          // d как CSS-свойство, чтобы вырез плавно переезжал между шагами
          style={{ d: `path("M0 0H${vw}V${vh}H0Z${hole}")`, transition } as CSSProperties}
        />
      </svg>
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60] ring-2 ring-emerald-400"
        style={{ top: y, left: x, width: w, height: h, borderRadius: r, transition }}
      />
    </>
  );
}

function TourCard({
  step,
  index,
  total,
  isLast,
  actionDone,
  note,
  titleId,
  bodyId,
  onBack,
  onNext,
  onClose,
}: {
  step: TourStep;
  index: number;
  total: number;
  isLast: boolean;
  actionDone: boolean;
  note?: string;
  titleId: string;
  bodyId: string;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative flex flex-col">
      <div className="space-y-3 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tabular-nums text-emerald-700">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть экскурсию"
            className="-mr-1.5 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            <X className="size-4" />
          </button>
        </div>
        <h2 id={titleId} className="text-base font-semibold text-stone-900">
          {step.title}
        </h2>
        <p id={bodyId} className="text-sm leading-relaxed text-stone-700">
          {step.body}
        </p>
        {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</p>}
        {step.action && !note && (
          <p
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
              actionDone ? "bg-stone-50 text-stone-500" : "bg-emerald-50 text-emerald-800",
            )}
          >
            {actionDone ? <Check className="size-4 shrink-0" /> : <MousePointerClick className="size-4 shrink-0" />}
            {step.action.hint}
          </p>
        )}
        {step.details.length > 0 && (
          <div className="border-t border-stone-100 pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">Под капотом</p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-stone-500">
              {step.details.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-stone-300" />
                  <span>{withCode(d)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center gap-2 rounded-b-2xl border-t border-stone-100 bg-white px-4 py-3">
        {!isLast && (
          <Button variant="ghost" onClick={onClose} className="text-stone-500">
            Пропустить
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {index > 0 && (
            <Button onClick={onBack} aria-label="Назад">
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Назад</span>
            </Button>
          )}
          <Button variant="primary" onClick={onNext}>
            {isLast ? "Готово" : "Далее"}
            {!isLast && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** `текст в обратных кавычках` → моноширинный */
function withCode(text: string): ReactNode[] {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-stone-100 px-1 py-px font-mono text-[11px] text-stone-700">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

function Arrow({ side, offset }: { side: TourPlacement; offset: number }) {
  // ромбик на стороне поповера, обращённой к элементу
  const base = "pointer-events-none absolute size-3 rotate-45 border-stone-200 bg-white";
  const bySide: Record<TourPlacement, { className: string; style: CSSProperties }> = {
    right: { className: "border-b border-l", style: { left: -6.5, top: offset - 6 } },
    left: { className: "border-t border-r", style: { right: -6.5, top: offset - 6 } },
    bottom: { className: "border-t border-l", style: { top: -6.5, left: offset - 6 } },
    top: { className: "border-b border-r", style: { bottom: -6.5, left: offset - 6 } },
  };
  const s = bySide[side];
  return <span aria-hidden className={cn(base, s.className)} style={s.style} />;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Поповер рядом с элементом: сначала предпочтительная сторона, потом остальные.
 * Если места нет ни с одной стороны, окно прижимается к правому нижнему углу без стрелки.
 */
function placePopover(
  r: Rect,
  pop: { w: number; h: number },
  vw: number,
  vh: number,
  preferred: TourPlacement,
): { top: number; left: number; arrow?: { side: TourPlacement; offset: number } } {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const order: TourPlacement[] = [preferred, ...(["right", "left", "bottom", "top"] as const).filter((p) => p !== preferred)];
  const sideY = () => clamp(cy - pop.h / 2, EDGE, vh - pop.h - EDGE);
  const sideX = () => clamp(cx - pop.w / 2, EDGE, vw - pop.w - EDGE);
  // стрелка указывает на центр видимой части элемента
  const visibleCy = (clamp(r.top, 0, vh) + clamp(r.top + r.height, 0, vh)) / 2;

  for (const side of order) {
    if (side === "right" && r.left + r.width + PAD + GAP + pop.w <= vw - EDGE) {
      const top = sideY();
      return { top, left: r.left + r.width + PAD + GAP, arrow: { side, offset: clamp(visibleCy - top, 18, pop.h - 18) } };
    }
    if (side === "left" && r.left - PAD - GAP - pop.w >= EDGE) {
      const top = sideY();
      return { top, left: r.left - PAD - GAP - pop.w, arrow: { side, offset: clamp(visibleCy - top, 18, pop.h - 18) } };
    }
    if (side === "bottom" && r.top + r.height + PAD + GAP + pop.h <= vh - EDGE) {
      const left = sideX();
      return { top: r.top + r.height + PAD + GAP, left, arrow: { side, offset: clamp(cx - left, 18, pop.w - 18) } };
    }
    if (side === "top" && r.top - PAD - GAP - pop.h >= EDGE) {
      const left = sideX();
      return { top: r.top - PAD - GAP - pop.h, left, arrow: { side, offset: clamp(cx - left, 18, pop.w - 18) } };
    }
  }
  return { top: vh - pop.h - EDGE, left: vw - pop.w - EDGE };
}

function sameLayout(a: Layout, b: Layout) {
  const r = (x: Rect | null) => (x ? `${Math.round(x.top)},${Math.round(x.left)},${Math.round(x.width)},${Math.round(x.height)}` : "");
  return (
    r(a.rect) === r(b.rect) &&
    a.lost === b.lost &&
    a.pop?.w === b.pop?.w &&
    a.pop?.h === b.pop?.h &&
    a.vw === b.vw &&
    a.vh === b.vh
  );
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
