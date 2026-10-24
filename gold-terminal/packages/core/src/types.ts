/**
 * Core domain types. All timestamps are UTC epoch milliseconds unless a field
 * name says otherwise. Display conversion (Africa/Cairo) happens only at the edge.
 */

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/**
 * Where a piece of data came from. `live` means a real provider feed. `fixture`
 * means recorded or synthetic test data and must never be shown as live.
 */
export type DataOrigin = "live" | "fixture";

/**
 * Lifecycle of a candle:
 * - `forming`: bucket still open; built from streamed price updates for display only.
 * - `derived`: bucket closed; aggregated from provider-confirmed 1m candles.
 * - `confirmed`: bucket closed; returned by the provider's REST history as a closed bar.
 */
export type CandleStatus = "forming" | "derived" | "confirmed";

export interface Candle {
  /** Bucket open time, UTC epoch ms. */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /**
   * Exchange-reported base-asset volume (Binance klines: XAU). `null` only when
   * a source does not report volume. Never synthesised.
   */
  volume: number | null;
  status: CandleStatus;
}

/**
 * A price update received from a streaming feed. This is a provider snapshot
 * of the current price, not necessarily a trade or a tick: providers may
 * throttle, coalesce, or repeat updates.
 */
export interface PriceUpdate {
  symbol: string;
  price: number;
  /** Provider event time, UTC epoch ms (may have only 1s resolution). */
  providerTime: number;
  /** Local receive time, UTC epoch ms. */
  receivedAt: number;
  /** Indicative bid/ask only when the provider explicitly sends them. Never executable. */
  bid: number | null;
  ask: number | null;
  /** What `price` represents according to the provider documentation. */
  priceKind: "mid" | "last" | "indicative";
  source: string;
  origin: DataOrigin;
}

export type TrendState = "bullish" | "bearish" | "neutral" | "insufficient_data";

export type FeedConnection = "connecting" | "connected" | "reconnecting" | "disconnected" | "no_credentials" | "error";

export type Freshness = "fresh" | "delayed" | "stale" | "market_closed" | "no_data";
