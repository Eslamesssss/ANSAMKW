import type { Candle, ContractSpec, DataOrigin, FeedConnection, PriceUpdate, Timeframe } from "@gold/core";

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

/** Best bid/ask from the exchange's order book (real quotes, not a mid). */
export interface BookTop {
  bid: number;
  bidQty: number;
  ask: number;
  askQty: number;
  exchangeTime: number;
  receivedAt: number;
}

export interface DepthSnapshot {
  bids: [price: number, qty: number][];
  asks: [price: number, qty: number][];
  exchangeTime: number;
  receivedAt: number;
}

export interface MarkUpdate {
  markPrice: number;
  indexPrice: number;
  estimatedSettlePrice: number | null;
  fundingRate: number | null;
  nextFundingTime: number | null;
  exchangeTime: number;
  receivedAt: number;
}

export interface Ticker24h {
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  /** Base-asset volume over the rolling 24h window. */
  volume: number;
  /** Quote-asset (USDT) volume over the rolling 24h window. */
  quoteVolume: number;
  exchangeTime: number;
  receivedAt: number;
}

export interface OpenInterestSample {
  /** Base-asset quantity. */
  openInterest: number;
  time: number;
}

export interface FundingSchedule {
  intervalHours: number | null;
  /** Where the interval came from: the fundingInfo endpoint or spacing of recent funding events. */
  intervalSource: "fundingInfo" | "history" | null;
  capRate: number | null;
  floorRate: number | null;
  lastFundingRate: number | null;
  lastFundingTime: number | null;
}

export interface IndexConstituents {
  time: number;
  constituents: { exchange: string; symbol: string; weight: number | null; price: number | null }[];
}

export interface KlineUpdate {
  tf: Timeframe;
  candle: Candle;
  /** The exchange marked this kline final. */
  closed: boolean;
  exchangeTime: number;
}

export type StreamKind = "trade" | "mark" | "bookTicker" | "depth" | "ticker" | "kline";

export interface StreamHandlers {
  onPrice(update: PriceUpdate): void;
  onStatus(status: FeedConnection, detail?: string): void;
  onBookTop?(b: BookTop): void;
  onDepth?(d: DepthSnapshot): void;
  onMark?(m: MarkUpdate): void;
  onTicker?(t: Ticker24h): void;
  onKline?(k: KlineUpdate): void;
  /** Every stream message, for per-stream liveness monitoring. */
  onStreamMessage?(kind: StreamKind, receivedAt: number): void;
}

export interface StreamHandle {
  close(): void;
}

export interface FeedCharacteristics {
  /**
   * Typical interval between streamed updates, if the provider documents one.
   * Updates are never treated as individual ticks unless they are trades.
   */
  expectedUpdateIntervalMs: number | null;
  /** Whether the feed carries real exchange bid/ask quotes. */
  providesBidAsk: boolean;
  /** Whether bars carry real volume. */
  providesVolume: boolean;
  /** Streams the adapter delivers, with the silence after which each is stale. */
  streams: Partial<Record<StreamKind, number>>;
}

export interface MarketSync {
  bookTop: BookTop | null;
  depth: DepthSnapshot | null;
  mark: MarkUpdate | null;
  ticker: Ticker24h | null;
  openInterest: OpenInterestSample | null;
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
  /** Read and validate the contract. Throws ContractValidationError if it is not the expected instrument. */
  loadContract(): Promise<ContractSpec>;
  fetchHistory(tf: Timeframe, req: HistoryRequest): Promise<HistoryResult>;
  /** REST state used for initial synchronisation and after reconnects. */
  fetchMarketSync(): Promise<MarketSync>;
  fetchOpenInterest(): Promise<OpenInterestSample>;
  /** Recent open-interest samples (oldest first) for change calculations. */
  fetchOpenInterestHistory?(): Promise<OpenInterestSample[]>;
  fetchFundingSchedule?(): Promise<FundingSchedule>;
  fetchIndexConstituents?(): Promise<IndexConstituents | null>;
  /** Exchange clock minus local clock (ms), when the provider exposes server time. */
  measureClockOffset?(): Promise<number>;
  /** Latest trade price over REST, used while the stream is down. */
  fetchPrice?(): Promise<{ price: number; time: number }>;
  streamMarket(handlers: StreamHandlers): StreamHandle;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "rate_limited" | "banned" | "restricted" | "auth" | "bad_request" | "unavailable" | "budget_exhausted" | "network" | "unknown",
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** The configured instrument does not match what the exchange reports. Never fall back to another symbol. */
export class ContractValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Contract validation failed: ${problems.join("; ")}`);
    this.name = "ContractValidationError";
  }
}
