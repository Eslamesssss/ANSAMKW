import { bucketEnd, isSaneCandle, type Candle, type DataOrigin, type PriceUpdate, type Timeframe } from "@gold/core";
import { z } from "zod";
import { ProviderError } from "../adapter";

/**
 * Pure parsers for Twelve Data payloads. Kept separate from I/O so recorded
 * responses can be replayed in tests.
 */

const num = z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().finite());

const errorSchema = z.object({ status: z.literal("error"), code: z.number(), message: z.string() });

const timeSeriesSchema = z.object({
  meta: z.object({ symbol: z.string(), interval: z.string() }).passthrough(),
  values: z.array(
    z.object({
      datetime: z.string(),
      open: num,
      high: num,
      low: num,
      close: num,
      volume: num.optional(),
    }),
  ),
  status: z.literal("ok").optional(),
});

/** Interpret a Twelve Data error body (they are returned with HTTP 200 or 4xx). */
export function asProviderError(body: unknown): ProviderError | null {
  const e = errorSchema.safeParse(body);
  if (!e.success) return null;
  const { code, message } = e.data;
  if (code === 429) return new ProviderError(`Twelve Data rate limit: ${message}`, "rate_limited", 60_000);
  if (code === 401 || code === 403) return new ProviderError(`Twelve Data auth: ${message}`, "auth");
  if (code === 400 || code === 404) return new ProviderError(`Twelve Data request: ${message}`, "bad_request");
  if (code >= 500) return new ProviderError(`Twelve Data unavailable: ${message}`, "unavailable", 30_000);
  return new ProviderError(`Twelve Data error ${code}: ${message}`, "unknown");
}

/** Parse "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD" as UTC (requests always send timezone=UTC). */
export function parseUtcDatetime(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) throw new ProviderError(`Unrecognised datetime "${s}"`, "unknown");
  const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
}

export interface ParsedSeries {
  closed: Candle[];
  forming: Candle | null;
  rejected: number;
}

/**
 * Convert a time_series response into candles. The provider's latest bar is
 * usually still forming; anything whose bucket has not elapsed at `nowMs` is
 * returned separately and must not drive confirmed signals.
 */
export function parseTimeSeries(body: unknown, tf: Timeframe, nowMs: number): ParsedSeries {
  const err = asProviderError(body);
  if (err) throw err;
  const parsed = timeSeriesSchema.safeParse(body);
  if (!parsed.success) throw new ProviderError(`Malformed time_series response: ${parsed.error.issues[0]?.message ?? "unknown"}`, "unknown");
  const candles: Candle[] = [];
  let rejected = 0;
  for (const v of parsed.data.values) {
    const c: Candle = {
      openTime: parseUtcDatetime(v.datetime),
      open: v.open,
      high: v.high,
      low: v.low,
      close: v.close,
      // Twelve Data omits volume for XAU/USD; keep null rather than inventing 0.
      volume: v.volume !== undefined && v.volume > 0 ? v.volume : null,
      status: "confirmed",
    };
    if (!isSaneCandle(c)) {
      rejected++;
      continue;
    }
    candles.push(c);
  }
  // Provider order is configurable; normalise to ascending and de-duplicate.
  candles.sort((a, b) => a.openTime - b.openTime);
  const unique = candles.filter((c, i) => i === 0 || c.openTime !== candles[i - 1]!.openTime);
  const closed: Candle[] = [];
  let forming: Candle | null = null;
  for (const c of unique) {
    if (nowMs >= bucketEnd(c.openTime, tf)) closed.push(c);
    else forming = { ...c, status: "forming" };
  }
  return { closed, forming, rejected };
}

const quoteSchema = z
  .object({
    symbol: z.string(),
    close: num,
    previous_close: num.optional(),
    change: num.optional(),
    percent_change: num.optional(),
    is_market_open: z.boolean().optional(),
    timestamp: z.number().optional(),
    last_quote_at: z.number().optional(),
  })
  .passthrough();

export function parseQuote(body: unknown) {
  const err = asProviderError(body);
  if (err) throw err;
  const q = quoteSchema.parse(body);
  const t = q.last_quote_at ?? q.timestamp;
  return {
    price: q.close,
    previousClose: q.previous_close ?? null,
    change: q.change ?? null,
    percentChange: q.percent_change ?? null,
    isMarketOpen: q.is_market_open ?? null,
    providerTime: t ? t * 1000 : Date.now(),
  };
}

export function parsePrice(body: unknown): number {
  const err = asProviderError(body);
  if (err) throw err;
  return z.object({ price: num }).parse(body).price;
}

const wsPriceSchema = z.object({
  event: z.literal("price"),
  symbol: z.string(),
  timestamp: z.number(),
  price: num,
  bid: num.optional(),
  ask: num.optional(),
});

export type WsMessage =
  | { type: "price"; update: PriceUpdate }
  | { type: "subscribe-status"; ok: boolean; fails: unknown[] }
  | { type: "heartbeat"; ok: boolean }
  | { type: "other"; event: string };

/**
 * Parse one WebSocket frame. Twelve Data sends `price` events whenever its
 * aggregated price changes (not per trade), plus `subscribe-status` and
 * `heartbeat` control frames.
 */
export function parseWsMessage(raw: string, receivedAt: number, origin: DataOrigin = "live"): WsMessage {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { type: "other", event: "invalid_json" };
  }
  const ev = (body as { event?: string }).event;
  if (ev === "price") {
    const p = wsPriceSchema.safeParse(body);
    if (!p.success || !(p.data.price > 0)) return { type: "other", event: "invalid_price" };
    const bid = p.data.bid !== undefined && p.data.bid > 0 ? p.data.bid : null;
    const ask = p.data.ask !== undefined && p.data.ask > 0 ? p.data.ask : null;
    const isMid = bid !== null && ask !== null && Math.abs((bid + ask) / 2 - p.data.price) < 1e-6 * p.data.price;
    return {
      type: "price",
      update: {
        symbol: p.data.symbol,
        price: p.data.price,
        providerTime: p.data.timestamp * 1000,
        receivedAt,
        bid,
        ask,
        priceKind: isMid ? "mid" : "indicative",
        source: "twelvedata-ws",
        origin,
      },
    };
  }
  if (ev === "subscribe-status") {
    const b = body as { status?: string; fails?: unknown[] };
    return { type: "subscribe-status", ok: b.status === "ok" && !(b.fails && b.fails.length), fails: b.fails ?? [] };
  }
  if (ev === "heartbeat") return { type: "heartbeat", ok: (body as { status?: string }).status === "ok" };
  return { type: "other", event: String(ev) };
}
