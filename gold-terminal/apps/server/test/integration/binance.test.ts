import { afterEach, describe, expect, it } from "vitest";
import { alertRuleSchema, MINUTE } from "@gold/core";
import { MemoryRepository } from "../../src/db/memoryRepository";
import { MarketEngine } from "../../src/engine/engine";
import { BinanceFuturesAdapter, BOOK_STREAMS, MARKET_STREAMS } from "../../src/market/binance/adapter";
import { WeightBudget } from "../../src/market/binance/weightBudget";
import { fakeClock, manifest, silentLogger, testConfig } from "../support/helpers";
import { mockBinanceRest, mockBinanceWs, recordedFrames } from "../support/mockBinance";

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

async function setup(opts: { silenceTimeoutMs?: number } = {}) {
  const m = manifest();
  const start = Date.parse(m.replayStart);
  const clock = fakeClock(start);
  const rest = mockBinanceRest(clock.now);
  const ws = await mockBinanceWs();
  const budget = new WeightBudget(2400, 0.5, clock.now);
  const adapter = new BinanceFuturesAdapter({ restUrl: "https://fapi.binance.test", wsMarketUrl: ws.marketUrl, wsBookUrl: ws.bookUrl, budget, fetchImpl: rest.impl, now: clock.now, silenceTimeoutMs: opts.silenceTimeoutMs ?? 1e12 });
  const repo = new MemoryRepository();
  const engine = new MarketEngine(testConfig({ DATA_MODE: "live" }), adapter, repo, clock.now, silentLogger);
  cleanup.push(() => ws.close(), () => engine.stop());
  return { start, clock, rest, ws, budget, adapter, repo, engine };
}

/** Send recorded frames whose receive time falls in [from, to), with the clock set to `to`. */
function replay(ws: Awaited<ReturnType<typeof mockBinanceWs>>, clock: ReturnType<typeof fakeClock>, from: number, to: number) {
  const frames = recordedFrames().filter((f) => f.receivedAt >= from && f.receivedAt < to);
  clock.set(to);
  for (const f of frames) ws.send(f.raw);
  return frames.length;
}

describe("Binance USDⓈ-M XAUUSDT pipeline (mock exchange)", () => {
  it("validates the contract, loads history, syncs market state and subscribes to the right streams", async () => {
    const { engine, rest, ws, budget } = await setup();
    await engine.start({ timers: false });
    expect(engine.startupProblem).toBeNull();
    expect(engine.market.contract).toMatchObject({ symbol: "XAUUSDT", quoteAsset: "USDT", marginAsset: "USDT", status: "TRADING" });
    expect(engine.session()).toEqual({ open: true, reason: "trading" });

    const klines = rest.calls.filter((u) => u.pathname === "/fapi/v1/klines");
    expect(klines.slice(0, 6).map((u) => u.searchParams.get("interval"))).toEqual(["1m", "5m", "15m", "1h", "4h", "1d"]);
    expect(klines.every((u) => u.searchParams.get("symbol") === "XAUUSDT")).toBe(true);
    for (const p of ["/fapi/v1/exchangeInfo", "/fapi/v1/depth", "/fapi/v1/ticker/bookTicker", "/fapi/v1/premiumIndex", "/fapi/v1/ticker/24hr", "/fapi/v1/openInterest", "/futures/data/openInterestHist", "/fapi/v1/fundingRate", "/fapi/v1/time"]) {
      expect(rest.count(p), p).toBeGreaterThan(0);
    }
    // Public data only: no credentials anywhere.
    expect(rest.calls.some((u) => u.searchParams.has("apikey") || u.searchParams.has("signature"))).toBe(false);

    for (const tf of ["1m", "5m", "15m", "1h", "4h"] as const) expect(engine.tf.get(tf)!.trend.state, tf).not.toBe("insufficient_data");
    // The contract is young: 1d history is below the EMA200 warm-up and is reported, not padded.
    expect(engine.tf.get("1d")!.trend.state).toBe("insufficient_data");
    expect(engine.status().dataQuality.join()).toMatch(/only \d+ 1d bars/);

    const v = engine.marketView();
    expect(v.mark?.markPrice).toBeGreaterThan(0);
    expect(v.depth?.bids).toHaveLength(20);
    expect(v.openInterest?.change1h).not.toBeNull();
    expect(v.funding).toMatchObject({ intervalHours: 8, intervalSource: "history" });
    expect(engine.market.clockOffsetMs).toBe(250);
    expect(budget.stats().usedServer).toBeGreaterThan(0);

    await waitFor(() => engine.live.connection === "connected");
    const market = ws.connections.find((c) => c.path === "/market/stream")!;
    const book = ws.connections.find((c) => c.path === "/public/stream")!;
    expect(market.streams).toEqual(MARKET_STREAMS);
    expect(book.streams).toEqual(BOOK_STREAMS);
    expect(market.streams).toContain("xauusdt@markPrice@1s");
    expect(book.streams).toContain("xauusdt@depth20@100ms");
  });

  it("streams trades, book, mark, ticker and klines; confirms closes from final klines and REST without duplicates", async () => {
    const { engine, clock, ws, repo, start } = await setup();
    await repo.saveRule(alertRuleSchema.parse({ id: "every-1m", name: "1m close", type: "candle_close", timeframe: "1m" }));
    await engine.start({ timers: false });
    await waitFor(() => engine.live.connection === "connected");
    const before = engine.tf.get("1m")!.closed.length;

    const sent = replay(ws, clock, start, start + 2 * MINUTE + 1000);
    await waitFor(() => engine.market.streamHealth(clock.now()).reduce((s, h) => s + h.messages, 0) >= sent - 5);

    const p = engine.priceView();
    expect(p.priceKind).toBe("last");
    expect(p.source).toBe("binance-ws:aggTrade");
    expect(p.bid).toBeLessThan(p.ask!);
    expect(p.spread).toBeGreaterThan(0);
    expect(p.markPrice).toBeGreaterThan(0);
    expect(p.changeReference?.label).toMatch(/24h/);
    expect(p.freshness).toBe("fresh");
    expect(engine.market.depth?.bids.length).toBe(20);
    expect(engine.tf.get("5m")!.forming?.status).toBe("forming");
    expect(engine.tf.get("5m")!.forming?.volume).toBeGreaterThan(0);

    // Final 1m klines (x=true) were ingested as confirmed bars straight from the stream.
    await waitFor(() => engine.tf.get("1m")!.closed.length === before + 2);
    expect(engine.tf.get("1m")!.closed.at(-1)!.status).toBe("confirmed");
    expect(engine.tf.get("1m")!.closed.at(-1)!.volume).toBeGreaterThan(0);
    const alertsAfterStream = await repo.listAlertEvents({ limit: 10 });
    expect(alertsAfterStream).toHaveLength(2);
    expect(alertsAfterStream.every((a) => a.symbol === "XAUUSDT")).toBe(true);

    // REST reconciliation agrees with the stream: no revisions, no duplicate alerts.
    clock.set(start + 2 * MINUTE + 5_000);
    await engine.tick();
    expect(repo.revisions).toHaveLength(0);
    expect(await repo.listAlertEvents({ limit: 10 })).toHaveLength(2);

    const snap = engine.buildSnapshot({ kind: "manual", eventIds: [] });
    expect(snap.contract).toMatchObject({ symbol: "XAUUSDT", quoteAsset: "USDT" });
    expect(snap.derivatives?.markPrice).toBeGreaterThan(0);
    expect(snap.derivatives?.fundingIntervalHours).toBe(8);
    expect(snap.book?.spread).toBeGreaterThan(0);
    expect(snap.indexRegime?.regime).toBe("underlying_hours");
    expect(snap.references.map((r) => r.id)).toEqual(expect.arrayContaining(["PRICE", "MARK", "INDEX"]));
  });

  it("confirms the 1h close natively when the replay crosses the hour", async () => {
    const { engine, clock, ws, start, rest } = await setup();
    await engine.start({ timers: false });
    await waitFor(() => engine.live.connection === "connected");
    const hourOpen = Math.floor((start + 15 * MINUTE) / 3_600_000) * 3_600_000 - 3_600_000; // 12:00
    replay(ws, clock, start, hourOpen + 3_600_000 + 2_000);
    await waitFor(() => engine.tf.get("1h")!.closed.at(-1)!.openTime === hourOpen);
    clock.set(hourOpen + 3_600_000 + 10_000);
    for (let i = 0; i < 8; i++) await engine.tick();
    expect(rest.calls.some((u) => u.searchParams.get("interval") === "1h" && u.searchParams.get("limit") === "3")).toBe(true);
    expect(engine.tf.get("1h")!.closed.at(-1)).toMatchObject({ openTime: hourOpen, status: "confirmed" });
  });

  it("reconnects after a drop and resynchronises over REST", async () => {
    const { engine, ws, rest } = await setup();
    await engine.start({ timers: false });
    await waitFor(() => engine.live.connection === "connected");
    const depthCalls = rest.count("/fapi/v1/depth");
    ws.dropAll();
    await waitFor(() => engine.live.connection === "reconnecting", 2000);
    await waitFor(() => engine.live.connection === "connected" && ws.connections.length === 4, 5000);
    await engine.tick();
    expect(rest.count("/fapi/v1/depth")).toBe(depthCalls + 1);
  });

  it("forces a reconnect when a connection goes silent", async () => {
    const { engine, clock, ws } = await setup({ silenceTimeoutMs: 15_000 });
    await engine.start({ timers: false });
    await waitFor(() => engine.live.connection === "connected");
    clock.advance(20_000);
    await waitFor(() => ws.connections.length >= 4, 8000);
    expect(engine.status().dataQuality.join()).toMatch(/stream(:| stale)/);
  });

  it("backs off on 429 with Retry-After and never fabricates bars", async () => {
    const { engine, clock, rest, budget, start } = await setup();
    await engine.start({ timers: false });
    const n = engine.tf.get("1m")!.closed.length;
    rest.failNext.push({ status: 429, body: { code: -1003, msg: "Too many requests; current limit is 2400 request weight per 1 MINUTE." }, headers: { "retry-after": "30" } });
    clock.set(start + 2 * MINUTE + 5_000);
    await engine.tick();
    expect(engine.tf.get("1m")!.closed.length).toBe(n);
    expect(engine.status().dataQuality.join()).toMatch(/HTTP 429/);
    expect(budget.stats().blockReason).toBe("rate_limited");
    expect(budget.waitTime(1)).toBe(30_000);
    clock.advance(31_000);
    await engine.tick();
    expect(engine.tf.get("1m")!.closed.length).toBe(n + 2);
  });

  it("stops all REST calls during an IP ban (418)", async () => {
    const { engine, clock, rest, budget, start } = await setup();
    await engine.start({ timers: false });
    rest.failNext.push({ status: 418, body: { code: -1003, msg: "Way too many requests; IP banned." }, headers: { "retry-after": "120" } });
    clock.set(start + 2 * MINUTE + 5_000);
    await engine.tick();
    const calls = rest.calls.length;
    clock.advance(60_000);
    await engine.tick();
    expect(rest.calls.length).toBe(calls);
    expect(budget.stats().blockReason).toBe("banned");
  });

  it("refuses to run when XAUUSDT is missing, even if other gold contracts exist", async () => {
    const { engine, rest, ws } = await setup();
    const info = rest.readRest("/fapi/v1/exchangeInfo");
    info.symbols = [{ ...info.symbols[0], symbol: "PAXGUSDT", baseAsset: "PAXG" }, { ...info.symbols[0], symbol: "XAUTUSDT", baseAsset: "XAUT" }];
    rest.override("/fapi/v1/exchangeInfo", info);
    await engine.start({ timers: false });
    expect(engine.startupProblem).toMatch(/XAUUSDT is not listed/);
    expect(engine.startupProblem).toMatch(/no other instrument is substituted/);
    expect(rest.count("/fapi/v1/klines")).toBe(0);
    expect(ws.connections).toHaveLength(0);
    expect(engine.session().open).toBe(false);
  });

  it("follows exchange status changes from exchangeInfo", async () => {
    const { engine, clock, rest, start } = await setup();
    await engine.start({ timers: false });
    const info = rest.readRest("/fapi/v1/exchangeInfo");
    info.symbols[0].status = "BREAK";
    rest.override("/fapi/v1/exchangeInfo", info);
    clock.set(start + 301_000);
    await engine.tick();
    expect(engine.session()).toEqual({ open: false, reason: "exchange_status_break" });
    expect(engine.buildSnapshot({ kind: "manual", eventIds: [] }).contract?.status).toBe("BREAK");
    expect(engine.status().dataQuality.join()).toMatch(/status is BREAK/);
  });
});
