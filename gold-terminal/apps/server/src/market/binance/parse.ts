import { bucketEnd, isSaneCandle, type Candle, type ContractSpec, type DataOrigin, type PriceUpdate, type Timeframe } from "@gold/core";
import { z } from "zod";
import { ContractValidationError, ProviderError, type BookTop, type DepthSnapshot, type FundingSchedule, type IndexConstituents, type KlineUpdate, type MarkUpdate, type OpenInterestSample, type StreamKind, type Ticker24h } from "../adapter";

/**
 * Pure parsers for Binance USDⓈ-M Futures payloads, kept free of I/O so
 * recorded responses can be replayed in tests.
 */

/** The only instrument this application analyses. */
export const BINANCE_SYMBOL = "XAUUSDT";
export const EXPECTED = { quoteAsset: "USDT", marginAsset: "USDT", baseAsset: "XAU" } as const;

const num = z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().finite());
const optNum = z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === undefined || v === null || v === "" ? null : Number(v))).pipe(z.number().finite().nullable());

/** Binance error body: {"code": -1121, "msg": "Invalid symbol."}. */
const errorSchema = z.object({ code: z.number(), msg: z.string() });

export function asProviderError(status: number, body: unknown, retryAfterSec: number | null): ProviderError | null {
  const retryMs = retryAfterSec !== null ? retryAfterSec * 1000 : null;
  if (status === 418) return new ProviderError(`Binance IP ban (HTTP 418)${retryMs ? `; retry after ${retryAfterSec}s` : ""}`, "banned", retryMs ?? 120_000);
  if (status === 429) return new ProviderError("Binance request-weight limit exceeded (HTTP 429)", "rate_limited", retryMs ?? 60_000);
  if (status === 451) return new ProviderError("Binance Futures is not available from this location (HTTP 451)", "restricted");
  const e = errorSchema.safeParse(body);
  if (status >= 500) return new ProviderError(`Binance unavailable (HTTP ${status})${e.success ? `: ${e.data.msg}` : ""}`, "unavailable", 10_000);
  if (e.success && e.data.code < 0) {
    if (e.data.code === -1003) return new ProviderError(`Binance rate limit: ${e.data.msg}`, "rate_limited", retryMs ?? 60_000);
    if (e.data.code === -2014 || e.data.code === -2015) return new ProviderError(`Binance auth: ${e.data.msg}`, "auth");
    return new ProviderError(`Binance error ${e.data.code}: ${e.data.msg}`, status >= 400 && status < 500 ? "bad_request" : "unknown");
  }
  if (status >= 400) return new ProviderError(`Binance HTTP ${status}`, "bad_request");
  return null;
}

// ------------------------------------------------------------ exchangeInfo

const filterSchema = z.object({ filterType: z.string() }).passthrough();
const symbolSchema = z
  .object({
    symbol: z.string(),
    pair: z.string().optional().default(""),
    contractType: z.string().optional().default(""),
    status: z.string(),
    baseAsset: z.string(),
    quoteAsset: z.string(),
    marginAsset: z.string().optional().default(""),
    pricePrecision: z.number().optional().default(0),
    quantityPrecision: z.number().optional().default(0),
    underlyingType: z.string().optional().nullable(),
    underlyingSubType: z.array(z.string()).optional().default([]),
    maintMarginPercent: optNum,
    requiredMarginPercent: optNum,
    liquidationFee: optNum,
    onboardDate: z.number().optional().nullable(),
    deliveryDate: z.number().optional().nullable(),
    filters: z.array(filterSchema),
  })
  .passthrough();

const exchangeInfoSchema = z
  .object({
    rateLimits: z.array(z.object({ rateLimitType: z.string(), interval: z.string(), intervalNum: z.number(), limit: z.number() })).optional().default([]),
    symbols: z.array(z.unknown()),
  })
  .passthrough();

export interface ExchangeInfo {
  spec: ContractSpec;
  /** REQUEST_WEIGHT per minute, when published. */
  requestWeightPerMinute: number | null;
}

/**
 * Extract and validate XAUUSDT from /fapi/v1/exchangeInfo. Throws
 * ContractValidationError if the symbol is missing or is not a USDT-settled
 * gold perpetual; there is no fallback to any other instrument.
 */
export function parseExchangeInfo(body: unknown, fetchedAt: number): ExchangeInfo {
  const info = exchangeInfoSchema.safeParse(body);
  if (!info.success) throw new ProviderError("Malformed exchangeInfo response", "unknown");
  const raw = info.data.symbols.find((s) => (s as { symbol?: string })?.symbol === BINANCE_SYMBOL);
  if (!raw) throw new ContractValidationError([`${BINANCE_SYMBOL} is not listed in /fapi/v1/exchangeInfo`]);
  const parsed = symbolSchema.safeParse(raw);
  if (!parsed.success) throw new ContractValidationError([`${BINANCE_SYMBOL} entry is malformed: ${parsed.error.issues[0]?.message}`]);
  const s = parsed.data;
  const problems: string[] = [];
  if (s.quoteAsset !== EXPECTED.quoteAsset) problems.push(`quote asset is ${s.quoteAsset}, expected USDT`);
  if (s.marginAsset !== EXPECTED.marginAsset) problems.push(`margin/settlement asset is ${s.marginAsset || "missing"}, expected USDT`);
  if (s.baseAsset !== EXPECTED.baseAsset) problems.push(`base asset is ${s.baseAsset}, expected XAU`);
  if (!s.contractType.includes("PERPETUAL")) problems.push(`contract type is ${s.contractType || "missing"}, expected a perpetual`);
  const f = (type: string) => s.filters.find((x) => x.filterType === type) as Record<string, unknown> | undefined;
  const price = f("PRICE_FILTER");
  const lot = f("LOT_SIZE");
  const mlot = f("MARKET_LOT_SIZE");
  const minN = f("MIN_NOTIONAL");
  const n = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const tickSize = n(price?.tickSize);
  const stepSize = n(lot?.stepSize);
  const minQty = n(lot?.minQty);
  if (!(tickSize! > 0)) problems.push("PRICE_FILTER.tickSize missing");
  if (!(stepSize! > 0) || !(minQty! > 0)) problems.push("LOT_SIZE filter missing");
  if (problems.length) throw new ContractValidationError(problems);
  const weight = info.data.rateLimits.find((r) => r.rateLimitType === "REQUEST_WEIGHT" && r.interval === "MINUTE");
  return {
    requestWeightPerMinute: weight ? weight.limit / weight.intervalNum : null,
    spec: {
      exchange: "binance-usdm",
      symbol: s.symbol,
      pair: s.pair,
      contractType: s.contractType,
      status: s.status,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      marginAsset: s.marginAsset,
      underlyingType: s.underlyingType ?? null,
      underlyingSubType: s.underlyingSubType,
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision,
      tickSize: tickSize!,
      minPrice: n(price?.minPrice) ?? 0,
      maxPrice: n(price?.maxPrice) ?? 0,
      stepSize: stepSize!,
      minQty: minQty!,
      maxQty: n(lot?.maxQty) ?? Number.MAX_SAFE_INTEGER,
      marketStepSize: n(mlot?.stepSize),
      marketMinQty: n(mlot?.minQty),
      marketMaxQty: n(mlot?.maxQty),
      minNotional: n(minN?.notional),
      maintMarginPercent: s.maintMarginPercent,
      requiredMarginPercent: s.requiredMarginPercent,
      liquidationFee: s.liquidationFee,
      onboardDate: s.onboardDate ?? null,
      deliveryDate: s.deliveryDate ?? null,
      fetchedAt,
    },
  };
}

// ------------------------------------------------------------ klines

/** [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore] */
const klineRow = z.tuple([z.number(), num, num, num, num, num, z.number(), num, z.number()]).rest(z.unknown());

export interface ParsedKlines {
  closed: Candle[];
  forming: Candle | null;
  rejected: number;
}

/**
 * Parse /fapi/v1/klines. Binance returns the still-forming bar last; anything
 * whose bucket has not elapsed at `nowMs` is returned separately and never
 * drives confirmed signals. Volume is the exchange-reported base volume (0 is
 * a real value: no trades in that interval).
 */
export function parseKlines(body: unknown, tf: Timeframe, nowMs: number): ParsedKlines {
  if (!Array.isArray(body)) throw new ProviderError("Malformed klines response", "unknown");
  const out: Candle[] = [];
  let rejected = 0;
  for (const row of body) {
    const r = klineRow.safeParse(row);
    if (!r.success) {
      rejected++;
      continue;
    }
    const [openTime, open, high, low, close, volume] = r.data;
    const c: Candle = { openTime, open, high, low, close, volume, status: "confirmed" };
    if (!isSaneCandle(c) || volume < 0) {
      rejected++;
      continue;
    }
    out.push(c);
  }
  out.sort((a, b) => a.openTime - b.openTime);
  const unique = out.filter((c, i) => i === 0 || c.openTime !== out[i - 1]!.openTime);
  const closed: Candle[] = [];
  let forming: Candle | null = null;
  for (const c of unique) {
    if (nowMs >= bucketEnd(c.openTime, tf)) closed.push(c);
    else forming = { ...c, status: "forming" };
  }
  return { closed, forming, rejected };
}

/** Request weight of GET /fapi/v1/klines by limit. */
export function klinesWeight(limit: number): number {
  if (limit < 100) return 1;
  if (limit < 500) return 2;
  if (limit <= 1000) return 5;
  return 10;
}

// ------------------------------------------------------------ market state (REST)

const level = z.tuple([num, num]);

export function parseDepth(body: unknown, receivedAt: number): DepthSnapshot {
  const d = z.object({ E: z.number().optional(), T: z.number().optional(), bids: z.array(level), asks: z.array(level) }).parse(body);
  return { bids: d.bids, asks: d.asks, exchangeTime: d.T ?? d.E ?? receivedAt, receivedAt };
}

export function parseBookTickerRest(body: unknown, receivedAt: number): BookTop {
  const b = z.object({ symbol: z.literal(BINANCE_SYMBOL), bidPrice: num, bidQty: num, askPrice: num, askQty: num, time: z.number().optional() }).parse(body);
  return { bid: b.bidPrice, bidQty: b.bidQty, ask: b.askPrice, askQty: b.askQty, exchangeTime: b.time ?? receivedAt, receivedAt };
}

export function parsePremiumIndex(body: unknown, receivedAt: number): MarkUpdate {
  const p = z
    .object({ symbol: z.literal(BINANCE_SYMBOL), markPrice: num, indexPrice: num, estimatedSettlePrice: optNum, lastFundingRate: optNum, nextFundingTime: z.number().optional().nullable(), time: z.number() })
    .parse(body);
  return { markPrice: p.markPrice, indexPrice: p.indexPrice, estimatedSettlePrice: p.estimatedSettlePrice, fundingRate: p.lastFundingRate, nextFundingTime: p.nextFundingTime || null, exchangeTime: p.time, receivedAt };
}

export function parseTicker24hRest(body: unknown, receivedAt: number): Ticker24h {
  const t = z
    .object({ symbol: z.literal(BINANCE_SYMBOL), lastPrice: num, priceChange: num, priceChangePercent: num, highPrice: num, lowPrice: num, volume: num, quoteVolume: num, closeTime: z.number() })
    .parse(body);
  return { lastPrice: t.lastPrice, priceChange: t.priceChange, priceChangePercent: t.priceChangePercent, high: t.highPrice, low: t.lowPrice, volume: t.volume, quoteVolume: t.quoteVolume, exchangeTime: t.closeTime, receivedAt };
}

export function parseOpenInterest(body: unknown): OpenInterestSample {
  const o = z.object({ symbol: z.literal(BINANCE_SYMBOL), openInterest: num, time: z.number() }).parse(body);
  return { openInterest: o.openInterest, time: o.time };
}

export function parseOpenInterestHist(body: unknown): OpenInterestSample[] {
  const rows = z.array(z.object({ sumOpenInterest: num, timestamp: z.number() })).parse(body);
  return rows.map((r) => ({ openInterest: r.sumOpenInterest, time: r.timestamp })).sort((a, b) => a.time - b.time);
}

export function parseTickerPrice(body: unknown): { price: number; time: number } {
  const p = z.object({ symbol: z.literal(BINANCE_SYMBOL), price: num, time: z.number() }).parse(body);
  return { price: p.price, time: p.time };
}

export function parseServerTime(body: unknown): number {
  return z.object({ serverTime: z.number() }).parse(body).serverTime;
}

/** Combine /fapi/v1/fundingInfo (only lists symbols with adjusted parameters) and recent /fapi/v1/fundingRate history. */
export function parseFundingSchedule(infoBody: unknown, historyBody: unknown): FundingSchedule {
  const info = z
    .array(z.object({ symbol: z.string(), fundingIntervalHours: z.number().optional(), adjustedFundingRateCap: optNum, adjustedFundingRateFloor: optNum }).passthrough())
    .safeParse(infoBody);
  const entry = info.success ? info.data.find((x) => x.symbol === BINANCE_SYMBOL) : undefined;
  const hist = z.array(z.object({ symbol: z.string(), fundingTime: z.number(), fundingRate: num })).safeParse(historyBody);
  const events = hist.success ? hist.data.filter((h) => h.symbol === BINANCE_SYMBOL).sort((a, b) => a.fundingTime - b.fundingTime) : [];
  let intervalHours: number | null = entry?.fundingIntervalHours ?? null;
  let intervalSource: FundingSchedule["intervalSource"] = intervalHours ? "fundingInfo" : null;
  if (!intervalHours && events.length >= 2) {
    const gaps = events.slice(1).map((e, i) => e.fundingTime - events[i]!.fundingTime);
    const h = Math.round(Math.min(...gaps) / 3_600_000);
    if (h > 0) {
      intervalHours = h;
      intervalSource = "history";
    }
  }
  const last = events.at(-1);
  return {
    intervalHours,
    intervalSource,
    capRate: entry?.adjustedFundingRateCap ?? null,
    floorRate: entry?.adjustedFundingRateFloor ?? null,
    lastFundingRate: last?.fundingRate ?? null,
    lastFundingTime: last?.fundingTime ?? null,
  };
}

export function parseConstituents(body: unknown): IndexConstituents | null {
  const c = z
    .object({ symbol: z.string(), time: z.number(), constituents: z.array(z.object({ exchange: z.string(), symbol: z.string(), weight: optNum, price: optNum }).passthrough()) })
    .safeParse(body);
  if (!c.success || c.data.symbol !== BINANCE_SYMBOL) return null;
  return { time: c.data.time, constituents: c.data.constituents.map((x) => ({ exchange: x.exchange, symbol: x.symbol, weight: x.weight, price: x.price })) };
}

// ------------------------------------------------------------ WebSocket

const INTERVAL_TO_TF: Record<string, Timeframe> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d" };

export type WsEvent =
  | { kind: "trade"; update: PriceUpdate; qty: number }
  | { kind: "mark"; mark: MarkUpdate }
  | { kind: "bookTicker"; book: BookTop }
  | { kind: "depth"; depth: DepthSnapshot }
  | { kind: "ticker"; ticker: Ticker24h }
  | { kind: "kline"; kline: KlineUpdate }
  | { kind: "ignored"; reason: string };

export const streamKindOf = (e: WsEvent): StreamKind | null => (e.kind === "ignored" ? null : e.kind);

/**
 * Parse one combined-stream frame ({"stream": "...", "data": {...}}). Each
 * aggTrade is a real trade; mark, book, depth and ticker frames are snapshots
 * pushed at the exchange's own cadence and are never counted as trades.
 */
export function parseWsFrame(raw: string, receivedAt: number, origin: DataOrigin = "live", source = "binance-ws"): WsEvent {
  let frame: unknown;
  try {
    frame = JSON.parse(raw);
  } catch {
    return { kind: "ignored", reason: "invalid_json" };
  }
  const data = (frame as { data?: unknown })?.data ?? frame;
  const d = data as Record<string, unknown>;
  if (d?.s !== undefined && d.s !== BINANCE_SYMBOL) return { kind: "ignored", reason: `foreign symbol ${String(d.s)}` };
  try {
    switch (d?.e) {
      case "aggTrade": {
        const t = z.object({ E: z.number(), T: z.number(), p: num, q: num }).parse(d);
        if (!(t.p > 0)) return { kind: "ignored", reason: "invalid_price" };
        return {
          kind: "trade",
          qty: t.q,
          update: { symbol: BINANCE_SYMBOL, price: t.p, providerTime: t.T, receivedAt, bid: null, ask: null, priceKind: "last", source: `${source}:aggTrade`, origin },
        };
      }
      case "markPriceUpdate": {
        const m = z.object({ E: z.number(), p: num, i: num, P: optNum, r: optNum, T: z.number().optional() }).parse(d);
        return { kind: "mark", mark: { markPrice: m.p, indexPrice: m.i, estimatedSettlePrice: m.P, fundingRate: m.r, nextFundingTime: m.T || null, exchangeTime: m.E, receivedAt } };
      }
      case "bookTicker": {
        const b = z.object({ E: z.number().optional(), T: z.number().optional(), b: num, B: num, a: num, A: num }).parse(d);
        return { kind: "bookTicker", book: { bid: b.b, bidQty: b.B, ask: b.a, askQty: b.A, exchangeTime: b.T ?? b.E ?? receivedAt, receivedAt } };
      }
      case "depthUpdate": {
        const u = z.object({ E: z.number(), T: z.number().optional(), b: z.array(level), a: z.array(level) }).parse(d);
        return { kind: "depth", depth: { bids: u.b, asks: u.a, exchangeTime: u.T ?? u.E, receivedAt } };
      }
      case "24hrTicker": {
        const t = z.object({ E: z.number(), c: num, p: num, P: num, h: num, l: num, v: num, q: num }).parse(d);
        return { kind: "ticker", ticker: { lastPrice: t.c, priceChange: t.p, priceChangePercent: t.P, high: t.h, low: t.l, volume: t.v, quoteVolume: t.q, exchangeTime: t.E, receivedAt } };
      }
      case "kline": {
        const k = z.object({ E: z.number(), k: z.object({ t: z.number(), i: z.string(), o: num, h: num, l: num, c: num, v: num, x: z.boolean() }) }).parse(d);
        const tf = INTERVAL_TO_TF[k.k.i];
        if (!tf) return { kind: "ignored", reason: `interval ${k.k.i}` };
        const candle: Candle = { openTime: k.k.t, open: k.k.o, high: k.k.h, low: k.k.l, close: k.k.c, volume: k.k.v, status: k.k.x ? "confirmed" : "forming" };
        if (!isSaneCandle(candle)) return { kind: "ignored", reason: "invalid_kline" };
        return { kind: "kline", kline: { tf, candle, closed: k.k.x, exchangeTime: k.E } };
      }
      default:
        return { kind: "ignored", reason: `event ${String(d?.e ?? (frame as { result?: unknown })?.result ?? "unknown")}` };
    }
  } catch (err) {
    return { kind: "ignored", reason: `malformed ${String(d?.e)}: ${(err as Error).message.slice(0, 80)}` };
  }
}
