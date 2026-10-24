import { describe, expect, it } from "vitest";
import type { PriceUpdate } from "@gold/core";
import { LivePriceState } from "../../src/engine/liveState";
import { WeightBudget } from "../../src/market/binance/weightBudget";
import { fakeClock } from "../support/helpers";

describe("WeightBudget", () => {
  it("stops at the safety share of the per-minute weight limit", () => {
    const clock = fakeClock(Date.UTC(2026, 0, 1, 12, 0, 10));
    const b = new WeightBudget(100, 0.5, clock.now);
    b.take(40);
    b.take(10);
    expect(() => b.take(1)).toThrow(/budget exhausted/);
    clock.advance(61_000);
    expect(() => b.take(10)).not.toThrow();
  });
  it("honours the server-reported used weight for the current minute", () => {
    const clock = fakeClock(Date.UTC(2026, 0, 1, 12, 0, 10));
    const b = new WeightBudget(100, 0.8, clock.now);
    b.report(79);
    expect(() => b.take(2)).toThrow();
    clock.set(Date.UTC(2026, 0, 1, 12, 1, 0)); // new wall-clock minute resets the server window
    expect(() => b.take(2)).not.toThrow();
  });
  it("blocks on 429/418 until Retry-After passes", () => {
    const clock = fakeClock(0);
    const b = new WeightBudget(2400, 0.5, clock.now);
    b.block(30_000, "banned");
    expect(() => b.take(1)).toThrow(/IP ban/);
    expect(b.stats().blockReason).toBe("banned");
    clock.advance(30_000);
    expect(() => b.take(1)).not.toThrow();
  });
});

const upd = (price: number, t: number, recv = t + 200): PriceUpdate => ({ symbol: "XAU/USD", price, providerTime: t, receivedAt: recv, bid: null, ask: null, priceKind: "indicative", source: "twelvedata-ws", origin: "live" });

describe("LivePriceState", () => {
  it("counts duplicates and out-of-order frames separately from updates", () => {
    const s = new LivePriceState(15_000, 60_000);
    expect(s.accept(upd(2000, 1000))).toBe(true);
    expect(s.accept(upd(2000, 1000, 1300))).toBe(false);
    expect(s.accept(upd(1999, 500))).toBe(false);
    expect(s.accept(upd(2001, 2000))).toBe(true);
    expect({ messages: s.messages, distinct: s.distinct, duplicates: s.duplicates, outOfOrder: s.outOfOrder }).toEqual({ messages: 4, distinct: 2, duplicates: 1, outOfOrder: 1 });
  });
  it("uses any-stream activity for freshness and corrects latency for clock offset", () => {
    const s = new LivePriceState(5_000, 30_000);
    s.clockOffsetMs = 1000; // exchange clock ahead of ours
    s.accept({ ...upd(2000, 10_000, 9_400), source: "binance-ws:aggTrade" });
    expect(s.avgLatencyMs).toBe(400);
    // No trade for 40s, but mark/book messages arrived 1s ago: the feed is fresh.
    expect(s.freshness(49_400, true, 48_400)).toBe("fresh");
    expect(s.freshness(49_400, true)).toBe("stale");
  });
  it("classifies freshness, including closed markets", () => {
    const s = new LivePriceState(15_000, 60_000);
    expect(s.freshness(0, true)).toBe("no_data");
    expect(s.freshness(0, false)).toBe("market_closed");
    s.accept(upd(2000, 0, 0));
    expect(s.freshness(5_000, true)).toBe("fresh");
    expect(s.freshness(20_000, true)).toBe("delayed");
    expect(s.freshness(70_000, true)).toBe("stale");
    expect(s.freshness(70_000, false)).toBe("market_closed");
  });
});
