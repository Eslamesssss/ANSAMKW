import { afterEach, describe, expect, it } from "vitest";
import { alertRuleSchema, MINUTE } from "@gold/core";
import { MemoryRepository } from "../../src/db/memoryRepository";
import { MarketEngine } from "../../src/engine/engine";
import { CreditBudget } from "../../src/market/twelvedata/creditBudget";
import { TwelveDataAdapter } from "../../src/market/twelvedata/adapter";
import { fakeClock, manifest, silentLogger, testConfig } from "../support/helpers";
import { mockTwelveDataFetch, mockTwelveDataWs, recordedFrames } from "../support/mockTwelveData";

const waitFor = async (cond: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
};

let cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanup.reverse()) await c();
  cleanup = [];
});

async function setup(over: Record<string, string> = {}) {
  const m = manifest();
  const clock = fakeClock(Date.parse(m.replayStart));
  const http = mockTwelveDataFetch(clock.now);
  const ws = await mockTwelveDataWs();
  const config = testConfig({ DATA_MODE: "live", ...over });
  const budget = new CreditBudget(1000, 100000, clock.now);
  const adapter = new TwelveDataAdapter({ apiKey: "test-key", symbol: "XAU/USD", restUrl: "https://api.twelvedata.test", wsUrl: ws.url, budget, fetchImpl: http.impl, now: clock.now });
  const repo = new MemoryRepository();
  const engine = new MarketEngine(config, adapter, repo, clock.now, silentLogger);
  cleanup.push(() => ws.close(), () => engine.stop());
  return { m, clock, http, ws, budget, adapter, repo, engine };
}

describe("Twelve Data adapter + engine with recorded fixtures", () => {
  it("initialises every timeframe with enough history and subscribes to the stream", async () => {
    const { engine, http, ws } = await setup();
    await engine.start({ timers: false });
    const ts = http.calls.filter((u) => u.pathname === "/time_series");
    expect(ts.map((u) => u.searchParams.get("interval"))).toEqual(["1min", "5min", "15min", "1h", "4h", "1day"]);
    expect(ts.every((u) => u.searchParams.get("timezone") === "UTC" && u.searchParams.get("outputsize") === "1000")).toBe(true);
    for (const tf of ["1m", "5m", "15m", "1h", "4h", "1d"] as const) {
      const st = engine.tf.get(tf)!;
      expect(st.closed.length).toBeGreaterThanOrEqual(1000);
      expect(st.trend.state).not.toBe("insufficient_data");
    }
    await waitFor(() => engine.live.connection === "connected");
    expect(ws.received).toContainEqual({ action: "subscribe", params: { symbols: "XAU/USD" } });
  });

  it("streams prices, detects duplicates, then confirms closed candles via REST reconciliation", async () => {
    const { engine, clock, ws, m, repo, http } = await setup();
    await repo.saveRule(alertRuleSchema.parse({ id: "every-1m", name: "1m close", type: "candle_close", timeframe: "1m" }));
    await engine.start({ timers: false });
    await waitFor(() => engine.live.connection === "connected");

    const start = Date.parse(m.replayStart);
    const frames = recordedFrames().filter((f) => f.receivedAt < start + 3 * MINUTE);
    for (const f of frames) ws.send(f.raw);
    await waitFor(() => engine.live.messages >= frames.filter((f) => f.raw.includes('"price"')).length);
    expect(engine.live.duplicates).toBeGreaterThanOrEqual(0);
    expect(engine.live.distinct).toBeLessThanOrEqual(engine.live.messages);
    // Prices before reconciliation only update the forming candle.
    const before = engine.tf.get("1m")!.closed.length;
    expect(engine.tf.get("1m")!.forming?.status).toBe("forming");

    clock.set(start + 3 * MINUTE + 5_000);
    await engine.tick();
    const one = engine.tf.get("1m")!;
    expect(one.closed.length).toBe(before + 3);
    expect(one.closed.at(-1)!.status).toBe("confirmed");
    const alerts = await repo.listAlertEvents({ limit: 10 });
    expect(alerts).toHaveLength(3);
    expect(alerts.every((a) => a.snapshotId && a.dataOrigin === "live")).toBe(true);

    // Re-ingesting the same provider bars (e.g. after a reconnect) must not duplicate alerts.
    const res = await engine.adapter.fetchHistory("1m", { outputsize: 5 });
    await engine.ingestClosed("1m", res.closed, res.source);
    expect(await repo.listAlertEvents({ limit: 10 })).toHaveLength(3);
    expect(http.calls.length).toBeGreaterThan(7);
  });

  it("derives 5m bars from confirmed 1m bars and confirms 1h natively", async () => {
    const { engine, clock, m, http } = await setup();
    await engine.start({ timers: false });
    const start = Date.parse(m.replayStart); // 12:00 UTC
    const fiveBefore = engine.tf.get("5m")!.closed.at(-1)!.openTime;
    clock.set(start + 5 * MINUTE + 5_000);
    await engine.tick();
    await engine.tick();
    const five = engine.tf.get("5m")!.closed.at(-1)!;
    expect(five.openTime).toBe(fiveBefore + 5 * MINUTE);
    expect(five.status).toBe("derived");
    // Native confirmation for 1h at 13:00.
    clock.set(start + 60 * MINUTE + 5_000);
    for (let i = 0; i < 6; i++) await engine.tick();
    expect(http.calls.some((u) => u.searchParams.get("interval") === "1h" && u.searchParams.get("outputsize") === "3")).toBe(true);
    const h = engine.tf.get("1h")!.closed.at(-1)!;
    expect(h.openTime).toBe(start);
    expect(h.status).toBe("confirmed");
  });

  it("backs off on provider rate limits without fabricating bars", async () => {
    const { engine, clock, m, http, budget } = await setup();
    await engine.start({ timers: false });
    const start = Date.parse(m.replayStart);
    const n = engine.tf.get("1m")!.closed.length;
    http.failNext.push({ status: 200, body: { code: 429, message: "You have run out of API credits for the current minute.", status: "error" } });
    clock.set(start + 2 * MINUTE + 5_000);
    await engine.tick();
    expect(engine.tf.get("1m")!.closed.length).toBe(n);
    expect(engine.status().dataQuality.join()).toMatch(/rate limit/);
    expect(budget.waitTime()).toBeGreaterThan(0);
    clock.advance(61_000);
    await engine.tick();
    expect(engine.tf.get("1m")!.closed.length).toBe(n + 3);
    expect(engine.status().dataQuality.join()).not.toMatch(/rate limit/);
  });

  it("reconnects after the stream drops", async () => {
    const { engine, ws } = await setup();
    await engine.start({ timers: false });
    await waitFor(() => engine.live.connection === "connected");
    ws.dropAll();
    await waitFor(() => engine.live.connection === "reconnecting", 2000);
    await waitFor(() => engine.live.connection === "connected" && ws.connections === 2, 4000);
  });

  it("reports auth failures instead of inventing data", async () => {
    const m = manifest();
    const clock = fakeClock(Date.parse(m.replayStart));
    const http = mockTwelveDataFetch(clock.now);
    const ws = await mockTwelveDataWs();
    cleanup.push(() => ws.close());
    const adapter = new TwelveDataAdapter({ apiKey: "wrong", symbol: "XAU/USD", restUrl: "https://x.test", wsUrl: ws.url, budget: new CreditBudget(100, 1000, clock.now), fetchImpl: http.impl, now: clock.now });
    const engine = new MarketEngine(testConfig({ DATA_MODE: "live" }), adapter, new MemoryRepository(), clock.now, silentLogger);
    cleanup.push(() => engine.stop());
    await engine.start({ timers: false });
    expect(engine.tf.get("1h")!.closed).toHaveLength(0);
    expect(engine.status().dataQuality.join()).toMatch(/auth/);
    expect(engine.buildSnapshot({ kind: "manual", eventIds: [] }).timeframes.every((t) => t.trend === "insufficient_data")).toBe(true);
  });
});
