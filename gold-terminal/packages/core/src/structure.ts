import { atr } from "./indicators";
import { bucketEnd } from "./timeframes";
import type { Candle, Timeframe } from "./types";

/**
 * Market structure from closed candles in a single causal pass.
 *
 * Anti-repainting guarantees:
 * - A swing at bar i is only known once bar i+right has closed; it is emitted
 *   with `confirmedAt` = close time of bar i+right, never earlier.
 * - Every event at bar k depends only on bars 0..k, so analysing a prefix of the
 *   history yields exactly the events of the full analysis up to that bar
 *   (verified by tests). Events never change after being emitted.
 */

export type SwingLabel = "HH" | "LH" | "EQH" | "HL" | "LL" | "EQL" | "FIRST";

export interface Swing {
  id: string;
  type: "high" | "low";
  price: number;
  /** Open time of the pivot bar. */
  openTime: number;
  index: number;
  /** Close time of the bar that confirmed the pivot. */
  confirmedAt: number;
  confirmedIndex: number;
  label: SwingLabel;
}

export interface Level {
  id: string;
  price: number;
  touches: number;
  firstSeen: number;
  lastTouched: number;
  sources: string[];
}

export type Direction = "bullish" | "bearish";

interface EventBase {
  id: string;
  timeframe: Timeframe;
  /** Open time of the bar on which the event occurred. */
  openTime: number;
  index: number;
  /** Close time of that bar: the earliest moment the event is knowable. */
  confirmedAt: number;
  close: number;
}

export type StructureEvent =
  | (EventBase & { kind: "swing"; swing: Swing })
  | (EventBase & { kind: "bos" | "choch"; direction: Direction; brokenSwingId: string; level: number })
  | (EventBase & { kind: "breakout"; direction: Direction; levelId: string; level: number })
  | (EventBase & { kind: "retest"; direction: Direction; levelId: string; level: number; breakoutId: string })
  | (EventBase & { kind: "breakout_failed"; direction: Direction; levelId: string; level: number; breakoutId: string });

export interface StructureOptions {
  /** Bars to the left that must be lower (high) / higher (low). */
  left: number;
  /** Bars to the right; also the confirmation delay. */
  right: number;
  /** Level merge tolerance as a multiple of ATR14. */
  levelToleranceAtr: number;
  /** Close must exceed a level by this multiple of ATR14 to count as a breakout. */
  breakoutBufferAtr: number;
  /** Bars after a breakout in which a retest is looked for. */
  retestWindow: number;
}

export const DEFAULT_STRUCTURE_OPTIONS: StructureOptions = {
  left: 3,
  right: 3,
  levelToleranceAtr: 0.3,
  breakoutBufferAtr: 0.1,
  retestWindow: 12,
};

export interface StructureResult {
  timeframe: Timeframe;
  swings: Swing[];
  events: StructureEvent[];
  levels: Level[];
  trend: Direction | "undetermined";
  lastSwingHigh: Swing | null;
  lastSwingLow: Swing | null;
  analysedBars: number;
}

interface PendingBreakout {
  id: string;
  direction: Direction;
  levelId: string;
  level: number;
  index: number;
}

export function analyzeStructure(
  timeframe: Timeframe,
  candles: readonly Candle[],
  options: Partial<StructureOptions> = {},
): StructureResult {
  const opt = { ...DEFAULT_STRUCTURE_OPTIONS, ...options };
  const atrSeries = atr(candles, 14);
  const swings: Swing[] = [];
  const events: StructureEvent[] = [];
  const levels: Level[] = [];
  const brokenSwings = new Set<string>();
  const pending: PendingBreakout[] = [];
  let trend: Direction | "undetermined" = "undetermined";
  let lastHigh: Swing | null = null;
  let lastLow: Swing | null = null;

  const tolAt = (k: number, price: number) => {
    const a = atrSeries[k];
    return a != null ? a : price * 0.001;
  };

  for (let k = 0; k < candles.length; k++) {
    const bar = candles[k]!;
    const confirmedAt = bucketEnd(bar.openTime, timeframe);
    const base = { timeframe, openTime: bar.openTime, index: k, confirmedAt, close: bar.close };
    // Levels as they stood before this bar: breakouts are judged against them.
    const priorLevels = levels.map((l) => ({ ...l }));

    // 1) Pivot confirmation for bar i = k - right.
    const i = k - opt.right;
    if (i >= opt.left) {
      const pivot = candles[i]!;
      let isHigh = true;
      let isLow = true;
      for (let j = i - opt.left; j < i; j++) {
        if (candles[j]!.high >= pivot.high) isHigh = false;
        if (candles[j]!.low <= pivot.low) isLow = false;
      }
      for (let j = i + 1; j <= k; j++) {
        if (candles[j]!.high > pivot.high) isHigh = false;
        if (candles[j]!.low < pivot.low) isLow = false;
      }
      const make = (type: "high" | "low"): Swing => {
        const price = type === "high" ? pivot.high : pivot.low;
        const prev = type === "high" ? lastHigh : lastLow;
        let label: SwingLabel = "FIRST";
        if (prev) {
          if (type === "high") label = price > prev.price ? "HH" : price < prev.price ? "LH" : "EQH";
          else label = price > prev.price ? "HL" : price < prev.price ? "LL" : "EQL";
        }
        return { id: `${timeframe}:S${type === "high" ? "H" : "L"}:${pivot.openTime}`, type, price, openTime: pivot.openTime, index: i, confirmedAt, confirmedIndex: k, label };
      };
      for (const type of ["high", "low"] as const) {
        if (type === "high" ? !isHigh : !isLow) continue;
        const swing = make(type);
        swings.push(swing);
        if (type === "high") lastHigh = swing;
        else lastLow = swing;
        events.push({ ...base, id: `${swing.id}:confirmed`, kind: "swing", swing });
        mergeIntoLevels(levels, swing, opt.levelToleranceAtr * tolAt(k, swing.price), timeframe);
      }
    }

    // 2) BOS / CHoCH on close beyond the most recent unbroken swing.
    if (lastHigh && !brokenSwings.has(lastHigh.id) && bar.close > lastHigh.price) {
      brokenSwings.add(lastHigh.id);
      const kind = trend === "bearish" ? "choch" : "bos";
      events.push({ ...base, id: `${timeframe}:${kind}:up:${bar.openTime}`, kind, direction: "bullish", brokenSwingId: lastHigh.id, level: lastHigh.price });
      trend = "bullish";
    }
    if (lastLow && !brokenSwings.has(lastLow.id) && bar.close < lastLow.price) {
      brokenSwings.add(lastLow.id);
      const kind = trend === "bullish" ? "choch" : "bos";
      events.push({ ...base, id: `${timeframe}:${kind}:down:${bar.openTime}`, kind, direction: "bearish", brokenSwingId: lastLow.id, level: lastLow.price });
      trend = "bearish";
    }

    // 3) Retest / failure of pending breakouts (from earlier bars).
    for (let p = pending.length - 1; p >= 0; p--) {
      const b = pending[p]!;
      const tol = opt.levelToleranceAtr * tolAt(k, b.level);
      const buffer = opt.breakoutBufferAtr * tolAt(k, b.level);
      if (k - b.index > opt.retestWindow) {
        pending.splice(p, 1);
        continue;
      }
      const failed = b.direction === "bullish" ? bar.close < b.level - buffer : bar.close > b.level + buffer;
      const retested =
        b.direction === "bullish" ? bar.low <= b.level + tol && bar.close > b.level : bar.high >= b.level - tol && bar.close < b.level;
      if (failed) {
        events.push({ ...base, id: `${b.id}:failed`, kind: "breakout_failed", direction: b.direction, levelId: b.levelId, level: b.level, breakoutId: b.id });
        pending.splice(p, 1);
      } else if (retested) {
        events.push({ ...base, id: `${b.id}:retest`, kind: "retest", direction: b.direction, levelId: b.levelId, level: b.level, breakoutId: b.id });
        pending.splice(p, 1);
      }
    }

    // 4) Breakouts through levels that existed before this bar.
    if (k > 0) {
      const prevClose = candles[k - 1]!.close;
      for (const level of priorLevels) {
        const buffer = opt.breakoutBufferAtr * tolAt(k, level.price);
        let direction: Direction | null = null;
        if (prevClose <= level.price && bar.close > level.price + buffer) direction = "bullish";
        else if (prevClose >= level.price && bar.close < level.price - buffer) direction = "bearish";
        if (!direction) continue;
        const id = `${level.id}:breakout:${direction === "bullish" ? "up" : "down"}:${bar.openTime}`;
        events.push({ ...base, id, kind: "breakout", direction, levelId: level.id, level: level.price });
        pending.push({ id, direction, levelId: level.id, level: level.price, index: k });
      }
    }
  }

  return { timeframe, swings, events, levels, trend, lastSwingHigh: lastHigh, lastSwingLow: lastLow, analysedBars: candles.length };
}

function mergeIntoLevels(levels: Level[], swing: Swing, tolerance: number, timeframe: Timeframe): void {
  let best: Level | null = null;
  let bestDist = Infinity;
  for (const l of levels) {
    const d = Math.abs(l.price - swing.price);
    if (d <= tolerance && d < bestDist) {
      best = l;
      bestDist = d;
    }
  }
  if (best) {
    best.price = (best.price * best.touches + swing.price) / (best.touches + 1);
    best.touches += 1;
    best.lastTouched = swing.openTime;
    best.sources.push(swing.id);
  } else {
    levels.push({ id: `${timeframe}:L:${swing.openTime}`, price: swing.price, touches: 1, firstSeen: swing.openTime, lastTouched: swing.openTime, sources: [swing.id] });
  }
}

export interface RankedLevel extends Level {
  role: "support" | "resistance";
  distance: number;
}

/** Nearest support/resistance levels around the given price. */
export function nearestLevels(levels: readonly Level[], price: number, perSide = 4, minTouches = 1): RankedLevel[] {
  const ranked = levels
    .filter((l) => l.touches >= minTouches)
    .map((l) => ({ ...l, role: (l.price <= price ? "support" : "resistance") as RankedLevel["role"], distance: Math.abs(l.price - price) }));
  const supports = ranked.filter((l) => l.role === "support").sort((a, b) => a.distance - b.distance).slice(0, perSide);
  const resistances = ranked.filter((l) => l.role === "resistance").sort((a, b) => a.distance - b.distance).slice(0, perSide);
  return [...resistances.reverse(), ...supports];
}
