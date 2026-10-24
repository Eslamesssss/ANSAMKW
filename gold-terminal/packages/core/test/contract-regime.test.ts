import { describe, expect, it } from "vitest";
import { floorToStep, indexRegime, INDEX_STATIC_THRESHOLD_MS, roundToStep, sizePosition, stepDecimals, type ContractSpec } from "../src";

/** Illustrative spec for arithmetic tests only; the app reads the real one from exchangeInfo. */
const spec: ContractSpec = {
  exchange: "binance-usdm",
  symbol: "XAUUSDT",
  pair: "XAUUSDT",
  contractType: "PERPETUAL",
  status: "TRADING",
  baseAsset: "XAU",
  quoteAsset: "USDT",
  marginAsset: "USDT",
  underlyingType: null,
  underlyingSubType: [],
  pricePrecision: 2,
  quantityPrecision: 3,
  tickSize: 0.01,
  minPrice: 1,
  maxPrice: 100000,
  stepSize: 0.001,
  minQty: 0.001,
  maxQty: 100,
  marketStepSize: 0.001,
  marketMinQty: 0.001,
  marketMaxQty: 50,
  minNotional: 5,
  maintMarginPercent: null,
  requiredMarginPercent: null,
  liquidationFee: null,
  onboardDate: null,
  deliveryDate: null,
  fetchedAt: 0,
};

describe("step arithmetic", () => {
  it("floors and rounds to steps without float drift", () => {
    expect(stepDecimals(0.001)).toBe(3);
    expect(stepDecimals(1e-7)).toBe(7);
    expect(floorToStep(0.0299999999, 0.001)).toBe(0.029);
    expect(floorToStep(0.03, 0.001)).toBe(0.03);
    expect(roundToStep(3312.345, 0.01)).toBe(3312.35);
  });
});

describe("sizePosition (USDT)", () => {
  it("sizes a long so the loss at the stop incl. fees fits the risk budget", () => {
    const r = sizePosition(spec, { side: "long", equityUsdt: 10_000, riskPct: 1, entry: 3300, stop: 3290, targets: [3320, 3340, 3280], leverage: 10, feeRate: 0.0005, orderType: "limit" });
    expect(r.ok).toBe(true);
    // per-unit loss = 10 + 0.0005*(3300+3290) = 13.295 → 100/13.295 = 7.5216 → floor 7.521
    expect(r.quantity).toBe(7.521);
    expect(r.riskAtStopUsdt).toBeLessThanOrEqual(100);
    expect(r.riskAtStopUsdt).toBeGreaterThan(99.9);
    expect(r.notionalUsdt).toBeCloseTo(7.521 * 3300, 6);
    expect(r.initialMarginUsdt).toBeCloseTo((7.521 * 3300) / 10, 6);
    expect(r.targets.map((t) => t.price)).toEqual([3320, 3340]); // 3280 is on the wrong side
    expect(r.targets[0]!.pnlUsdt).toBeCloseTo(7.521 * 20 - 0.0005 * 7.521 * (3300 + 3320), 6);
    expect(r.targets[0]!.rMultiple).toBeCloseTo(r.targets[0]!.pnlUsdt / r.riskAtStopUsdt, 10);
    expect(r.targets[0]!.rMultiple).toBeCloseTo(1.2554, 3);
  });
  it("sizes a short and rounds prices to the tick", () => {
    const r = sizePosition(spec, { side: "short", equityUsdt: 5_000, riskUsdt: 50, entry: 3300.004, stop: 3310.006, targets: [3250], leverage: 5, feeRate: 0, orderType: "market" });
    expect(r.entry).toBe(3300);
    expect(r.stop).toBe(3310.01);
    expect(r.quantity).toBe(4.995);
    expect(r.targets[0]!.pnlUsdt).toBeCloseTo(4.995 * 50, 6);
  });
  it("rejects inconsistent inputs and sizes below contract minimums", () => {
    expect(sizePosition(spec, { side: "long", equityUsdt: 1000, riskPct: 1, entry: 3300, stop: 3310, leverage: 1, feeRate: 0, orderType: "limit" }).errors[0]).toMatch(/below entry/);
    const tiny = sizePosition(spec, { side: "long", equityUsdt: 100, riskUsdt: 0.001, entry: 3300, stop: 3200, leverage: 1, feeRate: 0, orderType: "limit" });
    expect(tiny.ok).toBe(false);
    expect(tiny.errors[0]).toMatch(/minimum quantity/);
    const notional = sizePosition({ ...spec, minNotional: 100 }, { side: "long", equityUsdt: 100, riskUsdt: 0.1, entry: 3300, stop: 3290, leverage: 1, feeRate: 0, orderType: "limit" });
    expect(notional.errors[0]).toMatch(/below the contract minimum 100 USDT/);
  });
  it("caps at the market max quantity", () => {
    const r = sizePosition(spec, { side: "long", equityUsdt: 1e9, riskPct: 1, entry: 3300, stop: 3299, leverage: 20, feeRate: 0, orderType: "market" });
    expect(r.quantity).toBe(50);
    expect(r.warnings.join()).toMatch(/capped/);
  });
});

describe("index regime", () => {
  it("is off-hours on weekends and during the daily break", () => {
    expect(indexRegime(Date.UTC(2026, 9, 24, 12), null)).toMatchObject({ regime: "off_hours", scheduled: "weekend" }); // Saturday
    expect(indexRegime(Date.UTC(2026, 9, 21, 21, 30), null)).toMatchObject({ regime: "off_hours", scheduled: "daily_break" }); // Wed 17:30 EDT
  });
  it("tracks underlying hours, and flags a static index as probable holiday", () => {
    const t = Date.UTC(2026, 9, 21, 14);
    expect(indexRegime(t, t - 60_000).regime).toBe("underlying_hours");
    const h = indexRegime(t, t - INDEX_STATIC_THRESHOLD_MS);
    expect(h).toMatchObject({ regime: "off_hours", indexStatic: true });
  });
});
