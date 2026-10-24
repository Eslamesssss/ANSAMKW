"use client";

import { fmtDateTime, fmtPrice } from "@/lib/format";
import type { ChartData } from "@/lib/types";
import { Badge, Empty, Panel } from "./ui";

const KIND: Record<string, string> = { bos: "BOS", choch: "CHoCH", breakout: "Breakout", retest: "Retest", breakout_failed: "Failed breakout" };

export function StructurePanel({ data }: { data: ChartData | null }) {
  if (!data) return <Panel title="Market structure"><Empty>No structure data.</Empty></Panel>;
  const highs = data.swings.filter((s) => s.type === "high").slice(-3).reverse();
  const lows = data.swings.filter((s) => s.type === "low").slice(-3).reverse();
  const events = [...data.events].reverse().slice(0, 12);
  return (
    <Panel
      title={<>Market structure · {data.timeframe}</>}
      right={<Badge tone={data.structureTrend === "bullish" ? "bull" : data.structureTrend === "bearish" ? "bear" : "neutral"}>{data.structureTrend}</Badge>}
    >
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <div>
          <div className="panel-title mb-1.5">Confirmed swings</div>
          <ul className="space-y-1 text-[12px]">
            {[...highs, ...lows].sort((a, b) => b.openTime - a.openTime).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className={`w-10 font-semibold ${s.type === "high" ? "text-bear" : "text-bull"}`}>{s.label}</span>
                <span className="num text-ink">{fmtPrice(s.price)}</span>
                <span className="num text-[11px] text-ink-3" title="Confirmed after the right-side bars closed">✓ {fmtDateTime(s.confirmedAt)}</span>
              </li>
            ))}
            {!highs.length && !lows.length && <li className="text-ink-3">None yet</li>}
          </ul>
        </div>
        <div>
          <div className="panel-title mb-1.5">Support / resistance (USDT)</div>
          <ul className="space-y-1 text-[12px]">
            {data.levels.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <span className={`w-20 text-[11px] font-semibold uppercase ${l.role === "resistance" ? "text-bear" : "text-bull"}`}>{l.role}</span>
                <span className="num text-ink">{fmtPrice(l.price)}</span>
                <span className="num text-[11px] text-ink-3">{l.touches} touch{l.touches > 1 ? "es" : ""} · {fmtPrice(l.distance)} away</span>
              </li>
            ))}
            {!data.levels.length && <li className="text-ink-3">No levels</li>}
          </ul>
        </div>
        <div>
          <div className="panel-title mb-1.5">Recent events (bar close)</div>
          <ul className="max-h-48 space-y-1 overflow-y-auto pr-1 text-[12px]">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className={`font-semibold ${"direction" in e && e.direction === "bullish" ? "text-bull" : "text-bear"}`}>
                  {KIND[e.kind] ?? e.kind} {"direction" in e ? (e.direction === "bullish" ? "↑" : "↓") : ""}
                </span>
                <span className="num text-ink-2">{"level" in e ? fmtPrice(e.level) : ""}</span>
                <span className="num text-[11px] text-ink-3">{fmtDateTime(e.confirmedAt)}</span>
              </li>
            ))}
            {!events.length && <li className="text-ink-3">No events in window</li>}
          </ul>
        </div>
      </div>
      <p className="border-t border-line/60 px-4 py-2 text-[10.5px] text-ink-3">
        Pivots use 3 bars each side and are only marked once the 3rd right-side bar has closed; BOS/CHoCH/breakouts need a candle close beyond the level. Nothing repaints.
      </p>
    </Panel>
  );
}
