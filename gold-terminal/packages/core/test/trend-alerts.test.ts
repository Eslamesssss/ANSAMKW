import { describe, expect, it } from "vitest";
import { alertRuleSchema, applyCooldown, classifyTrend, evaluateRules, type CloseContext } from "../src";
import { bar, syntheticCandles } from "./helpers";

describe("trend classification", () => {
  it("reports insufficient_data below warm-up", () => {
    expect(classifyTrend("1h", syntheticCandles(300)).state).toBe("insufficient_data");
  });
  it("is bullish on a steady uptrend and bearish on a downtrend", () => {
    expect(classifyTrend("1h", syntheticCandles(800, { drift: 0.4 })).state).toBe("bullish");
    expect(classifyTrend("1h", syntheticCandles(800, { drift: -0.4 })).state).toBe("bearish");
  });
});

const M = 60_000;
const rules = [
  alertRuleSchema.parse({ id: "r1", name: "cross 2000", type: "level_cross", timeframe: "15m", source: "manual", price: 2000, direction: "up" }),
  alertRuleSchema.parse({ id: "r2", name: "bos", type: "structure_break", timeframe: "15m", kinds: ["bos"] }),
  alertRuleSchema.parse({ id: "r3", name: "trend", type: "trend_change", timeframe: "15m", to: "bullish" }),
  alertRuleSchema.parse({ id: "r4", name: "close", type: "candle_close", timeframe: "1h" }),
];

function ctx(over: Partial<CloseContext> = {}): CloseContext {
  return {
    timeframe: "15m",
    candle: bar(15 * M, 1999, 2003, 1998, 2002),
    prevCandle: bar(0, 1995, 2000, 1994, 1999),
    trendBefore: "neutral",
    trendAfter: "bullish",
    events: [{ id: "e1", kind: "bos", direction: "bullish", brokenSwingId: "s1", level: 2001, timeframe: "15m", openTime: 15 * M, index: 1, confirmedAt: 30 * M, close: 2002 }],
    ...over,
  };
}

describe("alert evaluation", () => {
  it("fires level cross, structure break and trend change on a confirmed close", () => {
    const c = evaluateRules(rules, ctx());
    expect(c.map((x) => x.ruleId).sort()).toEqual(["r1", "r2", "r3"]);
  });
  it("produces stable dedupe keys for the same candle", () => {
    const a = evaluateRules(rules, ctx()).map((x) => x.dedupeKey);
    const b = evaluateRules(rules, ctx()).map((x) => x.dedupeKey);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
  it("ignores trend changes from/to insufficient_data and other timeframes", () => {
    expect(evaluateRules(rules, ctx({ trendBefore: "insufficient_data", events: [] })).map((x) => x.ruleId)).toEqual(["r1"]);
    expect(evaluateRules(rules, ctx({ timeframe: "5m" }))).toEqual([]);
  });
  it("applies cooldown per rule", () => {
    const cand = evaluateRules(rules, ctx());
    const fired = new Map([["r1", 1_000_000]]);
    const withCd = rules.map((r) => (r.id === "r1" ? { ...r, cooldownSec: 3600 } : r));
    const kept = applyCooldown(cand, withCd, fired, 1_000_000 + 60_000);
    expect(kept.map((x) => x.ruleId)).not.toContain("r1");
  });
});
