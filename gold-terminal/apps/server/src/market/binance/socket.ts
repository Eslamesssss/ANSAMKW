import WebSocket from "ws";
import type { FeedConnection } from "@gold/core";

export interface ManagedSocketOptions {
  url: string;
  name: string;
  onMessage: (raw: string, receivedAt: number) => void;
  onStatus: (status: FeedConnection, detail?: string) => void;
  now: () => number;
  wsFactory?: (url: string) => WebSocket;
  /** Reconnect when no frame arrives for this long. */
  silenceTimeoutMs: number;
  /** Binance closes connections after 24h; reconnect proactively before that. */
  maxConnectionMs: number;
  log?: (msg: string, detail?: unknown) => void;
}

/**
 * One WebSocket connection with exponential-backoff reconnects (with jitter),
 * a silence watchdog and proactive rotation before the exchange's 24h limit.
 * Binance sends ping frames; the `ws` client answers them with pongs
 * automatically.
 */
export class ManagedSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastFrameAt = 0;
  private openedAt = 0;
  status: FeedConnection = "connecting";
  reconnects = 0;

  constructor(private o: ManagedSocketOptions) {}

  start() {
    this.connect();
    return this;
  }

  private setStatus(s: FeedConnection, detail?: string) {
    this.status = s;
    this.o.onStatus(s, detail);
  }

  private connect() {
    if (this.closed) return;
    this.setStatus(this.attempt === 0 && this.reconnects === 0 ? "connecting" : "reconnecting");
    const socket = this.o.wsFactory ? this.o.wsFactory(this.o.url) : new WebSocket(this.o.url, { handshakeTimeout: 15_000 });
    this.ws = socket;
    socket.on("open", () => {
      this.openedAt = this.lastFrameAt = this.o.now();
      this.attempt = 0;
      this.setStatus("connected");
      this.watchdog = setInterval(() => {
        const t = this.o.now();
        if (t - this.lastFrameAt > this.o.silenceTimeoutMs) {
          this.o.log?.(`${this.o.name} silent for ${t - this.lastFrameAt}ms; reconnecting`);
          socket.terminate();
        } else if (t - this.openedAt > this.o.maxConnectionMs) {
          this.o.log?.(`${this.o.name} rotating before the 24h connection limit`);
          socket.close(1000, "rotate");
        }
      }, Math.min(2_000, this.o.silenceTimeoutMs));
    });
    socket.on("message", (data) => {
      const t = this.o.now();
      this.lastFrameAt = t;
      this.o.onMessage(data.toString(), t);
    });
    socket.on("ping", () => {
      this.lastFrameAt = this.o.now();
    });
    socket.on("error", (err) => this.o.log?.(`${this.o.name} error`, err.message));
    socket.on("close", (code, reason) => {
      if (this.watchdog) clearInterval(this.watchdog);
      this.watchdog = null;
      if (this.ws === socket) this.ws = null;
      if (this.closed) return;
      const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.attempt, 6)) * (0.75 + Math.random() * 0.5);
      this.attempt++;
      this.reconnects++;
      this.setStatus("reconnecting", `${this.o.name} closed (${code}${reason.length ? ` ${reason.toString()}` : ""}); retry in ${Math.round(delay / 1000)}s`);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  close() {
    this.closed = true;
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }
}

/** Combine per-connection statuses into one feed status (worst wins). */
export function combineStatus(statuses: FeedConnection[]): FeedConnection {
  const order: FeedConnection[] = ["error", "no_credentials", "disconnected", "reconnecting", "connecting", "connected"];
  return order.find((s) => statuses.includes(s)) ?? "connecting";
}
