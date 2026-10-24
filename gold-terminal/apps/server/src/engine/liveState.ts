import type { FeedConnection, Freshness, PriceUpdate } from "@gold/core";

/**
 * Tracks the streamed price and feed health. Messages are counted separately
 * from distinct updates: a provider may resend the same price, and an update
 * is a snapshot of the current price rather than a trade, so no tick volume is
 * derived from message counts.
 */
export class LivePriceState {
  last: PriceUpdate | null = null;
  connection: FeedConnection = "connecting";
  connectionDetail: string | null = null;
  connectionChangedAt = 0;
  messages = 0;
  distinct = 0;
  duplicates = 0;
  outOfOrder = 0;
  /** EWMA of the interval between distinct updates (ms). */
  avgIntervalMs: number | null = null;
  /** EWMA of receive time minus provider time (ms). Includes clock skew; providers send 1s resolution. */
  avgLatencyMs: number | null = null;

  constructor(
    private delayedAfterMs: number,
    private staleAfterMs: number,
  ) {}

  /** Returns true if the update is new information. */
  accept(u: PriceUpdate): boolean {
    this.messages++;
    const prev = this.last;
    if (prev && u.providerTime < prev.providerTime) {
      this.outOfOrder++;
      return false;
    }
    if (prev && u.providerTime === prev.providerTime && u.price === prev.price) {
      this.duplicates++;
      return false;
    }
    if (prev) {
      const dt = u.receivedAt - prev.receivedAt;
      this.avgIntervalMs = this.avgIntervalMs === null ? dt : this.avgIntervalMs * 0.9 + dt * 0.1;
    }
    if (u.source.endsWith("-ws")) {
      const lat = Math.max(0, u.receivedAt - u.providerTime);
      this.avgLatencyMs = this.avgLatencyMs === null ? lat : this.avgLatencyMs * 0.9 + lat * 0.1;
    }
    this.distinct++;
    this.last = u;
    return true;
  }

  setConnection(c: FeedConnection, detail: string | null, now: number) {
    if (c !== this.connection || detail !== this.connectionDetail) this.connectionChangedAt = now;
    this.connection = c;
    this.connectionDetail = detail;
  }

  freshness(now: number, marketOpen: boolean): Freshness {
    if (!this.last) return marketOpen ? "no_data" : "market_closed";
    const age = now - this.last.receivedAt;
    if (!marketOpen && age > this.delayedAfterMs) return "market_closed";
    if (age > this.staleAfterMs) return "stale";
    if (age > this.delayedAfterMs) return "delayed";
    return "fresh";
  }

  ageMs(now: number): number | null {
    return this.last ? now - this.last.receivedAt : null;
  }
}
