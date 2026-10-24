import { atr, ema, last, rsi, WARMUP_BARS } from "./indicators";
import type { Candle, Timeframe, TrendState } from "./types";

export interface TrendReading {
  timeframe: Timeframe;
  /** Open time of the last closed candle used. */
  asOfOpenTime: number | null;
  close: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  atr14: number | null;
  state: TrendState;
  /** Machine-readable reasons; each is an objective rule that held. */
  rules: string[];
  barsUsed: number;
}

/**
 * Objective trend classification on closed candles only:
 * - bullish: close > EMA20 > EMA50 > EMA200 and RSI14 >= 50
 * - bearish: close < EMA20 < EMA50 < EMA200 and RSI14 <= 50
 * - neutral: anything else
 * - insufficient_data: fewer bars than the EMA200 warm-up requires
 */
export function classifyTrend(timeframe: Timeframe, closed: readonly Candle[]): TrendReading {
  const closes = closed.map((c) => c.close);
  const reading: TrendReading = {
    timeframe,
    asOfOpenTime: closed.length ? closed[closed.length - 1]!.openTime : null,
    close: closes.length ? closes[closes.length - 1]! : null,
    ema20: last(ema(closes, 20)),
    ema50: last(ema(closes, 50)),
    ema200: last(ema(closes, 200)),
    rsi14: last(rsi(closes, 14)),
    atr14: last(atr(closed, 14)),
    state: "insufficient_data",
    rules: [],
    barsUsed: closed.length,
  };
  if (closed.length < WARMUP_BARS.ema200) {
    reading.rules.push(`bars ${closed.length} < warmup ${WARMUP_BARS.ema200}`);
    return reading;
  }
  const { close, ema20: e20, ema50: e50, ema200: e200, rsi14: r } = reading;
  if (close === null || e20 === null || e50 === null || e200 === null || r === null) return reading;

  const bullStack = close > e20 && e20 > e50 && e50 > e200;
  const bearStack = close < e20 && e20 < e50 && e50 < e200;
  if (bullStack && r >= 50) {
    reading.state = "bullish";
    reading.rules.push("close>EMA20>EMA50>EMA200", "RSI14>=50");
  } else if (bearStack && r <= 50) {
    reading.state = "bearish";
    reading.rules.push("close<EMA20<EMA50<EMA200", "RSI14<=50");
  } else {
    reading.state = "neutral";
    reading.rules.push(close > e200 ? "close>EMA200" : "close<=EMA200");
    reading.rules.push(e50 > e200 ? "EMA50>EMA200" : "EMA50<=EMA200");
    reading.rules.push(`RSI14=${r.toFixed(1)}`);
    if (bullStack) reading.rules.push("bull EMA stack but RSI14<50");
    if (bearStack) reading.rules.push("bear EMA stack but RSI14>50");
  }
  return reading;
}
