import { z } from "zod";
import { TIMEFRAMES } from "./types";

/**
 * The validated, structured market snapshot that is the ONLY market input the
 * AI analyst receives. Every number in it is computed deterministically in code
 * from provider data. `references` is the closed set of identifiers the analyst
 * may cite; the server resolves them back to prices.
 */

const tf = z.enum(TIMEFRAMES);
const iso = z.string().datetime();
const finite = z.number().finite();

export const referenceSchema = z.object({
  id: z.string(),
  kind: z.enum(["level", "swing_high", "swing_low", "ema", "price", "event"]),
  timeframe: tf.nullable(),
  price: finite,
  description: z.string(),
});
export type Reference = z.infer<typeof referenceSchema>;

export const timeframeSnapshotSchema = z.object({
  timeframe: tf,
  lastClosedOpenTime: iso.nullable(),
  lastClosedCloseTime: iso.nullable(),
  candleStatus: z.enum(["confirmed", "derived", "none"]),
  barsUsed: z.number().int().nonnegative(),
  close: finite.nullable(),
  ema20: finite.nullable(),
  ema50: finite.nullable(),
  ema200: finite.nullable(),
  rsi14: finite.nullable(),
  atr14: finite.nullable(),
  trend: z.enum(["bullish", "bearish", "neutral", "insufficient_data"]),
  trendRules: z.array(z.string()),
  structureTrend: z.enum(["bullish", "bearish", "undetermined"]),
  lastSwingHighRef: z.string().nullable(),
  lastSwingLowRef: z.string().nullable(),
  recentEvents: z.array(
    z.object({ id: z.string(), kind: z.string(), direction: z.string().nullable(), level: finite.nullable(), at: iso }),
  ),
});
export type TimeframeSnapshot = z.infer<typeof timeframeSnapshotSchema>;

export const marketSnapshotSchema = z.object({
  snapshotVersion: z.literal(1),
  symbol: z.string(),
  generatedAt: iso,
  dataOrigin: z.enum(["live", "fixture"]),
  price: z
    .object({
      value: finite.positive(),
      kind: z.enum(["mid", "last", "indicative"]),
      executable: z.literal(false),
      source: z.string(),
      providerTime: iso,
      receivedAt: iso,
      ageMs: z.number().nonnegative(),
      freshness: z.enum(["fresh", "delayed", "stale", "market_closed", "no_data"]),
    })
    .nullable(),
  session: z.object({ open: z.boolean(), reason: z.string() }),
  feed: z.object({ connection: z.string(), latencyMs: z.number().nullable() }),
  timeframes: z.array(timeframeSnapshotSchema).min(1),
  references: z.array(referenceSchema),
  trigger: z.object({ kind: z.enum(["manual", "event"]), eventIds: z.array(z.string()) }),
  dataQuality: z.array(z.string()),
  /** Contract the data belongs to; all prices are in `quoteAsset`. */
  contract: z
    .object({
      exchange: z.string(),
      symbol: z.string(),
      contractType: z.string(),
      status: z.string(),
      quoteAsset: z.string(),
      marginAsset: z.string(),
      tickSize: finite,
      stepSize: finite,
      minQty: finite,
      minNotional: finite.nullable(),
    })
    .nullable()
    .default(null),
  /** Perpetual-specific state at snapshot time. */
  derivatives: z
    .object({
      markPrice: finite.nullable(),
      indexPrice: finite.nullable(),
      /** last − index, in quote asset. */
      basis: finite.nullable(),
      basisBps: finite.nullable(),
      fundingRate: finite.nullable(),
      nextFundingTime: iso.nullable(),
      fundingIntervalHours: finite.nullable(),
      openInterest: finite.nullable(),
      openInterestUsdt: finite.nullable(),
      openInterestChange1h: finite.nullable(),
      volume24h: finite.nullable(),
      quoteVolume24h: finite.nullable(),
      change24hPct: finite.nullable(),
    })
    .nullable()
    .default(null),
  book: z
    .object({
      bestBid: finite,
      bestAsk: finite,
      spread: finite,
      spreadBps: finite,
      /** (bid qty − ask qty) / total over the top levels, −1..1. */
      imbalanceTop10: finite.nullable(),
      ageMs: z.number().nonnegative(),
    })
    .nullable()
    .default(null),
  indexRegime: z
    .object({ regime: z.enum(["underlying_hours", "off_hours"]), scheduled: z.string(), indexStatic: z.boolean(), note: z.string() })
    .nullable()
    .default(null),
});
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

/**
 * Checks that make a snapshot unfit for analysis even if it parses: no live
 * price during an open session, insufficient history, or fixture data being
 * routed to the live analyst.
 */
export function snapshotBlockers(s: MarketSnapshot, opts: { allowFixture: boolean; maxPriceAgeMs: number }): string[] {
  const blockers: string[] = [];
  if (s.dataOrigin === "fixture" && !opts.allowFixture) blockers.push("snapshot built from fixture data");
  if (s.session.open) {
    if (!s.price) blockers.push("no price available while market is open");
    else if (s.price.ageMs > opts.maxPriceAgeMs) blockers.push(`price is stale (${Math.round(s.price.ageMs / 1000)}s old)`);
  }
  const ready = s.timeframes.filter((t) => t.trend !== "insufficient_data");
  if (ready.length === 0) blockers.push("no timeframe has enough history for indicators");
  return blockers;
}
