"use client";

import { fmtAge, fmtDateTime } from "@/lib/format";
import type { TerminalState } from "@/lib/types";
import { Badge, Empty, KV, Panel } from "./ui";

export function SourceStatus({ state }: { state: TerminalState | null }) {
  const s = state?.status;
  return (
    <Panel title="Data source status" right={s ? <Badge tone={s.origin === "fixture" ? "warn" : "gold"}>{s.provider}</Badge> : null}>
      {!s ? (
        <Empty>{state?.startupProblem ?? "Market engine not running."}</Empty>
      ) : (
        <div className="space-y-3 p-4">
          <div>
            <KV k="Origin" v={s.origin === "fixture" ? "FIXTURE (not live)" : "Binance USDⓈ-M Futures (public)"} />
            <KV k="Instrument" v={s.contract ? `${s.contract.symbol} · ${s.contract.baseAsset}/${s.contract.quoteAsset} · settles ${s.contract.marginAsset}` : "not verified"} />
            <KV k="Exchange status" v={s.contract?.status ?? "—"} />
            <KV k="Spec checked" v={fmtDateTime(s.contractCheckedAt)} />
            <KV k="Index regime" v={s.regime.regime === "underlying_hours" ? "underlying hours" : "off-hours method"} />
            {s.credits && (
              <KV
                k="Request weight (1m)"
                v={`${Math.max(s.credits.usedLocal, s.credits.usedServer)} / ${s.credits.safetyCap} (limit ${s.credits.limitPerMinute})${s.credits.blockReason ? ` · blocked: ${s.credits.blockReason}` : ""}`}
              />
            )}
            <KV k="Clock offset" v={s.feed.clockOffsetMs != null ? `${Math.round(s.feed.clockOffsetMs)} ms` : "—"} />
          </div>
          <div>
            <div className="panel-title mb-1">WebSocket streams</div>
            <table className="w-full text-[12px]">
              <tbody>
                {s.streams.map((h) => (
                  <tr key={h.stream} className="border-t border-line/60">
                    <td className="py-1 font-semibold text-ink-2">{h.stream}</td>
                    <td className="num py-1 text-ink-2">{h.messages}</td>
                    <td className="num py-1 text-ink-2">{h.ageMs === null ? "never" : `${fmtAge(h.ageMs)} ago`}</td>
                    <td className="py-1 text-right">
                      <Badge tone={!h.stale ? "bull" : h.stream === "trade" ? "neutral" : "warn"}>{!h.stale ? "live" : h.stream === "trade" ? "quiet" : "stale"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="panel-title mb-1">Candles (closed)</div>
            <table className="w-full text-[12px]">
              <tbody>
                {s.timeframes.map((t) => (
                  <tr key={t.timeframe} className="border-t border-line/60">
                    <td className="py-1 font-semibold text-ink-2">{t.timeframe}</td>
                    <td className="num py-1 text-ink-2">{t.bars}</td>
                    <td className="num py-1 text-ink-2">{fmtDateTime(t.lastClosedOpenTime)}</td>
                    <td className="py-1 text-right">
                      <Badge tone={t.lastStatus === "confirmed" ? "bull" : t.lastStatus === "derived" ? "info" : "neutral"}>{t.lastStatus ?? "none"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[10.5px] leading-snug text-ink-3">confirmed = final Binance kline (stream or REST), cross-checked over REST · derived = aggregated from confirmed 1m bars. Times in Africa/Cairo.</p>
          </div>
          {s.pendingConfirmations.length > 0 && (
            <div className="text-[11.5px] text-ink-3">REST cross-checks queued: {s.pendingConfirmations.map((p) => `${p.timeframe} ${fmtDateTime(p.openTime)}`).join(", ")}</div>
          )}
          {s.dataQuality.length > 0 && (
            <ul className="space-y-1 rounded-md border border-warn/30 bg-warn/5 p-2 text-[11.5px] text-warn">
              {s.dataQuality.map((q) => (
                <li key={q}>• {q}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
