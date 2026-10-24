"use client";

import { fmtAge, fmtDateTime, fmtPrice, fmtSigned } from "@/lib/format";
import type { MarketView } from "@/lib/types";
import { useNow } from "@/lib/useTerminal";
import { Badge, Empty, KV, Panel } from "./ui";

const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));

export function DerivativesPanel({ market }: { market: MarketView | null }) {
  const now = useNow();
  if (!market) {
    return (
      <Panel title="Perpetual & order book">
        <Empty>No market state yet.</Empty>
      </Panel>
    );
  }
  const q = market.contract?.quoteAsset ?? "USDT";
  const m = market.mark;
  const f = market.funding;
  const oi = market.openInterest;
  const t = market.ticker;
  const r = market.regime;
  const nextFunding = f.nextFundingTime ? f.nextFundingTime - (market.origin === "fixture" && m ? m.exchangeTime + m.ageMs : now) : null;
  const rate = f.currentRate;

  return (
    <Panel
      title={<>Perpetual & order book · {market.symbol}</>}
      right={market.origin === "fixture" ? <Badge tone="warn">fixture</Badge> : <span className="text-[10.5px] text-ink-3">all prices in {q}</span>}
    >
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div>
          <div className="panel-title mb-1">Mark / index</div>
          <KV k={`Mark price`} v={fmtPrice(m?.markPrice)} />
          <KV k={`Index price`} v={fmtPrice(m?.indexPrice)} />
          <KV k="Basis (last − index)" v={market.basis !== null ? `${fmtSigned(market.basis)} (${market.basisBps!.toFixed(1)} bps)` : "—"} />
          <KV k="Mark − index" v={fmtSigned(market.markIndexSpread)} />
          <div className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-snug ${r.regime === "underlying_hours" ? "border-info/30 bg-info/5 text-ink-2" : "border-warn/30 bg-warn/5 text-warn"}`}>
            <span className="font-semibold">{r.regime === "underlying_hours" ? "Underlying hours." : "Off-hours index."}</span> {r.note}.
            {r.indexStaticForMs !== null && <> Index last changed {fmtAge(r.indexStaticForMs)} ago.</>}
          </div>
          {market.constituents && market.constituents.constituents.length > 0 && (
            <div className="mt-2 text-[10.5px] text-ink-3">
              Index sources:{" "}
              {market.constituents.constituents.map((c) => `${c.exchange} ${c.symbol}${c.weight !== null ? ` (${(c.weight * 100).toFixed(0)}w)` : ""}`).join(", ")}
            </div>
          )}
        </div>
        <div>
          <div className="panel-title mb-1">Funding & open interest</div>
          <KV k="Funding rate" v={rate !== null ? <span className={rate >= 0 ? "text-bull" : "text-bear"}>{(rate * 100).toFixed(4)}%</span> : "—"} />
          <KV k="Next funding" v={f.nextFundingTime ? `${fmtDateTime(f.nextFundingTime)} (${nextFunding !== null && nextFunding > 0 ? `in ${fmtAge(nextFunding)}` : "due"})` : "—"} />
          <KV k="Interval" v={f.intervalHours ? `${f.intervalHours}h${f.intervalSource === "history" ? " (from history)" : ""}` : "unknown"} />
          <KV k="Open interest" v={oi ? `${num(oi.openInterest, 3)} XAU` : "—"} />
          <KV k={`OI notional (${q})`} v={oi?.notionalUsdt != null ? num(oi.notionalUsdt, 0) : "—"} />
          <KV k="OI change 1h" v={oi?.change1h != null ? <span className={oi.change1h >= 0 ? "text-bull" : "text-bear"}>{fmtSigned(oi.change1h, 3)} XAU</span> : "—"} />
          <div className="panel-title mb-1 mt-3">24h</div>
          <KV k="Change" v={t ? <span className={t.priceChange >= 0 ? "text-bull" : "text-bear"}>{fmtSigned(t.priceChange)} ({fmtSigned(t.priceChangePercent, 2)}%)</span> : "—"} />
          <KV k="High / low" v={t ? `${fmtPrice(t.high)} / ${fmtPrice(t.low)}` : "—"} />
          <KV k="Volume" v={t ? `${num(t.volume, 3)} XAU · ${num(t.quoteVolume, 0)} ${q}` : "—"} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <div className="panel-title mb-1">Order book (top 10 of 20)</div>
            {market.depth?.imbalanceTop10 != null && (
              <span className={`num text-[11px] ${market.depth.imbalanceTop10 >= 0 ? "text-bull" : "text-bear"}`} title="(bid qty − ask qty) / total, top 10 levels">
                imbalance {fmtSigned(market.depth.imbalanceTop10, 2)}
              </span>
            )}
          </div>
          {market.depth ? <Ladder depth={market.depth} /> : <div className="text-[12px] text-ink-3">No depth data.</div>}
          {market.depth && <div className="num mt-1 text-[10.5px] text-ink-3">updated {fmtAge(market.depth.ageMs)} ago</div>}
        </div>
      </div>
    </Panel>
  );
}

function Ladder({ depth }: { depth: NonNullable<MarketView["depth"]> }) {
  const asks = depth.asks.slice(0, 10).reverse();
  const bids = depth.bids.slice(0, 10);
  const max = Math.max(...[...asks, ...bids].map(([, qty]) => qty), 1e-9);
  const row = (side: "ask" | "bid") => ([p, qty]: [number, number]) => (
    <div key={`${side}${p}`} className="relative flex justify-between px-1.5 py-[1px] text-[11.5px]">
      <div className={`absolute inset-y-0 right-0 ${side === "ask" ? "bg-bear/12" : "bg-bull/12"}`} style={{ width: `${(qty / max) * 100}%` }} />
      <span className={`num relative ${side === "ask" ? "text-bear" : "text-bull"}`}>{fmtPrice(p)}</span>
      <span className="num relative text-ink-2">{qty.toFixed(3)}</span>
    </div>
  );
  return (
    <div className="rounded border border-line bg-panel-2 py-1">
      {asks.map(row("ask"))}
      <div className="my-0.5 border-t border-line-2" />
      {bids.map(row("bid"))}
    </div>
  );
}
