import { alertRuleSchema, OUTCOME_HORIZONS_MIN, type AlertRule, type Candle, type CandleDiff, type DataOrigin, type Timeframe } from "@gold/core";
import pg from "pg";
import type { CandleRow, Repository, StoredAlertEvent, StoredAnalysis, StoredOutcome, StoredSnapshot } from "./repository";

// numeric -> JS number (prices fit comfortably in double precision).
pg.types.setTypeParser(1700, (v) => Number(v));
// bigint counts -> number
pg.types.setTypeParser(20, (v) => Number(v));

const ts = (ms: number) => new Date(ms).toISOString();
const ms = (d: Date | null) => (d ? d.getTime() : null);

export class PgRepository implements Repository {
  readonly kind = "postgres" as const;
  constructor(readonly pool: pg.Pool) {}

  async upsertCandles(origin: DataOrigin, symbol: string, tf: Timeframe, rows: CandleRow[]) {
    if (!rows.length) return;
    // Chunk to keep parameter counts bounded.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values: unknown[] = [];
      const tuples = chunk.map((r, j) => {
        const b = j * 11;
        values.push(symbol, tf, ts(r.openTime), r.open, r.high, r.low, r.close, r.volume, r.status, r.source, origin);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
      });
      await this.pool.query(
        `INSERT INTO candles (symbol,timeframe,open_time,open,high,low,close,volume,status,source,data_origin)
         VALUES ${tuples.join(",")}
         ON CONFLICT (data_origin,symbol,timeframe,open_time) DO UPDATE SET
           open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume,
           status=EXCLUDED.status, source=EXCLUDED.source, updated_at=now(),
           revision = candles.revision + CASE WHEN (candles.open,candles.high,candles.low,candles.close,candles.status)
             IS DISTINCT FROM (EXCLUDED.open,EXCLUDED.high,EXCLUDED.low,EXCLUDED.close,EXCLUDED.status) THEN 1 ELSE 0 END`,
        values,
      );
    }
  }

  async loadCandles(origin: DataOrigin, symbol: string, tf: Timeframe, limit: number): Promise<Candle[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM (SELECT open_time, open, high, low, close, volume, status FROM candles
        WHERE data_origin=$1 AND symbol=$2 AND timeframe=$3 ORDER BY open_time DESC LIMIT $4) t ORDER BY open_time ASC`,
      [origin, symbol, tf, limit],
    );
    return rows.map((r) => ({ openTime: r.open_time.getTime(), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, status: r.status }));
  }

  async recordRevisions(origin: DataOrigin, symbol: string, tf: Timeframe, diffs: CandleDiff[]) {
    for (const d of diffs) {
      await this.pool.query(
        `INSERT INTO candle_revisions (symbol,timeframe,open_time,data_origin,kind,previous,current,max_abs_delta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [symbol, tf, ts(d.openTime), origin, d.kind, d.local, d.provider, Number.isFinite(d.maxAbsDelta) ? d.maxAbsDelta : null],
      );
    }
  }

  async recordGap(origin: DataOrigin, symbol: string, tf: Timeframe, from: number, to: number) {
    const r = await this.pool.query(
      `INSERT INTO data_gaps (symbol,timeframe,data_origin,gap_from,gap_to) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [symbol, tf, origin, ts(from), ts(to)],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async resolveGaps(origin: DataOrigin, symbol: string, tf: Timeframe, covered: number[]) {
    if (!covered.length) return;
    await this.pool.query(
      `UPDATE data_gaps g SET resolved_at=now() WHERE resolved_at IS NULL AND data_origin=$1 AND symbol=$2 AND timeframe=$3
        AND EXISTS (SELECT 1 FROM unnest($4::timestamptz[]) t WHERE t >= g.gap_from AND t < g.gap_to)`,
      [origin, symbol, tf, covered.map(ts)],
    );
  }

  async listOpenGaps(origin: DataOrigin, symbol: string) {
    const { rows } = await this.pool.query(
      `SELECT timeframe, gap_from, gap_to FROM data_gaps WHERE resolved_at IS NULL AND data_origin=$1 AND symbol=$2 ORDER BY gap_from DESC LIMIT 50`,
      [origin, symbol],
    );
    return rows.map((r) => ({ timeframe: r.timeframe, from: r.gap_from.getTime(), to: r.gap_to.getTime() }));
  }

  async recordFeedEvent(source: string, kind: string, detail: unknown) {
    await this.pool.query(`INSERT INTO feed_events (source,kind,detail) VALUES ($1,$2,$3)`, [source, kind, detail === undefined ? null : JSON.stringify(detail)]);
  }

  async saveSnapshot(s: StoredSnapshot) {
    await this.pool.query(
      `INSERT INTO market_snapshots (id,created_at,symbol,data_origin,trigger_kind,payload,payload_sha256) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [s.id, ts(s.createdAt), s.payload.symbol, s.payload.dataOrigin, s.payload.trigger.kind, s.payload, s.sha256],
    );
  }

  async getSnapshot(id: string) {
    const { rows } = await this.pool.query(`SELECT id, created_at, payload, payload_sha256 FROM market_snapshots WHERE id=$1`, [id]);
    const r = rows[0];
    return r ? { id: r.id, createdAt: r.created_at.getTime(), payload: r.payload, sha256: r.payload_sha256 } : null;
  }

  async listRules(): Promise<AlertRule[]> {
    const { rows } = await this.pool.query(`SELECT rule FROM alert_rules ORDER BY created_at`);
    return rows.flatMap((r) => {
      const p = alertRuleSchema.safeParse(r.rule);
      return p.success ? [p.data] : [];
    });
  }
  async saveRule(rule: AlertRule) {
    await this.pool.query(
      `INSERT INTO alert_rules (id, rule) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET rule=EXCLUDED.rule, updated_at=now()`,
      [rule.id, rule],
    );
  }
  async deleteRule(id: string) {
    const r = await this.pool.query(`DELETE FROM alert_rules WHERE id=$1`, [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async insertAlertEvent(e: StoredAlertEvent) {
    const r = await this.pool.query(
      `INSERT INTO alert_events (id,rule_id,rule_type,dedupe_key,symbol,timeframe,candle_open_time,triggered_at,price,title,detail,snapshot_id,data_origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (data_origin, dedupe_key) DO NOTHING`,
      [e.id, e.ruleId, e.ruleType, e.dedupeKey, e.symbol, e.timeframe, ts(e.candleOpenTime), ts(e.triggeredAt), e.price, e.title, e.detail, e.snapshotId, e.dataOrigin],
    );
    return (r.rowCount ?? 0) > 0;
  }

  private rowToAlert(r: Record<string, any>): StoredAlertEvent {
    return {
      id: r.id,
      ruleId: r.rule_id,
      ruleType: r.rule_type,
      dedupeKey: r.dedupe_key,
      symbol: r.symbol,
      timeframe: r.timeframe,
      candleOpenTime: r.candle_open_time.getTime(),
      triggeredAt: r.triggered_at.getTime(),
      price: r.price,
      title: r.title,
      detail: r.detail,
      snapshotId: r.snapshot_id,
      dataOrigin: r.data_origin,
      acknowledgedAt: ms(r.acknowledged_at),
    };
  }

  async listAlertEvents(opts: { limit: number; origin?: DataOrigin; before?: number }) {
    const { rows } = await this.pool.query(
      `SELECT * FROM alert_events WHERE ($1::text IS NULL OR data_origin=$1) AND ($2::timestamptz IS NULL OR triggered_at < $2)
       ORDER BY triggered_at DESC LIMIT $3`,
      [opts.origin ?? null, opts.before !== undefined ? ts(opts.before) : null, opts.limit],
    );
    return rows.map((r) => this.rowToAlert(r));
  }
  async getAlertEvent(id: string) {
    const { rows } = await this.pool.query(`SELECT * FROM alert_events WHERE id=$1`, [id]);
    return rows[0] ? this.rowToAlert(rows[0]) : null;
  }
  async acknowledgeAlert(id: string, at: number) {
    await this.pool.query(`UPDATE alert_events SET acknowledged_at=$2 WHERE id=$1`, [id, ts(at)]);
  }
  async lastFiredByRule() {
    const { rows } = await this.pool.query(`SELECT rule_id, max(triggered_at) AS t FROM alert_events GROUP BY rule_id`);
    return new Map(rows.map((r) => [r.rule_id as string, (r.t as Date).getTime()]));
  }
  async alertsNeedingOutcomes(sinceMs: number) {
    const { rows } = await this.pool.query(
      `SELECT e.* FROM alert_events e WHERE e.triggered_at >= $1 AND
        (SELECT count(*) FROM alert_outcomes o WHERE o.alert_id=e.id AND o.status <> 'pending') < $2
       ORDER BY e.triggered_at LIMIT 500`,
      [ts(sinceMs), OUTCOME_HORIZONS_MIN.length],
    );
    return rows.map((r) => this.rowToAlert(r));
  }
  async upsertOutcome(o: StoredOutcome) {
    await this.pool.query(
      `INSERT INTO alert_outcomes (alert_id,horizon_min,status,close_at_horizon,max_high,min_low,change_abs,bars_seen,evaluated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (alert_id,horizon_min) DO UPDATE SET status=EXCLUDED.status, close_at_horizon=EXCLUDED.close_at_horizon,
         max_high=EXCLUDED.max_high, min_low=EXCLUDED.min_low, change_abs=EXCLUDED.change_abs, bars_seen=EXCLUDED.bars_seen, evaluated_at=EXCLUDED.evaluated_at`,
      [o.alertId, o.horizonMin, o.status, o.closeAtHorizon, o.maxHigh, o.minLow, o.changeAbs, o.barsSeen, ts(o.evaluatedAt)],
    );
  }
  async listOutcomes(ids: string[]) {
    if (!ids.length) return [];
    const { rows } = await this.pool.query(`SELECT * FROM alert_outcomes WHERE alert_id = ANY($1::uuid[]) ORDER BY horizon_min`, [ids]);
    return rows.map((r) => ({
      alertId: r.alert_id,
      horizonMin: r.horizon_min,
      status: r.status,
      closeAtHorizon: r.close_at_horizon,
      maxHigh: r.max_high,
      minLow: r.min_low,
      changeAbs: r.change_abs,
      barsSeen: r.bars_seen,
      evaluatedAt: r.evaluated_at.getTime(),
    }));
  }

  async saveAnalysis(a: StoredAnalysis) {
    await this.pool.query(
      `INSERT INTO analyses (id,created_at,snapshot_id,trigger_kind,trigger_detail,status,model,served_model,input_tokens,output_tokens,cost_usd,output,errors,data_origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [a.id, ts(a.createdAt), a.snapshotId, a.triggerKind, a.triggerDetail, a.status, a.model, a.servedModel, a.inputTokens, a.outputTokens, a.costUsd,
        a.output === undefined ? null : JSON.stringify(a.output), a.errors === null ? null : JSON.stringify(a.errors), a.dataOrigin],
    );
  }
  async listAnalyses(limit: number): Promise<StoredAnalysis[]> {
    const { rows } = await this.pool.query(`SELECT * FROM analyses ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.getTime(),
      snapshotId: r.snapshot_id,
      triggerKind: r.trigger_kind,
      triggerDetail: r.trigger_detail,
      status: r.status,
      model: r.model,
      servedModel: r.served_model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      output: r.output,
      errors: r.errors,
      dataOrigin: r.data_origin,
    }));
  }
  async analysisSpendSince(sinceMs: number) {
    const { rows } = await this.pool.query(
      `SELECT count(*) AS calls, coalesce(sum(cost_usd),0) AS usd FROM analyses WHERE created_at >= $1 AND status <> 'skipped'`,
      [ts(sinceMs)],
    );
    return { calls: rows[0].calls, usd: rows[0].usd };
  }
  async close() {
    await this.pool.end();
  }
}
