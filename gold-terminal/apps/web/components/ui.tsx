import type { ReactNode } from "react";

export function Panel({ title, right, children, className = "", bodyClassName = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5">
        <h2 className="panel-title flex items-center gap-2">{title}</h2>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </header>
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "bull" | "bear" | "gold" | "warn" | "info" | "danger"; className?: string }) {
  const tones = {
    neutral: "border-line-2 bg-white/4 text-ink-2",
    bull: "border-bull/35 bg-bull/10 text-bull",
    bear: "border-bear/35 bg-bear/10 text-bear",
    gold: "border-gold/40 bg-gold/10 text-gold-2",
    warn: "border-warn/40 bg-warn/10 text-warn",
    info: "border-info/40 bg-info/10 text-info",
    danger: "border-bear/50 bg-bear/15 text-bear",
  } as const;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${tones[tone]} ${className}`}>{children}</span>;
}

export function Dot({ tone }: { tone: "bull" | "bear" | "warn" | "neutral" | "info" }) {
  const c = { bull: "bg-bull", bear: "bg-bear", warn: "bg-warn", neutral: "bg-ink-3", info: "bg-info" }[tone];
  return <span className={`inline-block h-2 w-2 rounded-full ${c} ${tone === "bull" ? "pulse" : ""}`} />;
}

export function KV({ k, v, mono = true }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12.5px]">
      <span className="text-ink-3">{k}</span>
      <span className={`truncate text-right text-ink ${mono ? "num" : ""}`}>{v}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-[12.5px] text-ink-3">{children}</div>;
}

export function Button({ children, onClick, disabled, tone = "default", type = "button", title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "default" | "gold" | "danger"; type?: "button" | "submit"; title?: string }) {
  const tones = {
    default: "border-line-2 bg-panel-2 text-ink hover:border-ink-3",
    gold: "border-gold/50 bg-gold/15 text-gold-2 hover:bg-gold/25",
    danger: "border-bear/40 bg-bear/10 text-bear hover:bg-bear/20",
  } as const;
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}>
      {children}
    </button>
  );
}
