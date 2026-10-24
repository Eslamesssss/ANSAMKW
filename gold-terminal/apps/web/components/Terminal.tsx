"use client";

import { useState } from "react";
import type { ChartData, Timeframe } from "@/lib/types";
import { useTerminal } from "@/lib/useTerminal";
import { AlertsPanel } from "./AlertsPanel";
import { AnalystPanel } from "./AnalystPanel";
import { ChartPanel } from "./ChartPanel";
import { HistoryPanel } from "./HistoryPanel";
import { LiveRadar } from "./LiveRadar";
import { SourceStatus } from "./SourceStatus";
import { StructurePanel } from "./StructurePanel";
import { TopBar } from "./TopBar";
import { TrendScanner } from "./TrendScanner";

export function Terminal() {
  const t = useTerminal();
  const [tf, setTf] = useState<Timeframe>("15m");
  const [chart, setChart] = useState<ChartData | null>(null);
  const engineUp = !!t.state?.status;

  return (
    <div className="min-h-screen">
      <TopBar state={t.state} streamConnected={t.streamConnected} />
      {t.error && <div className="mx-auto mt-3 max-w-[1800px] px-4"><div className="rounded-md border border-bear/40 bg-bear/10 px-3 py-2 text-[12.5px] text-bear">{t.error}</div></div>}
      <main className="mx-auto grid max-w-[1800px] grid-cols-1 gap-3 p-3 md:p-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-3 xl:col-span-8">
          <LiveRadar state={t.state} />
          <ChartPanel tf={tf} onTf={setTf} price={t.state?.price ?? null} closeVersion={t.closeVersion[tf] ?? 0} onData={setChart} />
          <StructurePanel data={chart} />
          <HistoryPanel version={t.liveAlerts.length} />
        </div>
        <div className="min-w-0 space-y-3 xl:col-span-4">
          <TrendScanner version={t.anyCloseVersion} selected={tf} onSelect={setTf} />
          <AnalystPanel analysis={t.latestAnalysis} budget={t.state?.analyst ?? null} onNew={t.setLatestAnalysis} disabled={!engineUp} />
          <AlertsPanel live={t.liveAlerts} onDismiss={t.dismissAlert} notificationsEnabled={t.notificationsEnabled} onEnableNotifications={t.enableNotifications} />
          <SourceStatus state={t.state} />
        </div>
      </main>
      <footer className="mx-auto max-w-[1800px] px-4 pb-6 text-[11px] text-ink-3">
        Market intelligence only. Prices are provider mid/indicative quotes, not executable bid/ask. Signals use confirmed candle closes. Not financial advice; no orders are ever placed.
      </footer>
    </div>
  );
}
