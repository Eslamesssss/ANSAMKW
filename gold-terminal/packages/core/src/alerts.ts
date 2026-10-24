import { z } from "zod";
import type { StructureEvent } from "./structure";
import type { Candle, Timeframe, TrendState } from "./types";
import { TIMEFRAMES } from "./types";

const timeframeSchema = z.enum(TIMEFRAMES);

const ruleBase = {
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  timeframe: timeframeSchema,
  /** Minimum seconds between two firings of the same rule. */
  cooldownSec: z.number().int().min(0).max(7 * 24 * 3600).default(0),
};

export const alertRuleSchema = z.discriminatedUnion("type", [
  z.object({
    ...ruleBase,
    type: z.literal("candle_close"),
    condition: z.object({ op: z.enum(["above", "below"]), price: z.number().positive() }).nullable().default(null),
  }),
  z.object({
    ...ruleBase,
    type: z.literal("level_cross"),
    /** `manual`: a user-chosen price. `detected`: any detected S/R level breakout. */
    source: z.enum(["manual", "detected"]),
    price: z.number().positive().nullable().default(null),
    direction: z.enum(["up", "down", "any"]).default("any"),
  }),
  z.object({
    ...ruleBase,
    type: z.literal("structure_break"),
    kinds: z.array(z.enum(["bos", "choch"])).min(1).default(["bos", "choch"]),
    direction: z.enum(["bullish", "bearish", "any"]).default("any"),
  }),
  z.object({
    ...ruleBase,
    type: z.literal("trend_change"),
    to: z.enum(["bullish", "bearish", "neutral", "any"]).default("any"),
  }),
]);

export type AlertRule = z.infer<typeof alertRuleSchema>;
export type AlertRuleInput = z.input<typeof alertRuleSchema>;

/** Everything known at the close of one confirmed candle on one timeframe. */
export interface CloseContext {
  timeframe: Timeframe;
  candle: Candle;
  prevCandle: Candle | null;
  trendBefore: TrendState | null;
  trendAfter: TrendState;
  /** Structure events whose bar is this candle. */
  events: StructureEvent[];
}

export interface AlertCandidate {
  ruleId: string;
  ruleType: AlertRule["type"];
  timeframe: Timeframe;
  candleOpenTime: number;
  dedupeKey: string;
  price: number;
  title: string;
  detail: Record<string, unknown>;
}

/**
 * Evaluate rules against one confirmed candle close. Pure and deterministic:
 * the dedupe key is derived from rule id, timeframe, candle and subject, so
 * re-processing the same close (e.g. after a reconnect or reconciliation)
 * yields the same keys and can be dropped by a unique constraint.
 */
export function evaluateRules(rules: readonly AlertRule[], ctx: CloseContext): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const { candle, prevCandle, timeframe } = ctx;
  const key = (rule: AlertRule, subject: string) => `${rule.id}|${timeframe}|${candle.openTime}|${subject}`;
  const push = (rule: AlertRule, subject: string, title: string, detail: Record<string, unknown>) =>
    out.push({ ruleId: rule.id, ruleType: rule.type, timeframe, candleOpenTime: candle.openTime, dedupeKey: key(rule, subject), price: candle.close, title, detail });

  for (const rule of rules) {
    if (!rule.enabled || rule.timeframe !== timeframe) continue;
    switch (rule.type) {
      case "candle_close": {
        const c = rule.condition;
        if (!c || (c.op === "above" ? candle.close > c.price : candle.close < c.price)) {
          push(rule, "close", c ? `${timeframe} close ${c.op} ${c.price}` : `${timeframe} candle closed`, { condition: c, ohlc: ohlc(candle) });
        }
        break;
      }
      case "level_cross": {
        if (rule.source === "manual") {
          if (rule.price === null || !prevCandle) break;
          const p = rule.price;
          const up = prevCandle.close <= p && candle.close > p;
          const down = prevCandle.close >= p && candle.close < p;
          if ((up && rule.direction !== "down") || (down && rule.direction !== "up")) {
            push(rule, `manual:${p}:${up ? "up" : "down"}`, `${timeframe} close crossed ${up ? "above" : "below"} ${p}`, { level: p, prevClose: prevCandle.close, close: candle.close });
          }
        } else {
          for (const e of ctx.events) {
            if (e.kind !== "breakout") continue;
            const dir = e.direction === "bullish" ? "up" : "down";
            if (rule.direction !== "any" && rule.direction !== dir) continue;
            push(rule, `detected:${e.levelId}:${dir}`, `${timeframe} close broke ${dir === "up" ? "above" : "below"} detected level`, { levelId: e.levelId, level: e.level, eventId: e.id });
          }
        }
        break;
      }
      case "structure_break": {
        for (const e of ctx.events) {
          if ((e.kind !== "bos" && e.kind !== "choch") || !rule.kinds.includes(e.kind)) continue;
          if (rule.direction !== "any" && rule.direction !== e.direction) continue;
          push(rule, `${e.kind}:${e.direction}`, `${timeframe} ${e.kind.toUpperCase()} ${e.direction}`, { level: e.level, brokenSwingId: e.brokenSwingId, eventId: e.id });
        }
        break;
      }
      case "trend_change": {
        const { trendBefore, trendAfter } = ctx;
        if (trendBefore === null || trendBefore === trendAfter || trendAfter === "insufficient_data" || trendBefore === "insufficient_data") break;
        if (rule.to !== "any" && rule.to !== trendAfter) break;
        push(rule, `trend:${trendBefore}->${trendAfter}`, `${timeframe} trend ${trendBefore} → ${trendAfter}`, { from: trendBefore, to: trendAfter });
        break;
      }
    }
  }
  return out;
}

/** Drop candidates whose rule fired less than `cooldownSec` ago (by candle time). */
export function applyCooldown(
  candidates: readonly AlertCandidate[],
  rules: readonly AlertRule[],
  lastFiredAt: ReadonlyMap<string, number>,
  nowMs: number,
): AlertCandidate[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const firedThisRound = new Map<string, number>();
  return candidates.filter((c) => {
    const rule = byId.get(c.ruleId);
    const cooldown = (rule?.cooldownSec ?? 0) * 1000;
    const prev = firedThisRound.get(c.ruleId) ?? lastFiredAt.get(c.ruleId);
    if (cooldown > 0 && prev !== undefined && nowMs - prev < cooldown) return false;
    firedThisRound.set(c.ruleId, nowMs);
    return true;
  });
}

function ohlc(c: Candle) {
  return { o: c.open, h: c.high, l: c.low, c: c.close };
}
