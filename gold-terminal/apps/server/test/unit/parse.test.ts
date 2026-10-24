import { describe, expect, it } from "vitest";
import { ProviderError } from "../../src/market/adapter";
import { asProviderError, parseQuote, parseTimeSeries, parseUtcDatetime, parseWsMessage } from "../../src/market/twelvedata/parse";
import { readFixture } from "../support/helpers";

describe("Twelve Data parsers", () => {
  it("parses UTC datetimes for intraday and daily bars", () => {
    expect(parseUtcDatetime("2024-03-13 14:59:00")).toBe(Date.UTC(2024, 2, 13, 14, 59));
    expect(parseUtcDatetime("2024-03-12")).toBe(Date.UTC(2024, 2, 12));
    expect(() => parseUtcDatetime("13/03/2024")).toThrow(ProviderError);
  });

  it("separates the forming bar from closed bars", () => {
    const body = readFixture("time_series_1min.json") as { values: { datetime: string }[] };
    const lastOpen = parseUtcDatetime(body.values.at(-1)!.datetime);
    const res = parseTimeSeries(body, "1m", lastOpen + 30_000);
    expect(res.forming?.openTime).toBe(lastOpen);
    expect(res.forming?.status).toBe("forming");
    expect(res.closed.at(-1)!.openTime).toBe(lastOpen - 60_000);
    expect(res.closed.every((c) => c.volume === null)).toBe(true);
  });

  it("rejects malformed OHLC rows and sorts descending input", () => {
    const body = {
      meta: { symbol: "XAU/USD", interval: "1min" },
      values: [
        { datetime: "2024-01-02 10:02:00", open: "2001", high: "2002", low: "2000", close: "2001.5" },
        { datetime: "2024-01-02 10:01:00", open: "2001", high: "1999", low: "2000", close: "2001.5" },
        { datetime: "2024-01-02 10:00:00", open: "2000", high: "2001", low: "1999", close: "2001" },
      ],
      status: "ok",
    };
    const res = parseTimeSeries(body, "1m", Date.UTC(2024, 0, 3));
    expect(res.rejected).toBe(1);
    expect(res.closed.map((c) => c.openTime)).toEqual([Date.UTC(2024, 0, 2, 10, 0), Date.UTC(2024, 0, 2, 10, 2)]);
  });

  it("maps provider error bodies to typed errors", () => {
    expect(asProviderError({ code: 429, message: "You have run out of API credits", status: "error" })?.code).toBe("rate_limited");
    expect(asProviderError({ code: 401, message: "invalid api key", status: "error" })?.code).toBe("auth");
    expect(() => parseTimeSeries({ code: 400, message: "bad symbol", status: "error" }, "1m", 0)).toThrow(/bad symbol/);
  });

  it("parses quotes", () => {
    const q = parseQuote(readFixture("quote.json"));
    expect(q.price).toBeGreaterThan(0);
    expect(q.isMarketOpen).toBe(true);
  });

  it("parses WebSocket frames without treating them as ticks", () => {
    const p = parseWsMessage(JSON.stringify({ event: "price", symbol: "XAU/USD", timestamp: 1710331200, price: 2160.5 }), 1710331200300);
    expect(p.type).toBe("price");
    if (p.type === "price") {
      expect(p.update.priceKind).toBe("indicative");
      expect(p.update.bid).toBeNull();
      expect(p.update.providerTime).toBe(1710331200000);
    }
    const mid = parseWsMessage(JSON.stringify({ event: "price", symbol: "XAU/USD", timestamp: 1, price: 2000.5, bid: 2000, ask: 2001 }), 0);
    expect(mid.type === "price" && mid.update.priceKind).toBe("mid");
    expect(parseWsMessage(JSON.stringify({ event: "heartbeat", status: "ok" }), 0)).toEqual({ type: "heartbeat", ok: true });
    expect(parseWsMessage(JSON.stringify({ event: "subscribe-status", status: "ok", success: [{ symbol: "XAU/USD" }], fails: [] }), 0)).toMatchObject({ type: "subscribe-status", ok: true });
    expect(parseWsMessage("not json", 0)).toEqual({ type: "other", event: "invalid_json" });
    expect(parseWsMessage(JSON.stringify({ event: "price", symbol: "XAU/USD", timestamp: 1, price: -3 }), 0).type).toBe("other");
  });
});
