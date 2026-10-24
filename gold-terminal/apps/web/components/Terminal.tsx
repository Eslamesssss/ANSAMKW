"use client";

import { useState } from "react";
import type { ChartData, SizerPreset, Timeframe } from "@/lib/types";
import { useTerminal } from "@/lib/useTerminal";
import { AlertsPanel } from "./AlertsPanel";
import { AnalystPanel } from "./AnalystPanel";
import { ChartPanel } from "./ChartPanel";
import { DerivativesPanel } from "./DerivativesPanel";
import { HistoryPanel } from "./HistoryPanel";
import { LiveRadar } from "./LiveRadar";
import { PositionSizer } from "./PositionSizer";
import { SourceStatus } from "./SourceStatus";
import { StructurePanel } from "./StructurePanel";
import { TopBar } from "./TopBar";
import { TrendScanner } from "./TrendScanner";

export function Terminal() {
  const t = useTerminal();
  const [tf, setTf] = useState<Timeframe>("15m");
  const [chart, setChart] = useState<ChartData | null>(null);
  const [preset, setPreset] = useState<SizerPreset | null>(null);
  const engineUp = !!t.state?.status;

  return (
    <div className="min-h-screen">
      <TopBar state={t.state} streamConnected={t.streamConnected} />
      {t.error && <div className="mx-auto mt-3 max-w-[1800px] px-4"><div className="rounded-md border border-bear/40 bg-bear/10 px-3 py-2 text-[12.5px] text-bear">{t.error}</div></div>}
      <main className="mx-auto grid max-w-[1800px] grid-cols-1 gap-3 p-3 md:p-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-3 xl:col-span-8">
          <LiveRadar state={t.state} />
          <ChartPanel tf={tf} onTf={setTf} price={t.state?.price ?? null} closeVersion={t.closeVersion[tf] ?? 0} onData={setChart} />
          <DerivativesPanel market={t.market} />
          <StructurePanel data={chart} />
          <HistoryPanel version={t.liveAlerts.length} />
        </div>
        <div className="min-w-0 space-y-3 xl:col-span-4">
          <TrendScanner version={t.anyCloseVersion} selected={tf} onSelect={setTf} />
          <AnalystPanel analysis={t.latestAnalysis} budget={t.state?.analyst ?? null} onNew={t.setLatestAnalysis} disabled={!engineUp} onUseScenario={setPreset} />
          <PositionSizer contract={t.contract} preset={preset} lastPrice={t.state?.price?.price ?? null} />
          <AlertsPanel live={t.liveAlerts} onDismiss={t.dismissAlert} notificationsEnabled={t.notificationsEnabled} onEnableNotifications={t.enableNotifications} />
          <SourceStatus state={t.state} />
        </div>
      </main>
      <footer className="mx-auto max-w-[1800px] px-4 pb-6 text-[11px] text-ink-3">
        Market intelligence only, for the Binance USDⓈ-M XAUUSDT perpetual: every price, level, risk and P&L figure is in USDT. Bid/ask are order-book quotes, not guaranteed fills. Signals use confirmed candle closes. No API keys, no order execution. Not financial advice.
      </footer>
    </div>
  );
}
