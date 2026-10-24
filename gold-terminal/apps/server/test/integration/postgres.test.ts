import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alertRuleSchema } from "@gold/core";
import pg from "pg";
import { migrate } from "../../src/db/migrate";
import { PgRepository } from "../../src/db/pgRepository";

const url = process.env.DATABASE_URL;
const schema = `it_${Date.now()}`;
let admin: pg.Pool;
let repo: PgRepository;

describe.skipIf(!url)("PostgreSQL repository", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    expect(await migrate(pool)).toEqual(["001_init.sql"]);
    expect(await migrate(pool)).toEqual([]); // idempotent
    repo = new PgRepository(pool);
  });
  afterAll(async () => {
    await repo?.close();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const t0 = Date.UTC(2024, 2, 13, 12);
  const c = (i: number, close: number) => ({ openTime: t0 + i * 60_000, open: 2000, high: 2005, low: 1995, close, volume: null, status: "confirmed" as const, source: "test" });

  it("upserts candles, keeps volume NULL and counts revisions", async () => {
    await repo.upsertCandles("live", "XAU/USD", "1m", [c(0, 2001), c(1, 2002)]);
    await repo.upsertCandles("live", "XAU/USD", "1m", [c(1, 2003)]);
    const rows = await repo.loadCandles("live", "XAU/USD", "1m", 10);
    expect(rows.map((r) => r.close)).toEqual([2001, 2003]);
    expect(rows[0]!.volume).toBeNull();
    const rev = await repo.pool.query(`SELECT revision FROM candles WHERE open_time=$1`, [new Date(t0 + 60_000)]);
    expect(rev.rows[0].revision).toBe(2);
    // Fixture and live data never share rows.
    expect(await repo.loadCandles("fixture", "XAU/USD", "1m", 10)).toEqual([]);
  });

  it("deduplicates alert events by key and stores outcomes", async () => {
    const snapId = randomUUID();
    await repo.saveSnapshot({ id: snapId, createdAt: t0, sha256: "x", payload: { symbol: "XAU/USD", dataOrigin: "live", trigger: { kind: "event", eventIds: [] } } as never });
    const ev = { id: randomUUID(), ruleId: "r1", ruleType: "candle_close", dedupeKey: "r1|1m|1", symbol: "XAU/USD", timeframe: "1m" as const, candleOpenTime: t0, triggeredAt: t0 + 60_000, price: 2001, title: "t", detail: {}, snapshotId: snapId, dataOrigin: "live" as const, acknowledgedAt: null };
    expect(await repo.insertAlertEvent(ev)).toBe(true);
    expect(await repo.insertAlertEvent({ ...ev, id: randomUUID() })).toBe(false);
    expect((await repo.lastFiredByRule()).get("r1")).toBe(t0 + 60_000);
    await repo.upsertOutcome({ alertId: ev.id, horizonMin: 15, status: "complete", closeAtHorizon: 2010, maxHigh: 2012, minLow: 1999, changeAbs: 9, barsSeen: 15, evaluatedAt: t0 });
    const outs = await repo.listOutcomes([ev.id]);
    expect(outs[0]).toMatchObject({ horizonMin: 15, closeAtHorizon: 2010, changeAbs: 9 });
    expect((await repo.alertsNeedingOutcomes(t0)).map((a) => a.id)).toEqual([ev.id]);
    expect((await repo.getSnapshot(snapId))!.payload.symbol).toBe("XAU/USD");
  });

  it("persists rules, gaps and analysis spend", async () => {
    await repo.saveRule(alertRuleSchema.parse({ id: "x", name: "n", type: "trend_change", timeframe: "4h" }));
    expect((await repo.listRules())[0]!.id).toBe("x");
    expect(await repo.recordGap("live", "XAU/USD", "1m", t0, t0 + 120_000)).toBe(true);
    expect(await repo.recordGap("live", "XAU/USD", "1m", t0, t0 + 120_000)).toBe(false);
    await repo.resolveGaps("live", "XAU/USD", "1m", [t0 + 60_000]);
    expect(await repo.listOpenGaps("live", "XAU/USD")).toEqual([]);
    await repo.saveAnalysis({ id: randomUUID(), createdAt: Date.now(), snapshotId: null, triggerKind: "manual", triggerDetail: null, status: "ok", model: "m", servedModel: "m", inputTokens: 10, outputTokens: 5, costUsd: 0.25, output: { a: 1 }, errors: ["e"], dataOrigin: "live" });
    const spend = await repo.analysisSpendSince(Date.now() - 60_000);
    expect(spend).toEqual({ calls: 1, usd: 0.25 });
    expect((await repo.listAnalyses(1))[0]!.errors).toEqual(["e"]);
  });
});
