"use client";

import { fmtAge, fmtFull, fmtPrice, fmtSigned, fmtUtc } from "@/lib/format";
import type { TerminalState } from "@/lib/types";
import { useNow } from "@/lib/useTerminal";
import { Badge, Panel } from "./ui";

const FRESH: Record<string, { label: string; tone: "bull" | "warn" | "bear" | "neutral" }> = {
  fresh: { label: "Fresh", tone: "bull" },
  delayed: { label: "Delayed", tone: "warn" },
  stale: { label: "Stale", tone: "bear" },
  market_closed: { label: "Market closed", tone: "neutral" },
  no_data: { label: "No data", tone: "bear" },
};

export function LiveRadar({ state }: { state: TerminalState | null }) {
  const now = useNow(500);
  const p = state?.price;
  const s = state?.status;
  const has = p && p.price !== null;
  const age = p?.ageMs != null ? p.ageMs + (p.clientAt && now ? Math.max(0, now - p.clientAt) : 0) : null;
  const freshness = FRESH[p?.freshness ?? "no_data"]!;
  const up = (p?.change ?? 0) >= 0;
  const session = s?.session;

  return (
    <Panel
      title={<>Live Radar · XAU/USD</>}
      right={
        <>
          <Badge tone={freshness.tone}>{freshness.label}</Badge>
          {session && <Badge tone={session.open ? "bull" : "neutral"}>{session.open ? "Session open" : session.reason.replace(/_/g, " ")}</Badge>}
        </>
      }
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(240px,1.2fr)_2fr]">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`num text-[34px] sm:text-[40px] font-semibold leading-none tracking-tight ${has ? (freshness.tone === "bear" ? "text-ink-3" : "text-ink") : "text-ink-3"}`}>{has ? fmtPrice(p!.price) : "—"}</span>
            {has && p!.change !== null && (
              <span className={`num text-[15px] font-medium ${up ? "text-bull" : "text-bear"}`}>
                {fmtSigned(p!.change)} ({fmtSigned(p!.changePct, 2)}%)
              </span>
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
            {has ? (
              <>
                {p!.priceKind === "mid" ? "Mid price" : "Indicative provider price"} — <span className="text-warn">not an executable bid/ask</span>.
                {p!.changeReference && <> Change vs {p!.changeReference.label} ({fmtPrice(p!.changeReference.close)}).</>}
              </>
            ) : state?.connection === "no_credentials" ? (
              "No price: configure TWELVEDATA_API_KEY on the server."
            ) : (
              "Waiting for the first provider price update."
            )}
          </p>
          {has && (p!.bid !== null || p!.ask !== null) && (
            <p className="num mt-1 text-[11.5px] text-ink-3">
              Provider indicative bid {fmtPrice(p!.bid)} / ask {fmtPrice(p!.ask)} (not executable)
            </p>
          )}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
          <Cell k="Source" v={p?.source ?? "—"} />
          <Cell k="Provider time" v={fmtFull(p?.providerTime)} sub={fmtUtc(p?.providerTime)} />
          <Cell k="Received" v={fmtFull(p?.receivedAt)} />
          <Cell k="Quote age" v={fmtAge(age)} tone={freshness.tone} />
          <Cell k="Avg feed latency" v={s?.feed.avgLatencyMs != null ? fmtAge(s.feed.avgLatencyMs) : "—"} sub="receive − provider ts (1s res.)" />
          <Cell k="Update cadence" v={s?.feed.avgUpdateIntervalMs != null ? `~${fmtAge(s.feed.avgUpdateIntervalMs)}` : "—"} sub={s?.feed.expectedUpdateIntervalMs ? `expected ${fmtAge(s.feed.expectedUpdateIntervalMs)}` : "provider-driven, not ticks"} />
          <Cell k="Connection" v={state?.connection ?? "—"} sub={s?.connectionDetail ?? undefined} />
          <Cell k="Updates / msgs" v={s ? `${s.feed.distinctUpdates} / ${s.feed.messages}` : "—"} sub={s ? `${s.feed.duplicates} repeats ignored` : undefined} />
          <Cell k="Volume" v={s && !s.feed.providesVolume ? "Not provided" : "—"} sub="never synthesised" />
        </div>
      </div>
    </Panel>
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
      {sub && <div className="truncate text-[10.5px] text-ink-3" title={sub}>{sub}</div>}
    </div>
  );
}
