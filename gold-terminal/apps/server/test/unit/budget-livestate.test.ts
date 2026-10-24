import { describe, expect, it } from "vitest";
import type { PriceUpdate } from "@gold/core";
import { LivePriceState } from "../../src/engine/liveState";
import { CreditBudget } from "../../src/market/twelvedata/creditBudget";
import { fakeClock } from "../support/helpers";

describe("CreditBudget", () => {
  it("enforces per-minute and per-day limits locally", () => {
    const clock = fakeClock(Date.UTC(2024, 0, 1, 12));
    const b = new CreditBudget(2, 3, clock.now);
    b.take();
    b.take();
    expect(() => b.take()).toThrow(/Per-minute/);
    clock.advance(61_000);
    b.take();
    expect(() => b.take()).toThrow(/Daily/);
    clock.set(Date.UTC(2024, 0, 2, 0, 0, 1));
    expect(() => b.take()).not.toThrow();
  });
  it("honours upstream rate-limit blocks", () => {
    const clock = fakeClock(0);
    const b = new CreditBudget(100, 1000, clock.now);
    b.block(30_000);
    expect(b.waitTime()).toBe(30_000);
    clock.advance(30_000);
    expect(b.waitTime()).toBe(0);
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
