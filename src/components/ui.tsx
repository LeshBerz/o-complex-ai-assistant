"use client";

import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
  tour,
}: {
  className?: string;
  children: ReactNode;
  /** якорь для экскурсии: data-tour */
  tour?: string;
}) {
  return (
    <section
      data-tour={tour}
      className={cn(
        "rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  icon,
  title,
  aside,
}: {
  icon: ReactNode;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-stone-100 px-5 py-3">
      <h2 className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-stone-800">
        <span className="text-emerald-700">{icon}</span>
        {title}
      </h2>
      {aside}
    </header>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50",
  secondary:
    "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:text-stone-400",
  ghost: "text-stone-600 hover:bg-stone-100 disabled:text-stone-400",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "green" | "amber" | "red";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-stone-100 text-stone-600",
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-stone-200/70", className)} />;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API недоступен (не https / нет разрешения) — старый способ
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button onClick={copy} aria-live="polite">
      {copied ? <Check className="size-4 text-emerald-700" /> : <Copy className="size-4" />}
      {copied ? "Скопировано" : "Скопировать"}
    </Button>
  );
}
