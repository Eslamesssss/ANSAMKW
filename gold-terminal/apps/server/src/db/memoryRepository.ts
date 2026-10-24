import type { AlertRule, Candle, CandleDiff, DataOrigin, Timeframe } from "@gold/core";
import type { CandleRow, Repository, StoredAlertEvent, StoredAnalysis, StoredOutcome, StoredSnapshot } from "./repository";

/** In-process repository. Data is lost on restart; used for tests and DB-less development. */
export class MemoryRepository implements Repository {
  readonly kind = "memory" as const;
  candles = new Map<string, Map<number, CandleRow>>();
  revisions: { tf: Timeframe; diff: CandleDiff }[] = [];
  gaps = new Map<string, { timeframe: string; from: number; to: number; resolved: boolean }>();
  feedEvents: { source: string; kind: string; detail: unknown; at: number }[] = [];
  snapshots = new Map<string, StoredSnapshot>();
  rules = new Map<string, AlertRule>();
  alerts = new Map<string, StoredAlertEvent>();
  outcomes = new Map<string, StoredOutcome>();
  analyses: StoredAnalysis[] = [];

  private key(origin: DataOrigin, symbol: string, tf: Timeframe) {
    return `${origin}|${symbol}|${tf}`;
  }

  async upsertCandles(origin: DataOrigin, symbol: string, tf: Timeframe, rows: CandleRow[]) {
    const k = this.key(origin, symbol, tf);
    const m = this.candles.get(k) ?? new Map();
    for (const r of rows) m.set(r.openTime, { ...r });
    this.candles.set(k, m);
  }
  async loadCandles(origin: DataOrigin, symbol: string, tf: Timeframe, limit: number): Promise<Candle[]> {
    const m = this.candles.get(this.key(origin, symbol, tf));
    if (!m) return [];
    return [...m.values()].sort((a, b) => a.openTime - b.openTime).slice(-limit).map(({ source: _s, ...c }) => c);
  }
  async recordRevisions(_o: DataOrigin, _s: string, tf: Timeframe, diffs: CandleDiff[]) {
    for (const diff of diffs) this.revisions.push({ tf, diff });
  }
  async recordGap(origin: DataOrigin, symbol: string, tf: Timeframe, from: number, to: number) {
    const k = `${this.key(origin, symbol, tf)}|${from}`;
    if (this.gaps.has(k)) return false;
    this.gaps.set(k, { timeframe: tf, from, to, resolved: false });
    return true;
  }
  async resolveGaps(origin: DataOrigin, symbol: string, tf: Timeframe, covered: number[]) {
    const prefix = this.key(origin, symbol, tf);
    for (const [k, g] of this.gaps) {
      if (k.startsWith(prefix) && covered.some((t) => t >= g.from && t < g.to)) g.resolved = true;
    }
  }
  async listOpenGaps() {
    return [...this.gaps.values()].filter((g) => !g.resolved).map(({ resolved: _r, ...g }) => g);
  }
  async recordFeedEvent(source: string, kind: string, detail: unknown) {
    this.feedEvents.push({ source, kind, detail, at: Date.now() });
    if (this.feedEvents.length > 1000) this.feedEvents.shift();
  }
  async saveSnapshot(s: StoredSnapshot) {
    this.snapshots.set(s.id, s);
  }
  async getSnapshot(id: string) {
    return this.snapshots.get(id) ?? null;
  }
  async listRules() {
    return [...this.rules.values()];
  }
  async saveRule(rule: AlertRule) {
    this.rules.set(rule.id, rule);
  }
  async deleteRule(id: string) {
    return this.rules.delete(id);
  }
  async insertAlertEvent(e: StoredAlertEvent) {
    for (const a of this.alerts.values()) if (a.dedupeKey === e.dedupeKey && a.dataOrigin === e.dataOrigin) return false;
    this.alerts.set(e.id, e);
    return true;
  }
  async listAlertEvents(opts: { limit: number; origin?: DataOrigin; before?: number }) {
    return [...this.alerts.values()]
      .filter((a) => (!opts.origin || a.dataOrigin === opts.origin) && (opts.before === undefined || a.triggeredAt < opts.before))
      .sort((a, b) => b.triggeredAt - a.triggeredAt)
      .slice(0, opts.limit);
  }
  async getAlertEvent(id: string) {
    return this.alerts.get(id) ?? null;
  }
  async acknowledgeAlert(id: string, at: number) {
    const a = this.alerts.get(id);
    if (a) a.acknowledgedAt = at;
  }
  async lastFiredByRule() {
    const m = new Map<string, number>();
    for (const a of this.alerts.values()) m.set(a.ruleId, Math.max(m.get(a.ruleId) ?? 0, a.triggeredAt));
    return m;
  }
  async alertsNeedingOutcomes(sinceMs: number) {
    return [...this.alerts.values()].filter((a) => a.triggeredAt >= sinceMs);
  }
  async upsertOutcome(o: StoredOutcome) {
    this.outcomes.set(`${o.alertId}|${o.horizonMin}`, o);
  }
  async listOutcomes(ids: string[]) {
    return [...this.outcomes.values()].filter((o) => ids.includes(o.alertId));
  }
  async saveAnalysis(a: StoredAnalysis) {
    this.analyses.unshift(a);
  }
  async listAnalyses(limit: number) {
    return this.analyses.slice(0, limit);
  }
  async analysisSpendSince(sinceMs: number) {
    const rows = this.analyses.filter((a) => a.createdAt >= sinceMs && a.status !== "skipped");
    return { calls: rows.length, usd: rows.reduce((s, a) => s + (a.costUsd ?? 0), 0) };
  }
  async close() {}
}
