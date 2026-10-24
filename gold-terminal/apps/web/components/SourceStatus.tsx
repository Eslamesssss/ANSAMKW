"use client";

import { fmtDateTime } from "@/lib/format";
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
            <KV k="Origin" v={s.origin === "fixture" ? "FIXTURE (not live)" : "Live provider"} />
            <KV k="Session" v={s.session.open ? "Open" : s.session.reason.replace(/_/g, " ")} />
            <KV k="Bid/ask from feed" v={s.feed.providesBidAsk ? "Yes (indicative)" : "No"} />
            {s.credits && (
              <>
                <KV k="Credits (minute)" v={`${s.credits.usedLastMinute} / ${s.credits.perMinute}`} />
                <KV k="Credits (today)" v={`${s.credits.usedToday} / ${s.credits.perDay}${s.credits.providerRemaining != null ? ` · provider left ${s.credits.providerRemaining}` : ""}`} />
              </>
            )}
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
            <p className="mt-1.5 text-[10.5px] leading-snug text-ink-3">confirmed = provider REST closed bar · derived = aggregated from provider-confirmed 1m bars. Times shown in Africa/Cairo.</p>
          </div>
          {s.pendingConfirmations.length > 0 && (
            <div className="text-[11.5px] text-warn">
              Awaiting provider confirmation: {s.pendingConfirmations.map((p) => `${p.timeframe} ${fmtDateTime(p.openTime)}`).join(", ")}
            </div>
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
