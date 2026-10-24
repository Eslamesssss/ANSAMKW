import type { Candle } from "./types";

/**
 * Indicator series are aligned 1:1 with the input candles. Values are `null`
 * until the indicator has enough history (warm-up). All functions are pure and
 * causal: the value at index i uses only inputs at indices <= i.
 */
export type Series = (number | null)[];

/** EMA seeded with the SMA of the first `period` values. */
export function ema(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. The first value appears at index `period`. */
export function rsi(values: readonly number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = rsiFrom(avgGain, avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function trueRange(candles: readonly Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1]!.close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
}

/** Wilder's ATR seeded with the mean TR of bars 1..period. First value at index `period`. */
export function atr(candles: readonly Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const tr = trueRange(candles);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i]!;
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]!) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * Minimum number of closed bars before an indicator value is considered
 * initialised. EMA needs several periods to converge from its SMA seed; Wilder
 * smoothing similarly needs ~10x the period to forget the seed.
 */
export const WARMUP_BARS = {
  ema20: 60,
  ema50: 150,
  ema200: 600,
  rsi14: 140,
  atr14: 140,
} as const;

/** History bars to request per timeframe so EMA200 is fully warmed up with margin. */
export const HISTORY_BARS_REQUIRED = 1000;

export function last(series: Series): number | null {
  return series.length ? (series[series.length - 1] ?? null) : null;
}
