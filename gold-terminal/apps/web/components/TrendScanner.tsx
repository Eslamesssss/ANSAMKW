"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtPrice, stateBg } from "@/lib/format";
import type { Timeframe, TrendRow } from "@/lib/types";
import { Badge, Empty, Panel } from "./ui";

const rel = (a: number | null, b: number | null) => (a === null || b === null ? "·" : a > b ? ">" : a < b ? "<" : "=");

export function TrendScanner({ version, selected, onSelect }: { version: number; selected: Timeframe; onSelect: (tf: Timeframe) => void }) {
  const [rows, setRows] = useState<TrendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<TrendRow[]>("/api/trend")
        .then((r) => alive && (setRows(r), setError(null)))
        .catch((e) => alive && setError((e as Error).message));
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [version]);

  return (
    <Panel title="Trend scanner" right={<span className="text-[10.5px] text-ink-3">closed candles only</span>}>
      {!rows ? (
        <Empty>{error ?? "Loading…"}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-3">
                <th className="px-3 py-2 font-medium">TF</th>
                <th className="px-2 py-2 font-medium">State</th>
                <th className="px-2 py-2 text-right font-medium">Close</th>
                <th className="px-2 py-2 font-medium" title="Close vs EMA20 vs EMA50 vs EMA200">EMA stack</th>
                <th className="px-2 py-2 text-right font-medium">RSI14</th>
                <th className="px-2 py-2 text-right font-medium">ATR14</th>
                <th className="px-3 py-2 font-medium">Struct.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.timeframe} onClick={() => onSelect(r.timeframe)} className={`cursor-pointer border-t border-line/60 hover:bg-white/3 ${r.timeframe === selected ? "bg-gold/5" : ""}`} title={r.rules.join(" · ")}>
                  <td className="px-3 py-2 font-semibold text-ink">{r.timeframe}</td>
                  <td className="px-2 py-2">
                    <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${stateBg(r.state)}`}>{r.state === "insufficient_data" ? `warm-up ${r.barsUsed}/600` : r.state}</span>
                  </td>
                  <td className="num px-2 py-2 text-right text-ink">{fmtPrice(r.close)}</td>
                  <td className="num px-2 py-2 text-ink-2">
                    C{rel(r.close, r.ema20)}20{rel(r.ema20, r.ema50)}50{rel(r.ema50, r.ema200)}200
                  </td>
                  <td className={`num px-2 py-2 text-right ${r.rsi14 !== null && r.rsi14 >= 70 ? "text-bear" : r.rsi14 !== null && r.rsi14 <= 30 ? "text-bull" : "text-ink-2"}`}>{r.rsi14 === null ? "—" : r.rsi14.toFixed(1)}</td>
                  <td className="num px-2 py-2 text-right text-ink-2">{fmtPrice(r.atr14)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={r.structureTrend === "bullish" ? "bull" : r.structureTrend === "bearish" ? "bear" : "neutral"}>{r.structureTrend === "undetermined" ? "—" : r.structureTrend}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[10.5px] leading-snug text-ink-3">
            Bullish: close &gt; EMA20 &gt; EMA50 &gt; EMA200 and RSI14 ≥ 50. Bearish: the mirror with RSI14 ≤ 50. Otherwise neutral. Needs ≥ 600 closed bars.
          </p>
        </div>
      )}
    </Panel>
  );
}
