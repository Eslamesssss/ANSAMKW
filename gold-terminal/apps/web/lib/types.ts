import type { AlertRule, AnalystOutput, Candle, MarketSnapshot, RankedLevel, Swing, StructureEvent, Timeframe, TrendReading } from "@gold/core";

export type { AlertRule, AnalystOutput, Candle, MarketSnapshot, RankedLevel, Swing, StructureEvent, Timeframe, TrendReading };

export interface PriceView {
  symbol: string;
  origin: "live" | "fixture";
  price: number | null;
  priceKind: "mid" | "last" | "indicative" | null;
  executable: false;
  bid: number | null;
  ask: number | null;
  source: string | null;
  providerTime: number | null;
  receivedAt: number | null;
  ageMs: number | null;
  freshness: "fresh" | "delayed" | "stale" | "market_closed" | "no_data";
  change: number | null;
  changePct: number | null;
  changeReference: { close: number; openTime: number; label: string } | null;
  /** Browser time when this view arrived; ages are server age + elapsed since then (works for replay clocks too). */
  clientAt?: number;
}

export interface EngineStatus {
  now: number;
  origin: "live" | "fixture";
  provider: string;
  symbol: string;
  session: { open: boolean; reason: string };
  connection: string;
  connectionDetail: string | null;
  connectionChangedAt: number;
  feed: {
    messages: number;
    distinctUpdates: number;
    duplicates: number;
    outOfOrder: number;
    avgUpdateIntervalMs: number | null;
    avgLatencyMs: number | null;
    expectedUpdateIntervalMs: number | null;
    providesBidAsk: boolean;
    providesVolume: boolean;
  };
  credits: { usedLastMinute: number; perMinute: number; usedToday: number; perDay: number; providerRemaining: number | null } | null;
  timeframes: { timeframe: Timeframe; bars: number; lastClosedOpenTime: number | null; lastStatus: string | null; trend: string; initialised: boolean }[];
  pendingConfirmations: { timeframe: Timeframe; openTime: number; attempts: number }[];
  dataQuality: string[];
}

export interface AnalystBudget {
  callsToday: number;
  maxCallsPerDay: number;
  usdToday: number;
  maxUsdPerDay: number;
  autoEnabled: boolean;
  autoCooldownSec: number;
  manualCooldownSec: number;
  nextManualAt: number | null;
  nextAutoAt: number | null;
  model: string;
  configured: boolean;
}

export interface TerminalState {
  origin: "live" | "fixture";
  connection: string;
  startupProblem: string | null;
  price: PriceView | null;
  status: EngineStatus | null;
  analyst: AnalystBudget;
}

export interface ChartData {
  timeframe: Timeframe;
  origin: "live" | "fixture";
  candles: Candle[];
  forming: Candle | null;
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  trend: TrendReading;
  structureTrend: "bullish" | "bearish" | "undetermined";
  swings: Swing[];
  events: StructureEvent[];
  levels: RankedLevel[];
}

export interface TrendRow extends TrendReading {
  structureTrend: "bullish" | "bearish" | "undetermined";
  lastStatus: string | null;
  lastSwingHigh: Swing | null;
  lastSwingLow: Swing | null;
}

export interface Analysis {
  id: string;
  createdAt: number;
  snapshotId: string | null;
  triggerKind: "manual" | "event";
  triggerDetail: { events?: { id: string; description: string }[] } | null;
  status: "ok" | "rejected_validation" | "skipped" | "error" | "refused";
  model: string | null;
  servedModel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  output: AnalystOutput | null;
  errors: string[] | null;
  dataOrigin: "live" | "fixture";
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleType: string;
  dedupeKey: string;
  symbol: string;
  timeframe: Timeframe;
  candleOpenTime: number;
  triggeredAt: number;
  price: number;
  title: string;
  detail: Record<string, unknown>;
  snapshotId: string | null;
  dataOrigin: "live" | "fixture";
  acknowledgedAt: number | null;
}

export interface Outcome {
  alertId: string;
  horizonMin: number;
  status: "complete" | "pending" | "no_data";
  closeAtHorizon: number | null;
  maxHigh: number | null;
  minLow: number | null;
  changeAbs: number | null;
  barsSeen: number;
}

export interface HistoryRow extends AlertEvent {
  outcomes: Outcome[];
}
