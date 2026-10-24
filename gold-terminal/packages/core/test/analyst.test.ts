import { describe, expect, it } from "vitest";
import { analystOutputSchema, marketSnapshotSchema, snapshotBlockers, validateAnalystOutput, type AnalystOutput, type MarketSnapshot } from "../src";

const snapshot: MarketSnapshot = marketSnapshotSchema.parse({
  snapshotVersion: 1,
  symbol: "XAU/USD",
  generatedAt: "2024-05-15T12:00:00.000Z",
  dataOrigin: "fixture",
  price: { value: 2350.4, kind: "mid", executable: false, source: "test", providerTime: "2024-05-15T11:59:59.000Z", receivedAt: "2024-05-15T12:00:00.000Z", ageMs: 1000, freshness: "fresh" },
  session: { open: true, reason: "open" },
  feed: { connection: "connected", latencyMs: 200 },
  timeframes: [{ timeframe: "1h", lastClosedOpenTime: "2024-05-15T10:00:00.000Z", lastClosedCloseTime: "2024-05-15T11:00:00.000Z", candleStatus: "confirmed", barsUsed: 1000, close: 2349, ema20: 2340, ema50: 2330, ema200: 2300, rsi14: 61, atr14: 9, trend: "bullish", trendRules: [], structureTrend: "bullish", lastSwingHighRef: "1h:SH:1", lastSwingLowRef: "1h:SL:1", recentEvents: [] }],
  references: [
    { id: "1h:L:1", kind: "level", timeframe: "1h", price: 2360, description: "resistance" },
    { id: "1h:SL:1", kind: "swing_low", timeframe: "1h", price: 2335, description: "swing low" },
    { id: "1h:SH:1", kind: "swing_high", timeframe: "1h", price: 2355, description: "swing high" },
    { id: "1h:L:2", kind: "level", timeframe: "1h", price: 2380, description: "resistance" },
  ],
  trigger: { kind: "manual", eventIds: [] },
  dataQuality: [],
});

const good: AnalystOutput = {
  bias: "bullish",
  headline_ar: "الاتجاه على 1h صاعد",
  summary_ar: "السعر فوق EMA200 عند 2300 والـ RSI 61",
  scenarios: [{ direction: "bullish", title_ar: "استمرار الصعود", trigger_ar: "إغلاق 1h فوق 2355", trigger_ref: "1h:SH:1", invalidation_ref: "1h:SL:1", target_refs: ["1h:L:1", "1h:L:2"], evidence: [{ ref: "1h:SH:1", explanation_ar: "قمة حديثة" }] }],
  conflicting_signals: [],
  wait_conditions: [{ condition_ar: "استنى إغلاق فوق القمة", refs: ["1h:SH:1"] }],
  action: "MONITOR_BULLISH_SCENARIO",
  data_quality_ar: "البيانات من fixture",
};

describe("analyst output validation", () => {
  it("accepts a well-formed, fully referenced output", () => {
    expect(analystOutputSchema.parse(good)).toBeTruthy();
    expect(validateAnalystOutput(good, snapshot)).toEqual({ ok: true, errors: [] });
  });
  it("rejects unknown refs, invented prices and percentages", () => {
    const bad: AnalystOutput = {
      ...good,
      summary_ar: "هدف عند 2412 ونسبة نجاح ٧٠٪",
      scenarios: [{ ...good.scenarios[0]!, target_refs: ["nope"] }],
    };
    const v = validateAnalystOutput(bad, snapshot);
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toMatch(/unknown reference "nope"/);
    expect(v.errors.join("\n")).toMatch(/unsupported number 2412/);
    expect(v.errors.join("\n")).toMatch(/percentage/);
  });
  it("rejects incoherent scenario geometry", () => {
    const bad = { ...good, scenarios: [{ ...good.scenarios[0]!, invalidation_ref: "1h:L:2" }] };
    expect(validateAnalystOutput(bad, snapshot).errors.join()).toMatch(/invalidation must be below/);
  });
  it("blocks fixture snapshots from the live analyst and stale prices", () => {
    expect(snapshotBlockers(snapshot, { allowFixture: false, maxPriceAgeMs: 60_000 })).toContain("snapshot built from fixture data");
    const stale = { ...snapshot, price: { ...snapshot.price!, ageMs: 600_000 } };
    expect(snapshotBlockers(stale, { allowFixture: true, maxPriceAgeMs: 60_000 })[0]).toMatch(/stale/);
  });
});
