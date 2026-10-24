import { describe, expect, it } from "vitest";
import { ContractValidationError, ProviderError } from "../../src/market/adapter";
import { asProviderError, klinesWeight, parseConstituents, parseExchangeInfo, parseFundingSchedule, parseKlines, parsePremiumIndex, parseWsFrame } from "../../src/market/binance/parse";
import { readFixture } from "../support/helpers";

const info = () => JSON.parse(JSON.stringify(readFixture("exchangeInfo.json"))) as { symbols: Record<string, unknown>[]; rateLimits: unknown[] };

describe("exchangeInfo validation", () => {
  it("reads the XAUUSDT spec and the request-weight limit", () => {
    const { spec, requestWeightPerMinute } = parseExchangeInfo(info(), 1);
    expect(spec).toMatchObject({ symbol: "XAUUSDT", quoteAsset: "USDT", marginAsset: "USDT", baseAsset: "XAU", status: "TRADING", tickSize: 0.01, stepSize: 0.001, minQty: 0.001, marketMaxQty: 100, minNotional: 5 });
    expect(requestWeightPerMinute).toBe(2400);
  });

  it("refuses to substitute other gold instruments when XAUUSDT is missing", () => {
    const body = info();
    body.symbols = [
      { ...body.symbols[0], symbol: "PAXGUSDT", baseAsset: "PAXG" },
      { ...body.symbols[0], symbol: "XAUTUSDT", baseAsset: "XAUT" },
    ];
    expect(() => parseExchangeInfo(body, 1)).toThrow(ContractValidationError);
    expect(() => parseExchangeInfo(body, 1)).toThrow(/XAUUSDT is not listed/);
  });

  it("rejects a non-USDT, non-perpetual or non-XAU contract", () => {
    for (const [field, value, msg] of [
      ["quoteAsset", "USDC", /quote asset is USDC/],
      ["marginAsset", "BTC", /settlement asset is BTC/],
      ["contractType", "CURRENT_QUARTER", /expected a perpetual/],
      ["baseAsset", "PAXG", /base asset is PAXG/],
    ] as const) {
      const body = info();
      body.symbols[0]![field] = value;
      expect(() => parseExchangeInfo(body, 1), field).toThrow(msg);
    }
  });

  it("accepts a TradFi perpetual contract type", () => {
    const body = info();
    body.symbols[0]!.contractType = "TRADIFI_PERPETUAL";
    expect(parseExchangeInfo(body, 1).spec.contractType).toBe("TRADIFI_PERPETUAL");
  });
});

describe("klines", () => {
  const row = (t: number, o: string, h: string, l: string, c: string, v: string) => [t, o, h, l, c, v, t + 59_999, "0", 0, "0", "0", "0"];
  it("separates the forming bar, keeps real zero volume and rejects bad rows", () => {
    const t = Date.UTC(2026, 9, 21, 12, 0);
    const body = [row(t, "3300", "3301", "3299", "3300.5", "12.5"), row(t + 60_000, "3300.5", "3300.5", "3300.5", "3300.5", "0"), row(t + 120_000, "3300", "3299", "3301", "3300", "1"), row(t + 180_000, "3301", "3302", "3300", "3301.5", "3")];
    const r = parseKlines(body, "1m", t + 200_000);
    expect(r.closed.map((c) => c.volume)).toEqual([12.5, 0]);
    expect(r.rejected).toBe(1);
    expect(r.forming).toMatchObject({ openTime: t + 180_000, status: "forming", volume: 3 });
  });
  it("computes request weight by limit", () => {
    expect([klinesWeight(5), klinesWeight(100), klinesWeight(1000), klinesWeight(1500)]).toEqual([1, 2, 5, 10]);
  });
});

describe("REST error mapping", () => {
  it("maps 429/418/451 and Binance error codes", () => {
    expect(asProviderError(429, { code: -1003, msg: "Too many requests" }, 7)).toMatchObject({ code: "rate_limited", retryAfterMs: 7000 });
    expect(asProviderError(418, null, 120)).toMatchObject({ code: "banned", retryAfterMs: 120_000 });
    expect(asProviderError(451, null, null)?.code).toBe("restricted");
    expect(asProviderError(400, { code: -1121, msg: "Invalid symbol." }, null)?.message).toMatch(/-1121/);
    expect(asProviderError(200, [1, 2], null)).toBeNull();
    expect(asProviderError(503, null, null)).toBeInstanceOf(ProviderError);
  });
});

describe("market state parsers", () => {
  it("parses premiumIndex, funding schedule and constituents", () => {
    const m = parsePremiumIndex(readFixture("premiumIndex.json"), 5);
    expect(m.markPrice).toBeGreaterThan(m.indexPrice);
    expect(m.fundingRate).toBe(0.0001);
    const f = parseFundingSchedule([], readFixture("fundingRate.json"));
    expect(f).toMatchObject({ intervalHours: 8, intervalSource: "history", lastFundingRate: 0.0001 });
    const fi = parseFundingSchedule([{ symbol: "XAUUSDT", fundingIntervalHours: 4, adjustedFundingRateCap: "0.02", adjustedFundingRateFloor: "-0.02" }], []);
    expect(fi).toMatchObject({ intervalHours: 4, intervalSource: "fundingInfo", capRate: 0.02 });
    expect(parseConstituents(readFixture("constituents.json"))!.constituents).toHaveLength(1);
    expect(parseConstituents({ symbol: "PAXGUSDT", time: 1, constituents: [] })).toBeNull();
  });
});

describe("combined-stream frames", () => {
  const f = (stream: string, data: Record<string, unknown>) => JSON.stringify({ stream, data });
  it("parses every stream type", () => {
    const trade = parseWsFrame(f("xauusdt@aggTrade", { e: "aggTrade", E: 2, s: "XAUUSDT", a: 1, p: "3300.10", q: "0.5", T: 1, m: false }), 10);
    expect(trade).toMatchObject({ kind: "trade", qty: 0.5, update: { price: 3300.1, priceKind: "last", providerTime: 1, origin: "live", source: "binance-ws:aggTrade" } });
    expect(parseWsFrame(f("xauusdt@markPrice@1s", { e: "markPriceUpdate", E: 5, s: "XAUUSDT", p: "3300.2", i: "3299.8", P: "3299.9", r: "0.0001", T: 99 }), 6)).toMatchObject({ kind: "mark", mark: { markPrice: 3300.2, indexPrice: 3299.8, fundingRate: 0.0001, nextFundingTime: 99 } });
    expect(parseWsFrame(f("xauusdt@bookTicker", { e: "bookTicker", u: 1, E: 5, T: 4, s: "XAUUSDT", b: "3300.0", B: "2", a: "3300.2", A: "3" }), 6)).toMatchObject({ kind: "bookTicker", book: { bid: 3300, ask: 3300.2, exchangeTime: 4 } });
    expect(parseWsFrame(f("xauusdt@depth20@100ms", { e: "depthUpdate", E: 5, T: 4, s: "XAUUSDT", b: [["3300", "1"]], a: [["3300.2", "2"]] }), 6)).toMatchObject({ kind: "depth", depth: { bids: [[3300, 1]], asks: [[3300.2, 2]] } });
    expect(parseWsFrame(f("xauusdt@ticker", { e: "24hrTicker", E: 5, s: "XAUUSDT", c: "3300", p: "10", P: "0.3", h: "3310", l: "3280", v: "100", q: "330000" }), 6)).toMatchObject({ kind: "ticker", ticker: { priceChangePercent: 0.3, quoteVolume: 330000 } });
    const k = parseWsFrame(f("xauusdt@kline_15m", { e: "kline", E: 5, s: "XAUUSDT", k: { t: 0, i: "15m", o: "1", h: "2", l: "0.5", c: "1.5", v: "0", x: true } }), 6);
    expect(k).toMatchObject({ kind: "kline", kline: { tf: "15m", closed: true, candle: { status: "confirmed", volume: 0 } } });
  });
  it("ignores other symbols, subscription acks and malformed frames", () => {
    expect(parseWsFrame(f("paxgusdt@aggTrade", { e: "aggTrade", E: 2, s: "PAXGUSDT", p: "3300", q: "1", T: 1 }), 1)).toEqual({ kind: "ignored", reason: "foreign symbol PAXGUSDT" });
    expect(parseWsFrame(JSON.stringify({ result: null, id: 1 }), 1).kind).toBe("ignored");
    expect(parseWsFrame("nope", 1)).toEqual({ kind: "ignored", reason: "invalid_json" });
    expect(parseWsFrame(f("xauusdt@aggTrade", { e: "aggTrade", s: "XAUUSDT", p: "x" }), 1).kind).toBe("ignored");
  });
});
