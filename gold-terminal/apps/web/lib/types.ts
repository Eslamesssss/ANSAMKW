import type { AlertRule, AnalystOutput, Candle, ContractSpec, IndexRegimeStatus, MarketSnapshot, RankedLevel, Swing, StructureEvent, Timeframe, TrendReading } from "@gold/core";

export type { AlertRule, AnalystOutput, Candle, ContractSpec, IndexRegimeStatus, MarketSnapshot, RankedLevel, Swing, StructureEvent, Timeframe, TrendReading };

export interface PriceView {
  symbol: string;
  origin: "live" | "fixture";
  quoteAsset: string;
  /** Last traded price. */
  price: number | null;
  priceKind: "mid" | "last" | "indicative" | null;
  executable: false;
  /** Best bid/ask from the exchange order book. */
  bid: number | null;
  ask: number | null;
  bidQty: number | null;
  askQty: number | null;
  bookTime: number | null;
  spread: number | null;
  spreadBps: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  lastTradeAgeMs: number | null;
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

export interface StreamHealth {
  stream: string;
  lastAt: number | null;
  ageMs: number | null;
  staleAfterMs: number;
  stale: boolean;
  messages: number;
}

export interface EngineStatus {
  now: number;
  origin: "live" | "fixture";
  provider: string;
  symbol: string;
  session: { open: boolean; reason: string };
  contract: ContractSpec | null;
  contractCheckedAt: number | null;
  startupProblem: string | null;
  regime: IndexRegimeStatus;
  streams: StreamHealth[];
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
    clockOffsetMs: number | null;
    expectedUpdateIntervalMs: number | null;
    providesBidAsk: boolean;
    providesVolume: boolean;
  };
  credits: { limitPerMinute: number; safetyCap: number; usedLocal: number; usedServer: number; blockedForMs: number; blockReason: string | null } | null;
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

export interface MarketView {
  symbol: string;
  origin: "live" | "fixture";
  contract: ContractSpec | null;
  contractCheckedAt: number | null;
  bookTop: { bid: number; bidQty: number; ask: number; askQty: number; exchangeTime: number; spread?: number; spreadBps?: number; mid?: number; ageMs: number } | null;
  depth: { bids: [number, number][]; asks: [number, number][]; exchangeTime: number; ageMs: number; imbalanceTop10: number | null } | null;
  mark: { markPrice: number; indexPrice: number; estimatedSettlePrice: number | null; fundingRate: number | null; nextFundingTime: number | null; exchangeTime: number; ageMs: number } | null;
  basis: number | null;
  basisBps: number | null;
  markIndexSpread: number | null;
  funding: { intervalHours?: number | null; intervalSource?: string | null; capRate?: number | null; floorRate?: number | null; lastFundingRate?: number | null; lastFundingTime?: number | null; currentRate: number | null; nextFundingTime: number | null };
  ticker: { lastPrice: number; priceChange: number; priceChangePercent: number; high: number; low: number; volume: number; quoteVolume: number; exchangeTime: number } | null;
  openInterest: { openInterest: number; time: number; notionalUsdt: number | null; change1h: number | null } | null;
  constituents: { time: number; constituents: { exchange: string; symbol: string; weight: number | null; price: number | null }[] } | null;
  regime: IndexRegimeStatus;
  clockOffsetMs: number | null;
  streams: StreamHealth[];
}

/** Scenario prices handed from the analyst panel to the position sizer. */
export interface SizerPreset {
  side: "long" | "short";
  entry: number;
  stop: number;
  targets: number[];
  label: string;
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
