import type { Candle, Timeframe } from "./types";
import { TIMEFRAMES } from "./types";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": MINUTE,
  "5m": 5 * MINUTE,
  "15m": 15 * MINUTE,
  "1h": HOUR,
  "4h": 4 * HOUR,
  "1d": DAY,
};

export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === "string" && (TIMEFRAMES as readonly string[]).includes(value);
}

/**
 * Bucket start for a UTC timestamp. Buckets are aligned to the UTC epoch, so
 * 4h buckets start at 00/04/08/12/16/20 UTC and daily buckets at 00:00 UTC,
 * matching Twelve Data history requested with `timezone=UTC`.
 */
export function bucketStart(timeMs: number, tf: Timeframe): number {
  const size = TIMEFRAME_MS[tf];
  return Math.floor(timeMs / size) * size;
}

export function bucketEnd(openTime: number, tf: Timeframe): number {
  return openTime + TIMEFRAME_MS[tf];
}

/** A bucket is closed once its end time has passed. */
export function isBucketClosed(openTime: number, tf: Timeframe, nowMs: number): boolean {
  return nowMs >= bucketEnd(openTime, tf);
}

/** Keep only candles whose bucket has fully elapsed. */
export function closedOnly(candles: readonly Candle[], tf: Timeframe, nowMs: number): Candle[] {
  return candles.filter((c) => isBucketClosed(c.openTime, tf, nowMs));
}

/**
 * Aggregate lower-timeframe candles into higher-timeframe candles. Input must be
 * sorted ascending and contain only closed candles. Only buckets whose end has
 * passed are emitted; volume is summed only if every constituent has volume.
 */
export function aggregateCandles(source: readonly Candle[], target: Timeframe, nowMs: number): Candle[] {
  const out: Candle[] = [];
  let current: Candle | null = null;
  let volumeKnown = true;
  for (const c of source) {
    const start = bucketStart(c.openTime, target);
    if (!current || current.openTime !== start) {
      if (current) {
        if (!volumeKnown) current.volume = null;
        out.push(current);
      }
      current = { openTime: start, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0, status: "derived" };
      volumeKnown = c.volume !== null;
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
      if (c.volume === null) volumeKnown = false;
      else if (current.volume !== null) current.volume += c.volume;
    }
  }
  if (current) {
    if (!volumeKnown) current.volume = null;
    out.push(current);
  }
  return out.filter((c) => isBucketClosed(c.openTime, target, nowMs));
}

/** Twelve Data interval names for each timeframe. */
export const TWELVE_DATA_INTERVAL: Record<Timeframe, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};
