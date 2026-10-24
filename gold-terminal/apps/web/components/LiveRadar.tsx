"use client";

import { fmtAge, fmtFull, fmtPrice, fmtSigned, fmtUtc } from "@/lib/format";
import type { TerminalState } from "@/lib/types";
import { useNow } from "@/lib/useTerminal";
import { Badge, Panel } from "./ui";

const FRESH: Record<string, { label: string; tone: "bull" | "warn" | "bear" | "neutral" }> = {
  fresh: { label: "Fresh", tone: "bull" },
  delayed: { label: "Delayed", tone: "warn" },
  stale: { label: "Stale", tone: "bear" },
  market_closed: { label: "Not trading", tone: "neutral" },
  no_data: { label: "No data", tone: "bear" },
};

export function LiveRadar({ state }: { state: TerminalState | null }) {
  const now = useNow(500);
  const p = state?.price;
  const s = state?.status;
  const has = p && p.price !== null;
  const elapsed = p?.clientAt && now ? Math.max(0, now - p.clientAt) : 0;
  const age = p?.ageMs != null ? p.ageMs + elapsed : null;
  const tradeAge = p?.lastTradeAgeMs != null ? p.lastTradeAgeMs + elapsed : null;
  const freshness = FRESH[p?.freshness ?? "no_data"]!;
  const up = (p?.change ?? 0) >= 0;
  const q = p?.quoteAsset ?? "USDT";
  const contract = s?.contract;
  const regime = s?.regime;

  return (
    <Panel
      title={<>Live Radar · XAUUSDT Perp · Binance USDⓈ-M</>}
      right={
        <>
          <Badge tone={freshness.tone}>{freshness.label}</Badge>
          {contract && <Badge tone={contract.status === "TRADING" ? "bull" : "warn"}>{contract.status}</Badge>}
          {regime && (
            <Badge tone={regime.regime === "underlying_hours" ? "info" : "warn"} className="normal-case">
              {regime.regime === "underlying_hours" ? "Index: underlying hours" : regime.indexStatic ? "Index: static (holiday?)" : `Index: off-hours (${regime.scheduled.replace("_", " ")})`}
            </Badge>
          )}
        </>
      }
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(260px,1.2fr)_2fr]">
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-ink-3">Last trade ({q})</div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`num text-[34px] font-semibold leading-none tracking-tight sm:text-[40px] ${has ? (freshness.tone === "bear" ? "text-ink-3" : "text-ink") : "text-ink-3"}`}>{has ? fmtPrice(p!.price) : "—"}</span>
            {has && p!.change !== null && (
              <span className={`num text-[15px] font-medium ${up ? "text-bull" : "text-bear"}`}>
                {fmtSigned(p!.change)} ({fmtSigned(p!.changePct, 2)}%) <span className="text-[11px] text-ink-3">24h</span>
              </span>
            )}
          </div>
          <div className="num mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <Quote label={`Bid (${q})`} value={p?.bid} qty={p?.bidQty} tone="text-bull" />
            <Quote label="Spread" value={p?.spread} sub={p?.spreadBps != null ? `${p.spreadBps.toFixed(2)} bps` : undefined} />
            <Quote label={`Ask (${q})`} value={p?.ask} qty={p?.askQty} tone="text-bear" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
            {has ? (
              <>
                Best bid/ask from the Binance order book; a quote, not a guaranteed fill. Gold/USDT TradFi perpetual: not spot XAU/USD, PAXG or XAUT.
              </>
            ) : state?.startupProblem ? (
              state.startupProblem
            ) : (
              "Waiting for the first trade from Binance."
            )}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
          <Cell k={`Mark (${q})`} v={fmtPrice(p?.markPrice)} />
          <Cell k={`Index (${q})`} v={fmtPrice(p?.indexPrice)} sub={regime ? (regime.regime === "underlying_hours" ? "underlying-market method" : "off-hours method") : undefined} />
          <Cell k="Source" v={p?.source ?? "—"} />
          <Cell k="Last trade time" v={fmtFull(p?.providerTime)} sub={fmtUtc(p?.providerTime)} />
          <Cell k="Feed age (any stream)" v={fmtAge(age)} tone={freshness.tone} sub={`last trade ${fmtAge(tradeAge)} ago`} />
          <Cell k="Avg feed latency" v={s?.feed.avgLatencyMs != null ? fmtAge(s.feed.avgLatencyMs) : "—"} sub={s?.feed.clockOffsetMs != null ? `clock offset ${Math.round(s.feed.clockOffsetMs)}ms corrected` : "exchange event time → receipt"} />
          <Cell k="Connection" v={state?.connection ?? "—"} sub={s?.connectionDetail ?? undefined} />
          <Cell k="Trades / msgs" v={s ? `${s.feed.distinctUpdates} / ${s.feed.messages}` : "—"} sub={s ? `${s.feed.duplicates} repeats ignored` : undefined} />
          <Cell k="Contract" v={contract ? `${contract.symbol} ${contract.contractType}` : "unverified"} sub={contract ? `tick ${contract.tickSize} · step ${contract.stepSize} · settle ${contract.marginAsset}` : undefined} />
        </div>
      </div>
    </Panel>
  );
}

function Quote({ label, value, qty, sub, tone = "text-ink" }: { label: string; value: number | null | undefined; qty?: number | null; sub?: string; tone?: string }) {
  return (
    <div className="rounded border border-line bg-panel-2 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`text-[14px] font-semibold ${tone}`}>{fmtPrice(value)}</div>
      <div className="text-[10.5px] text-ink-3">{qty != null ? `qty ${qty}` : (sub ?? " ")}</div>
    </div>
  );
}

function Cell({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  const color = tone === "bear" ? "text-bear" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="min-w-0 py-1.5">
      <div className="text-[10.5px] uppercase tracking-wider text-ink-3">{k}</div>
      <div className={`num truncate text-[12.5px] ${color}`} title={v}>
        {v}
      </div>
      {sub && (
        <div className="truncate text-[10.5px] text-ink-3" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}
