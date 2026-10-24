"use client";

import { fmtFull } from "@/lib/format";
import type { TerminalState } from "@/lib/types";
import { useNow } from "@/lib/useTerminal";
import { AdminAccess } from "./AdminAccess";
import { Badge, Dot } from "./ui";

export function TopBar({ state, streamConnected }: { state: TerminalState | null; streamConnected: boolean }) {
  const now = useNow();
  const origin = state?.origin;
  const conn = state?.connection ?? "connecting";
  const connTone = conn === "connected" ? "bull" : conn === "reconnecting" || conn === "connecting" ? "warn" : "bear";
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-md border border-gold/40 bg-gold/10 text-[13px] font-bold text-gold-2">Au</div>
          <div>
            <h1 className="text-[13px] font-bold tracking-[0.18em] text-ink">GOLD INTELLIGENCE TERMINAL <span className="text-gold">V1</span></h1>
            <p className="text-[11px] text-ink-3">Binance USDⓈ-M · XAUUSDT Gold/USDT perpetual · analysis only, no order execution</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {origin === "fixture" ? <Badge tone="warn">Fixture replay · not live</Badge> : origin === "live" && state?.status?.contract ? <Badge tone="gold">Live · Binance</Badge> : null}
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
            <Dot tone={connTone} /> Feed: {conn}
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
            <Dot tone={streamConnected ? "bull" : "bear"} /> Server stream
          </span>
          <span className="num text-[11.5px] text-ink-2">{now ? fmtFull(now) : ""}</span>
          {origin === "fixture" && state?.status && <span className="num text-[11.5px] text-warn">Replay clock {fmtFull(state.status.now)}</span>}
          <AdminAccess />
        </div>
      </div>
      {origin === "fixture" && (
        <div className="border-t border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-[12px] font-semibold tracking-wide text-warn">
          DEMO REPLAY — prices below come from fixture files (synthetic or recorded), not from a live market feed. Do not use for trading decisions.
        </div>
      )}
      {state?.startupProblem && (
        <div className="border-t border-bear/30 bg-bear/10 px-4 py-1.5 text-center text-[12px] font-medium text-bear">{state.startupProblem}</div>
      )}
    </header>
  );
}
