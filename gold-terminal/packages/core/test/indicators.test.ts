import { describe, expect, it } from "vitest";
import { atr, ema, rsi, trueRange } from "../src";
import { syntheticCandles } from "./helpers";

describe("ema", () => {
  it("seeds with SMA and applies multiplier", () => {
    const out = ema([1, 2, 3, 4, 5, 6], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(2, 10);
    expect(out[3]).toBeCloseTo(3, 10); // 4*0.5 + 2*0.5
    expect(out[5]).toBeCloseTo(5, 10);
  });
  it("returns all nulls when not enough data", () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });
});

describe("rsi (Wilder)", () => {
  // Reference values from the widely published StockCharts RSI worked example.
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
  // The published table rounds the average gain/loss to 2 decimals at each step,
  // so unrounded Wilder values differ by < 0.1.
  it("matches the published worked example", () => {
    const out = rsi(closes, 14);
    expect(out[13]).toBeNull();
    expect(out[14]).toBeCloseTo(70.53, 0);
    expect(out[15]).toBeCloseTo(66.32, 0);
    expect(out[16]).toBeCloseTo(66.55, 0);
    expect(out[17]).toBeCloseTo(69.41, 0);
    expect(out[18]).toBeCloseTo(66.36, 0);
    expect(out[19]).toBeCloseTo(57.97, 0);
  });
  it("is bounded and 100 for monotonic rise", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up, 14)[29]).toBe(100);
    const flat = Array.from({ length: 30 }, () => 100);
    expect(rsi(flat, 14)[29]).toBe(50);
  });
});

describe("atr (Wilder)", () => {
  it("matches a naive recomputation", () => {
    const c = syntheticCandles(100);
    const tr = trueRange(c);
    const out = atr(c, 14);
    let ref = tr.slice(1, 15).reduce((a, b) => a + b, 0) / 14;
    expect(out[14]).toBeCloseTo(ref, 10);
    for (let i = 15; i < 100; i++) ref = (ref * 13 + tr[i]!) / 14;
    expect(out[99]).toBeCloseTo(ref, 10);
  });
  it("is causal: appending bars never changes earlier values", () => {
    const c = syntheticCandles(300);
    const full = atr(c, 14);
    const prefix = atr(c.slice(0, 200), 14);
    expect(full.slice(0, 200)).toEqual(prefix);
    expect(ema(c.map((x) => x.close), 50).slice(0, 200)).toEqual(ema(c.slice(0, 200).map((x) => x.close), 50));
  });
});
