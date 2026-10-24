import { describe, expect, it } from "vitest";
import { aggregateCandles, bucketStart, closedOnly, formatCairo, isEntirelyClosed, xauSessionStatus } from "../src";
import { syntheticCandles } from "./helpers";

describe("bucketing (UTC)", () => {
  it("aligns 4h and 1d buckets to UTC", () => {
    const t = Date.UTC(2024, 4, 15, 13, 37, 12);
    expect(bucketStart(t, "4h")).toBe(Date.UTC(2024, 4, 15, 12));
    expect(bucketStart(t, "1d")).toBe(Date.UTC(2024, 4, 15));
    expect(bucketStart(t, "15m")).toBe(Date.UTC(2024, 4, 15, 13, 30));
  });
  it("closedOnly drops the forming bar", () => {
    const c = syntheticCandles(5);
    const now = c[4]!.openTime + 30_000;
    expect(closedOnly(c, "1m", now)).toHaveLength(4);
  });
  it("aggregates 1m into 5m and drops the open bucket", () => {
    const c = syntheticCandles(12); // 00:00..00:11
    const now = c[11]!.openTime + 60_000; // 00:12
    const five = aggregateCandles(c, "5m", now);
    expect(five).toHaveLength(2);
    expect(five[0]!.open).toBe(c[0]!.open);
    expect(five[0]!.close).toBe(c[4]!.close);
    expect(five[0]!.high).toBe(Math.max(...c.slice(0, 5).map((x) => x.high)));
    expect(five[0]!.volume).toBeNull();
    expect(five[0]!.status).toBe("derived");
  });
});

describe("display timezone", () => {
  it("formats in Africa/Cairo", () => {
    // 2024-01-15 10:00 UTC = 12:00 Cairo (UTC+2, winter)
    expect(formatCairo(Date.UTC(2024, 0, 15, 10))).toBe("2024-01-15 12:00:00 Cairo");
  });
});

describe("XAU/USD session", () => {
  it("is closed on Saturday and Sunday before 18:00 ET", () => {
    expect(xauSessionStatus(Date.UTC(2024, 0, 13, 12)).open).toBe(false); // Sat
    expect(xauSessionStatus(Date.UTC(2024, 0, 14, 22)).open).toBe(false); // Sun 17:00 ET (EST)
    expect(xauSessionStatus(Date.UTC(2024, 0, 14, 23, 5)).open).toBe(true); // Sun 18:05 ET
  });
  it("closes Friday 17:00 ET and respects DST", () => {
    // Fri 2024-01-12 (EST, UTC-5): 16:30 ET open, 17:30 ET closed
    expect(xauSessionStatus(Date.UTC(2024, 0, 12, 21, 30)).open).toBe(true);
    expect(xauSessionStatus(Date.UTC(2024, 0, 12, 22, 30))).toEqual({ open: false, reason: "weekend" });
    // Fri 2024-07-12 (EDT, UTC-4): 17:30 ET = 21:30 UTC closed
    expect(xauSessionStatus(Date.UTC(2024, 6, 12, 21, 30)).open).toBe(false);
  });
  it("has a daily break 17:00-18:00 ET", () => {
    // July (EDT, UTC-4): 17:30 ET = 21:30 UTC on a Wednesday
    expect(xauSessionStatus(Date.UTC(2024, 6, 10, 21, 30))).toEqual({ open: false, reason: "daily_break" });
    expect(xauSessionStatus(Date.UTC(2024, 6, 10, 22, 30)).open).toBe(true);
  });
  it("detects all-closed intervals", () => {
    expect(isEntirelyClosed(Date.UTC(2024, 0, 13, 0), Date.UTC(2024, 0, 13, 6))).toBe(true);
    expect(isEntirelyClosed(Date.UTC(2024, 0, 10, 0), Date.UTC(2024, 0, 10, 1))).toBe(false);
  });
});
