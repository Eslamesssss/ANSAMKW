import type { Candle } from "../src";

/**
 * SYNTHETIC test candles from a seeded random walk. Not market data; used only
 * to exercise deterministic logic.
 */
export function syntheticCandles(n: number, opts: { start?: number; stepMs?: number; seed?: number; base?: number; drift?: number } = {}): Candle[] {
  const { start = Date.UTC(2024, 0, 2, 0, 0), stepMs = 60_000, base = 2000, drift = 0 } = opts;
  let seed = opts.seed ?? 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const out: Candle[] = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open + (rand() - 0.5) * 2 + drift;
    const high = Math.max(open, close) + rand();
    const low = Math.min(open, close) - rand();
    out.push({ openTime: start + i * stepMs, open, high, low, close, volume: null, status: "confirmed" });
    price = close;
  }
  return out;
}

export function fromCloses(closes: number[], stepMs = 60_000): Candle[] {
  return closes.map((c, i) => ({ openTime: i * stepMs, open: c, high: c, low: c, close: c, volume: null, status: "confirmed" as const }));
}

export function bar(openTime: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime, open: o, high: h, low: l, close: c, volume: null, status: "confirmed" };
}
