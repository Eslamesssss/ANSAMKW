import type { Candle } from "./types";

export interface CandleDiff {
  openTime: number;
  kind: "changed" | "missing_local" | "missing_provider";
  local: Candle | null;
  provider: Candle | null;
  maxAbsDelta: number;
}

/**
 * Compare locally stored candles against provider candles for the same window.
 * The provider is the source of truth for closed bars; differences larger than
 * `epsilon` are reported so the caller can overwrite and log a revision.
 */
export function diffCandles(local: readonly Candle[], provider: readonly Candle[], epsilon = 1e-6): CandleDiff[] {
  const byTime = new Map(local.map((c) => [c.openTime, c]));
  const seen = new Set<number>();
  const diffs: CandleDiff[] = [];
  for (const p of provider) {
    seen.add(p.openTime);
    const l = byTime.get(p.openTime);
    if (!l) {
      diffs.push({ openTime: p.openTime, kind: "missing_local", local: null, provider: p, maxAbsDelta: Infinity });
      continue;
    }
    const delta = Math.max(Math.abs(l.open - p.open), Math.abs(l.high - p.high), Math.abs(l.low - p.low), Math.abs(l.close - p.close));
    if (delta > epsilon) diffs.push({ openTime: p.openTime, kind: "changed", local: l, provider: p, maxAbsDelta: delta });
  }
  if (provider.length) {
    const from = provider[0]!.openTime;
    const to = provider[provider.length - 1]!.openTime;
    for (const l of local) {
      if (l.openTime >= from && l.openTime <= to && !seen.has(l.openTime) && l.status !== "forming") {
        diffs.push({ openTime: l.openTime, kind: "missing_provider", local: l, provider: null, maxAbsDelta: Infinity });
      }
    }
  }
  return diffs.sort((a, b) => a.openTime - b.openTime);
}

/**
 * Find missing bucket starts between consecutive candles. Callers filter the
 * result with the session calendar so weekend/break gaps are not reported.
 */
export function findGaps(candles: readonly Candle[], stepMs: number): { from: number; to: number }[] {
  const gaps: { from: number; to: number }[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.openTime;
    const cur = candles[i]!.openTime;
    if (cur - prev > stepMs) gaps.push({ from: prev + stepMs, to: cur });
  }
  return gaps;
}

/** Validate OHLC sanity; providers occasionally send malformed rows. */
export function isSaneCandle(c: Candle): boolean {
  const vals = [c.open, c.high, c.low, c.close];
  if (!vals.every((v) => Number.isFinite(v) && v > 0)) return false;
  return c.high >= Math.max(c.open, c.close, c.low) && c.low <= Math.min(c.open, c.close, c.high);
}
