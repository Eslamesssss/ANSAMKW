import { TIMEFRAMES, type ContractSpec, type Timeframe } from "@gold/core";
import type WebSocket from "ws";
import {
  ProviderError,
  type FeedCharacteristics,
  type FundingSchedule,
  type HistoryRequest,
  type HistoryResult,
  type IndexConstituents,
  type MarketDataAdapter,
  type MarketSync,
  type OpenInterestSample,
  type StreamHandle,
  type StreamHandlers,
} from "../adapter";
import {
  asProviderError,
  BINANCE_SYMBOL,
  klinesWeight,
  parseBookTickerRest,
  parseConstituents,
  parseDepth,
  parseExchangeInfo,
  parseFundingSchedule,
  parseKlines,
  parseOpenInterest,
  parseOpenInterestHist,
  parsePremiumIndex,
  parseServerTime,
  parseTicker24hRest,
  parseTickerPrice,
  parseWsFrame,
  streamKindOf,
} from "./parse";
import { combineStatus, ManagedSocket } from "./socket";
import { WeightBudget } from "./weightBudget";

export interface BinanceOptions {
  restUrl: string;
  /** Combined-stream endpoint for trades, mark price, ticker and klines. */
  wsMarketUrl: string;
  /** Combined-stream endpoint for bookTicker and depth. */
  wsBookUrl: string;
  budget: WeightBudget;
  fetchImpl?: typeof fetch;
  wsFactory?: (url: string) => WebSocket;
  now?: () => number;
  silenceTimeoutMs?: number;
  maxConnectionMs?: number;
  log?: (msg: string, detail?: unknown) => void;
}

export const DEPTH_LEVELS = 20;
const s = BINANCE_SYMBOL.toLowerCase();
export const MARKET_STREAMS = [`${s}@aggTrade`, `${s}@markPrice@1s`, `${s}@ticker`, ...TIMEFRAMES.map((tf) => `${s}@kline_${tf}`)];
export const BOOK_STREAMS = [`${s}@bookTicker`, `${s}@depth${DEPTH_LEVELS}@100ms`];

/**
 * Binance USDⓈ-M Futures, XAUUSDT perpetual only. Public market data:
 * no API key is used or accepted, and no order endpoints exist here.
 */
export class BinanceFuturesAdapter implements MarketDataAdapter {
  readonly id = "binance-usdm";
  readonly origin = "live" as const;
  readonly symbol = BINANCE_SYMBOL;
  readonly characteristics: FeedCharacteristics = {
    expectedUpdateIntervalMs: 1000,
    providesBidAsk: true,
    providesVolume: true,
    // Silence after which each stream is reported stale.
    streams: { mark: 5_000, depth: 5_000, ticker: 10_000, bookTicker: 30_000, kline: 30_000, trade: 120_000 },
  };
  private fetchImpl: typeof fetch;
  private now: () => number;

  constructor(private o: BinanceOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
  }

  get budget() {
    return this.o.budget;
  }

  private async get(path: string, params: Record<string, string>, weight: number): Promise<unknown> {
    this.o.budget.take(weight);
    const url = new URL(path, this.o.restUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new ProviderError(`Network error calling Binance ${path}: ${(err as Error).message}`, "network", 5_000);
    }
    const used = res.headers.get("x-mbx-used-weight-1m");
    if (used !== null && Number.isFinite(Number(used))) this.o.budget.report(Number(used));
    const retryAfter = res.headers.get("retry-after");
    const body = await res.json().catch(() => null);
    const err = asProviderError(res.status, body, retryAfter !== null ? Number(retryAfter) : null);
    if (err) {
      if (err.code === "rate_limited" || err.code === "banned") this.o.budget.block(err.retryAfterMs ?? 60_000, err.code);
      throw err;
    }
    if (body === null) throw new ProviderError(`Non-JSON response from Binance ${path}`, "unknown", 5_000);
    return body;
  }

  async loadContract(): Promise<ContractSpec> {
    const info = parseExchangeInfo(await this.get("/fapi/v1/exchangeInfo", {}, 1), this.now());
    if (info.requestWeightPerMinute) this.o.budget.limitPerMinute = info.requestWeightPerMinute;
    return info.spec;
  }

  async fetchHistory(tf: Timeframe, req: HistoryRequest): Promise<HistoryResult> {
    const limit = Math.min(1500, Math.max(1, req.outputsize ?? 500));
    const params: Record<string, string> = { symbol: this.symbol, interval: tf, limit: String(limit) };
    if (req.startMs !== undefined) params.startTime = String(req.startMs);
    if (req.endMs !== undefined) params.endTime = String(req.endMs);
    const body = await this.get("/fapi/v1/klines", params, klinesWeight(limit));
    const fetchedAt = this.now();
    return { ...parseKlines(body, tf, fetchedAt), source: `binance-rest:klines:${tf}`, fetchedAt };
  }

  async fetchMarketSync(): Promise<MarketSync> {
    const t = () => this.now();
    const [depth, book, mark, ticker, oi] = await Promise.allSettled([
      this.get("/fapi/v1/depth", { symbol: this.symbol, limit: String(DEPTH_LEVELS) }, 2).then((b) => parseDepth(b, t())),
      this.get("/fapi/v1/ticker/bookTicker", { symbol: this.symbol }, 2).then((b) => parseBookTickerRest(b, t())),
      this.get("/fapi/v1/premiumIndex", { symbol: this.symbol }, 1).then((b) => parsePremiumIndex(b, t())),
      this.get("/fapi/v1/ticker/24hr", { symbol: this.symbol }, 1).then((b) => parseTicker24hRest(b, t())),
      this.fetchOpenInterest(),
    ]);
    const v = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
    const firstError = [depth, book, mark, ticker, oi].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstError && [depth, book, mark, ticker, oi].every((r) => r.status === "rejected")) throw firstError.reason;
    return { depth: v(depth), bookTop: v(book), mark: v(mark), ticker: v(ticker), openInterest: v(oi) };
  }

  async fetchOpenInterest(): Promise<OpenInterestSample> {
    return parseOpenInterest(await this.get("/fapi/v1/openInterest", { symbol: this.symbol }, 1));
  }

  async fetchOpenInterestHistory(): Promise<OpenInterestSample[]> {
    return parseOpenInterestHist(await this.get("/futures/data/openInterestHist", { symbol: this.symbol, period: "5m", limit: "13" }, 1));
  }

  async fetchFundingSchedule(): Promise<FundingSchedule> {
    const [info, hist] = await Promise.allSettled([this.get("/fapi/v1/fundingInfo", {}, 1), this.get("/fapi/v1/fundingRate", { symbol: this.symbol, limit: "4" }, 1)]);
    // fundingInfo legitimately omits most symbols, but if both calls fail there is nothing to report.
    if (info.status === "rejected" && hist.status === "rejected") throw hist.reason;
    return parseFundingSchedule(info.status === "fulfilled" ? info.value : [], hist.status === "fulfilled" ? hist.value : []);
  }

  async fetchIndexConstituents(): Promise<IndexConstituents | null> {
    return parseConstituents(await this.get("/fapi/v1/constituents", { symbol: this.symbol }, 2));
  }

  async measureClockOffset(): Promise<number> {
    const t0 = this.now();
    const server = parseServerTime(await this.get("/fapi/v1/time", {}, 1));
    const t1 = this.now();
    return server - (t0 + t1) / 2;
  }

  async fetchPrice() {
    return parseTickerPrice(await this.get("/fapi/v2/ticker/price", { symbol: this.symbol }, 1));
  }

  streamMarket(h: StreamHandlers): StreamHandle {
    const statuses = new Map<string, { status: ReturnType<typeof combineStatus>; detail?: string }>();
    const report = () => {
      const all = [...statuses.values()];
      const combined = combineStatus(all.map((x) => x.status));
      const detail = [...statuses.entries()].map(([k, v]) => `${k}: ${v.status}${v.detail ? ` (${v.detail})` : ""}`).join("; ");
      h.onStatus(combined, detail);
    };
    const onMessage = (raw: string, receivedAt: number) => {
      const e = parseWsFrame(raw, receivedAt);
      const kind = streamKindOf(e);
      if (kind) h.onStreamMessage?.(kind, receivedAt);
      switch (e.kind) {
        case "trade":
          return h.onPrice(e.update);
        case "mark":
          return h.onMark?.(e.mark);
        case "bookTicker":
          return h.onBookTop?.(e.book);
        case "depth":
          return h.onDepth?.(e.depth);
        case "ticker":
          return h.onTicker?.(e.ticker);
        case "kline":
          return h.onKline?.(e.kline);
      }
    };
    const make = (name: string, base: string, streams: string[]) => {
      statuses.set(name, { status: "connecting" });
      return new ManagedSocket({
        name,
        url: `${base}?streams=${streams.join("/")}`,
        onMessage,
        onStatus: (status, detail) => {
          statuses.set(name, { status, detail });
          report();
        },
        now: this.now,
        wsFactory: this.o.wsFactory,
        silenceTimeoutMs: this.o.silenceTimeoutMs ?? 15_000,
        maxConnectionMs: this.o.maxConnectionMs ?? 23 * 3600_000,
        log: this.o.log,
      }).start();
    };
    const sockets = [make("market", this.o.wsMarketUrl, MARKET_STREAMS), make("book", this.o.wsBookUrl, BOOK_STREAMS)];
    return { close: () => sockets.forEach((x) => x.close()) };
  }
}
