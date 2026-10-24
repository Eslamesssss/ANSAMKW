import { MINUTE } from "./timeframes";
import type { Candle } from "./types";

export const OUTCOME_HORIZONS_MIN = [15, 60, 240, 1440] as const;

export interface Outcome {
  horizonMin: number;
  status: "complete" | "pending" | "no_data";
  closeAtHorizon: number | null;
  maxHigh: number | null;
  minLow: number | null;
  changeAbs: number | null;
  barsSeen: number;
}

/**
 * What happened after an alert, measured on confirmed 1m candles strictly after
 * the alert candle closed. The horizon is only `complete` once it has fully
 * elapsed; nothing is extrapolated.
 */
export function computeOutcome(
  refPrice: number,
  startMs: number,
  horizonMin: number,
  oneMinute: readonly Candle[],
  nowMs: number,
): Outcome {
  const endMs = startMs + horizonMin * MINUTE;
  const base: Outcome = { horizonMin, status: "pending", closeAtHorizon: null, maxHigh: null, minLow: null, changeAbs: null, barsSeen: 0 };
  if (nowMs < endMs) return base;
  const window = oneMinute.filter((c) => c.openTime >= startMs && c.openTime + MINUTE <= endMs && c.status !== "forming");
  if (!window.length) return { ...base, status: "no_data" };
  const lastBar = window[window.length - 1]!;
  const maxHigh = Math.max(...window.map((c) => c.high));
  const minLow = Math.min(...window.map((c) => c.low));
  return {
    horizonMin,
    status: "complete",
    closeAtHorizon: lastBar.close,
    maxHigh,
    minLow,
    changeAbs: lastBar.close - refPrice,
    barsSeen: window.length,
  };
}
