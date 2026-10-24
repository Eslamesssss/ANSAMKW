import { TWELVE_DATA_INTERVAL, type Timeframe } from "@gold/core";
import WebSocket from "ws";
import {
  ProviderError,
  type FeedCharacteristics,
  type HistoryRequest,
  type HistoryResult,
  type MarketDataAdapter,
  type QuoteResult,
  type StreamHandle,
  type StreamHandlers,
} from "../adapter";
import { CreditBudget } from "./creditBudget";
import { asProviderError, parsePrice, parseQuote, parseTimeSeries, parseWsMessage } from "./parse";

export interface TwelveDataOptions {
  apiKey: string;
  symbol: string;
  restUrl: string;
  wsUrl: string;
  budget: CreditBudget;
  fetchImpl?: typeof fetch;
  /** Injected for tests. */
  wsFactory?: (url: string) => WebSocket;
  now?: () => number;
  heartbeatMs?: number;
  /** Reconnect if no frame at all (price or heartbeat) arrives within this window. */
  silenceTimeoutMs?: number;
  log?: (msg: string, detail?: unknown) => void;
}

const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

export class TwelveDataAdapter implements MarketDataAdapter {
  readonly id = "twelvedata";
  readonly origin = "live" as const;
  readonly symbol: string;
  readonly characteristics: FeedCharacteristics = {
    // Twelve Data streams aggregated price changes with no fixed cadence.
    expectedUpdateIntervalMs: null,
    providesBidAsk: false,
    providesVolume: false,
  };
  private fetchImpl: typeof fetch;
  private now: () => number;

  constructor(private opts: TwelveDataOptions) {
    this.symbol = opts.symbol;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  get budget() {
    return this.opts.budget;
  }

  private async get(path: string, params: Record<string, string>, credits = 1): Promise<unknown> {
    this.opts.budget.take(credits);
    const url = new URL(path, this.opts.restUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("apikey", this.opts.apiKey);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new ProviderError(`Network error calling Twelve Data ${path}: ${(err as Error).message}`, "network", 5_000);
    }
    const left = res.headers.get("api-credits-left");
    if (left !== null && Number.isFinite(Number(left))) this.opts.budget.providerRemaining = Number(left);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ProviderError(`Non-JSON response from Twelve Data ${path} (HTTP ${res.status})`, res.status >= 500 ? "unavailable" : "unknown", 10_000);
    }
    const err = asProviderError(body) ?? (res.status === 429 ? new ProviderError("Twelve Data rate limit (HTTP 429)", "rate_limited", 60_000) : null);
    if (err) {
      if (err.code === "rate_limited") this.opts.budget.block(err.retryAfterMs ?? 60_000);
      throw err;
    }
    if (!res.ok) throw new ProviderError(`Twelve Data HTTP ${res.status}`, res.status >= 500 ? "unavailable" : "unknown", 10_000);
    return body;
  }

  async fetchHistory(tf: Timeframe, req: HistoryRequest): Promise<HistoryResult> {
    const params: Record<string, string> = {
      symbol: this.symbol,
      interval: TWELVE_DATA_INTERVAL[tf],
      timezone: "UTC",
      order: "ASC",
      outputsize: String(Math.min(5000, Math.max(1, req.outputsize ?? 500))),
    };
    if (req.startMs !== undefined) params.start_date = fmtUtc(req.startMs);
    if (req.endMs !== undefined) params.end_date = fmtUtc(req.endMs);
    const body = await this.get("/time_series", params);
    const fetchedAt = this.now();
    const parsed = parseTimeSeries(body, tf, fetchedAt);
    return { ...parsed, source: `twelvedata-rest:${TWELVE_DATA_INTERVAL[tf]}`, fetchedAt };
  }

  async fetchQuote(): Promise<QuoteResult> {
    const body = await this.get("/quote", { symbol: this.symbol, timezone: "UTC" });
    return { ...parseQuote(body), source: "twelvedata-rest:quote" };
  }

  /** Latest price via REST, used as a fallback when the stream is down. */
  async fetchPrice(): Promise<number> {
    return parsePrice(await this.get("/price", { symbol: this.symbol }));
  }

  streamPrices(handlers: StreamHandlers): StreamHandle {
    const { heartbeatMs = 10_000, silenceTimeoutMs = 30_000 } = this.opts;
    const log = this.opts.log ?? (() => {});
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let heartbeat: NodeJS.Timeout | null = null;
    let watchdog: NodeJS.Timeout | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let lastFrameAt = 0;

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (watchdog) clearInterval(watchdog);
      heartbeat = watchdog = null;
    };

    const scheduleReconnect = (reason: string) => {
      cleanup();
      if (closed) return;
      // Exponential backoff with jitter, capped at 60s.
      const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)) * (0.75 + Math.random() * 0.5);
      attempt++;
      handlers.onStatus("reconnecting", `${reason}; retry in ${Math.round(delay / 1000)}s`);
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (closed) return;
      handlers.onStatus(attempt === 0 ? "connecting" : "reconnecting");
      const url = `${this.opts.wsUrl}?apikey=${encodeURIComponent(this.opts.apiKey)}`;
      const socket = this.opts.wsFactory ? this.opts.wsFactory(url) : new WebSocket(url, { handshakeTimeout: 15_000 });
      ws = socket;
      socket.on("open", () => {
        lastFrameAt = this.now();
        socket.send(JSON.stringify({ action: "subscribe", params: { symbols: this.symbol } }));
        heartbeat = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ action: "heartbeat" })), heartbeatMs);
        watchdog = setInterval(() => {
          if (this.now() - lastFrameAt > silenceTimeoutMs) {
            log("twelvedata ws silent; forcing reconnect");
            socket.terminate();
          }
        }, Math.min(5_000, silenceTimeoutMs));
      });
      socket.on("message", (data) => {
        const receivedAt = this.now();
        lastFrameAt = receivedAt;
        const msg = parseWsMessage(data.toString(), receivedAt);
        if (msg.type === "price") {
          if (msg.update.symbol === this.symbol) handlers.onPrice(msg.update);
        } else if (msg.type === "subscribe-status") {
          if (msg.ok) {
            attempt = 0;
            handlers.onStatus("connected");
          } else {
            handlers.onStatus("error", `subscription failed: ${JSON.stringify(msg.fails)}`);
          }
        }
      });
      socket.on("error", (err) => log("twelvedata ws error", err.message));
      socket.on("close", (code, reason) => {
        if (ws === socket) ws = null;
        if (closed) return;
        scheduleReconnect(`closed (${code}${reason.length ? ` ${reason.toString()}` : ""})`);
      });
    };

    connect();
    return {
      close: () => {
        closed = true;
        cleanup();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        ws?.close();
        handlers.onStatus("disconnected");
      },
    };
  }
}
