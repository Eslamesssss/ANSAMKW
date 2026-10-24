import { describe, expect, it } from "vitest";
import { analyzeStructure, nearestLevels } from "../src";
import { bar, syntheticCandles } from "./helpers";

const M = 60_000;

/** Hand-built zig-zag: up-leg, pullback, higher high, then a sharp drop. */
function zigzag() {
  const closes = [100, 101, 102, 104, 106, 105, 103, 102, 103, 105, 107, 109, 108, 106, 104, 103, 104, 103, 100, 97, 95, 94, 95, 94];
  return closes.map((c, i) => bar(i * M, c, c + 0.5, c - 0.5, c));
}

describe("market structure", () => {
  it("confirms swings only after `right` bars have closed", () => {
    const res = analyzeStructure("1m", zigzag(), { left: 2, right: 2 });
    for (const s of res.swings) {
      expect(s.confirmedIndex).toBe(s.index + 2);
      expect(s.confirmedAt).toBe((s.confirmedIndex + 1) * M);
    }
    const highs = res.swings.filter((s) => s.type === "high");
    expect(highs.map((h) => h.label)).toEqual(["FIRST", "HH"]);
  });

  it("emits BOS then CHoCH when structure flips", () => {
    const res = analyzeStructure("1m", zigzag(), { left: 2, right: 2 });
    const breaks = res.events.flatMap((e) => (e.kind === "bos" || e.kind === "choch" ? [e] : []));
    expect(breaks.length).toBeGreaterThanOrEqual(2);
    const first = breaks[0]!;
    expect(first.kind).toBe("bos");
    expect(first.direction).toBe("bullish");
    const flip = breaks.find((e) => e.direction === "bearish")!;
    expect(flip.kind).toBe("choch");
    expect(flip.close).toBeLessThan(flip.level);
    expect(res.trend).toBe("bearish");
  });

  it("does not repaint: analysing any prefix gives identical events", () => {
    const candles = syntheticCandles(600, { seed: 7 });
    const full = analyzeStructure("5m", candles);
    for (const n of [50, 123, 300, 599]) {
      const prefix = analyzeStructure("5m", candles.slice(0, n));
      const fullUpTo = full.events.filter((e) => e.index < n);
      expect(prefix.events).toEqual(fullUpTo);
    }
  });

  it("never uses future bars: no event is knowable before its bar closes", () => {
    const candles = syntheticCandles(400, { seed: 3 });
    const res = analyzeStructure("1m", candles);
    for (const e of res.events) {
      expect(e.confirmedAt).toBe(candles[e.index]!.openTime + M);
      if (e.kind === "swing") expect(e.swing.index).toBeLessThan(e.index);
    }
  });

  it("detects breakout and retest of a level", () => {
    // Resistance formed at ~110 by two swing highs, breakout, then pullback to 110 holding.
    const closes = [100, 104, 108, 110, 108, 105, 103, 105, 108, 110, 108, 105, 104, 106, 109, 113, 115, 113, 111, 112, 114, 116];
    const candles = closes.map((c, i) => bar(i * M, c, c + 0.3, c - 0.3, c));
    const res = analyzeStructure("1m", candles, { left: 2, right: 2, levelToleranceAtr: 1, breakoutBufferAtr: 0.1 });
    const level = res.levels.find((l) => Math.abs(l.price - 110.3) < 0.5)!;
    expect(level.touches).toBeGreaterThanOrEqual(2);
    const bo = res.events.find((e) => e.kind === "breakout" && e.levelId === level.id);
    expect(bo).toBeDefined();
    const rt = res.events.find((e) => e.kind === "retest" && e.levelId === level.id);
    expect(rt).toBeDefined();
    expect(rt!.index).toBeGreaterThan(bo!.index);
  });

  it("ranks nearest support and resistance", () => {
    const levels = [100, 105, 110, 115].map((p, i) => ({ id: `L${i}`, price: p, touches: 1, firstSeen: 0, lastTouched: 0, sources: [] }));
    const r = nearestLevels(levels, 108, 1);
    expect(r.map((l) => [l.id, l.role])).toEqual([["L2", "resistance"], ["L1", "support"]]);
  });
});
