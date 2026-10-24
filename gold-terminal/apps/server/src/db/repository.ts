import type { AlertRule, Candle, CandleDiff, DataOrigin, MarketSnapshot, Outcome, Timeframe } from "@gold/core";

export interface StoredAlertEvent {
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
  dataOrigin: DataOrigin;
  acknowledgedAt: number | null;
}

export interface StoredOutcome extends Outcome {
  alertId: string;
  evaluatedAt: number;
}

export interface StoredAnalysis {
  id: string;
  createdAt: number;
  snapshotId: string | null;
  triggerKind: "manual" | "event";
  triggerDetail: Record<string, unknown> | null;
  status: "ok" | "rejected_validation" | "skipped" | "error" | "refused";
  model: string | null;
  servedModel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  output: unknown;
  errors: string[] | null;
  dataOrigin: DataOrigin;
}

export interface StoredSnapshot {
  id: string;
  createdAt: number;
  payload: MarketSnapshot;
  sha256: string;
}

export interface CandleRow extends Candle {
  source: string;
}

/**
 * Persistence boundary. `PgRepository` is the production implementation;
 * `MemoryRepository` exists for unit tests and for running without a database.
 */
export interface Repository {
  readonly kind: "postgres" | "memory";
  upsertCandles(origin: DataOrigin, symbol: string, tf: Timeframe, rows: CandleRow[]): Promise<void>;
  loadCandles(origin: DataOrigin, symbol: string, tf: Timeframe, limit: number): Promise<Candle[]>;
  recordRevisions(origin: DataOrigin, symbol: string, tf: Timeframe, diffs: CandleDiff[]): Promise<void>;
  recordGap(origin: DataOrigin, symbol: string, tf: Timeframe, from: number, to: number): Promise<boolean>;
  resolveGaps(origin: DataOrigin, symbol: string, tf: Timeframe, coveredTimes: number[]): Promise<void>;
  listOpenGaps(origin: DataOrigin, symbol: string): Promise<{ timeframe: string; from: number; to: number }[]>;
  recordFeedEvent(source: string, kind: string, detail: unknown): Promise<void>;

  saveSnapshot(s: StoredSnapshot): Promise<void>;
  getSnapshot(id: string): Promise<StoredSnapshot | null>;

  listRules(): Promise<AlertRule[]>;
  saveRule(rule: AlertRule): Promise<void>;
  deleteRule(id: string): Promise<boolean>;

  /** Inserts the event unless its dedupe key already exists. Returns true if inserted. */
  insertAlertEvent(e: StoredAlertEvent): Promise<boolean>;
  listAlertEvents(opts: { limit: number; origin?: DataOrigin; before?: number }): Promise<StoredAlertEvent[]>;
  getAlertEvent(id: string): Promise<StoredAlertEvent | null>;
  acknowledgeAlert(id: string, at: number): Promise<void>;
  lastFiredByRule(): Promise<Map<string, number>>;
  alertsNeedingOutcomes(sinceMs: number): Promise<StoredAlertEvent[]>;
  upsertOutcome(o: StoredOutcome): Promise<void>;
  listOutcomes(alertIds: string[]): Promise<StoredOutcome[]>;

  saveAnalysis(a: StoredAnalysis): Promise<void>;
  listAnalyses(limit: number): Promise<StoredAnalysis[]>;
  analysisSpendSince(sinceMs: number): Promise<{ calls: number; usd: number }>;

  close(): Promise<void>;
}
