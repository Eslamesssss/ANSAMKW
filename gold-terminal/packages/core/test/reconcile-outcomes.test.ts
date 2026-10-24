import { describe, expect, it } from "vitest";
import { computeOutcome, diffCandles, findGaps, isSaneCandle } from "../src";
import { bar } from "./helpers";

const M = 60_000;
describe("reconciliation", () => {
  it("reports changed, missing local and missing provider bars", () => {
    const local = [bar(0, 1, 2, 0.5, 1.5), bar(M, 1.5, 2, 1, 1.8), bar(2 * M, 1.8, 2, 1.7, 1.9)];
    const provider = [bar(0, 1, 2, 0.5, 1.5), bar(M, 1.5, 2.1, 1, 1.8), bar(3 * M, 1.9, 2, 1.8, 1.95)];
    const d = diffCandles(local, provider);
    expect(d.map((x) => [x.openTime, x.kind])).toEqual([[M, "changed"], [2 * M, "missing_provider"], [3 * M, "missing_local"]]);
  });
  it("finds gaps and validates OHLC sanity", () => {
    expect(findGaps([bar(0, 1, 1, 1, 1), bar(3 * M, 1, 1, 1, 1)], M)).toEqual([{ from: M, to: 3 * M }]);
    expect(isSaneCandle(bar(0, 1, 0.5, 0.4, 1))).toBe(false);
    expect(isSaneCandle(bar(0, 1, 2, 0.5, 1.5))).toBe(true);
  });
});

describe("outcomes", () => {
  const bars = Array.from({ length: 20 }, (_, i) => bar(i * M, 100 + i, 100.5 + i, 99.5 + i, 100 + i));
  it("is pending until the horizon elapses and never extrapolates", () => {
    expect(computeOutcome(100, 0, 15, bars, 10 * M).status).toBe("pending");
  });
  it("measures close, extremes and change after the horizon", () => {
    const o = computeOutcome(100, M, 15, bars, 30 * M);
    expect(o.status).toBe("complete");
    expect(o.barsSeen).toBe(15);
    expect(o.closeAtHorizon).toBe(115);
    expect(o.maxHigh).toBe(115.5);
    expect(o.minLow).toBe(100.5);
    expect(o.changeAbs).toBe(15);
  });
});
