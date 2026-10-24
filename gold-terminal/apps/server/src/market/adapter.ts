import type { Candle, DataOrigin, FeedConnection, PriceUpdate, Timeframe } from "@gold/core";

export interface HistoryRequest {
  /** Number of most recent bars. */
  outputsize?: number;
  /** Inclusive UTC window bounds (epoch ms). */
  startMs?: number;
  endMs?: number;
}

export interface HistoryResult {
  /** Bars whose bucket has fully elapsed, ascending. These are provider-confirmed. */
  closed: Candle[];
  /** The provider's still-forming bar, if returned. Display only. */
  forming: Candle | null;
  /** Rows dropped because they failed OHLC sanity checks. */
  rejected: number;
  source: string;
  fetchedAt: number;
}

export interface QuoteResult {
  price: number;
  previousClose: number | null;
  change: number | null;
  percentChange: number | null;
  /** Provider's own market-open flag, when supplied. */
  isMarketOpen: boolean | null;
  providerTime: number;
  source: string;
}

export interface StreamHandlers {
  onPrice(update: PriceUpdate): void;
  onStatus(status: FeedConnection, detail?: string): void;
}

export interface StreamHandle {
  close(): void;
}

export interface FeedCharacteristics {
  /**
   * Typical interval between streamed updates, if the provider documents one.
   * Updates are snapshots of the current price and may be throttled or
   * coalesced, so they are never treated as individual ticks.
   */
  expectedUpdateIntervalMs: number | null;
  /** Whether streamed prices carry bid/ask. */
  providesBidAsk: boolean;
  /** Whether bars carry real volume. */
  providesVolume: boolean;
}

/**
 * Provider-independent market data boundary. Every implementation must label
 * its data origin truthfully and never fabricate bars, prices or volume.
 */
export interface MarketDataAdapter {
  readonly id: string;
  readonly origin: DataOrigin;
  readonly symbol: string;
  readonly characteristics: FeedCharacteristics;
  fetchHistory(tf: Timeframe, req: HistoryRequest): Promise<HistoryResult>;
  fetchQuote(): Promise<QuoteResult>;
  streamPrices(handlers: StreamHandlers): StreamHandle;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "rate_limited" | "auth" | "bad_request" | "unavailable" | "budget_exhausted" | "network" | "unknown",
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
