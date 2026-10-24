import { ProviderError } from "../adapter";

/**
 * Keeps REST usage under Binance's per-IP REQUEST_WEIGHT limit. Combines a
 * local sliding one-minute window with the server-reported
 * X-MBX-USED-WEIGHT-1M header, and stops at `safety` of the limit so other
 * clients on the same IP keep headroom. 429/418 responses block all calls
 * until their Retry-After passes.
 */
export class WeightBudget {
  private log: { t: number; w: number }[] = [];
  /** Last server-reported used weight and when it was reported. */
  serverUsed: { weight: number; at: number } | null = null;
  blockedUntil = 0;
  blockReason: string | null = null;

  constructor(
    public limitPerMinute: number,
    readonly safety = 0.8,
    private now: () => number = Date.now,
  ) {}

  private usedLocal(t: number) {
    this.log = this.log.filter((x) => t - x.t < 60_000);
    return this.log.reduce((s, x) => s + x.w, 0);
  }

  /** Server-side weight is per IP and resets each wall-clock minute. */
  private usedServer(t: number) {
    if (!this.serverUsed) return 0;
    return Math.floor(this.serverUsed.at / 60_000) === Math.floor(t / 60_000) ? this.serverUsed.weight : 0;
  }

  waitTime(weight: number): number {
    const t = this.now();
    if (t < this.blockedUntil) return this.blockedUntil - t;
    const cap = this.limitPerMinute * this.safety;
    const used = Math.max(this.usedLocal(t), this.usedServer(t));
    if (used + weight <= cap) return 0;
    // Wait for the next minute boundary (server window) or for local entries to age out.
    const nextMinute = 60_000 - (t % 60_000);
    const oldest = this.log[0];
    const localWait = oldest ? 60_000 - (t - oldest.t) : 0;
    return Math.max(50, Math.min(nextMinute, localWait || nextMinute));
  }

  take(weight: number): void {
    const wait = this.waitTime(weight);
    if (wait > 0) {
      const blocked = this.now() < this.blockedUntil ? this.blockReason : null;
      const why = blocked === "banned" ? "Binance IP ban (HTTP 418) in effect" : blocked === "rate_limited" ? "Binance rate limit (HTTP 429) in effect" : "local request-weight budget exhausted";
      throw new ProviderError(`${why}; retry in ${Math.ceil(wait / 1000)}s`, blocked === "banned" ? "banned" : "rate_limited", wait);
    }
    this.log.push({ t: this.now(), w: weight });
  }

  report(usedWeight: number) {
    this.serverUsed = { weight: usedWeight, at: this.now() };
  }

  block(ms: number, reason: "rate_limited" | "banned") {
    const until = this.now() + ms;
    if (until > this.blockedUntil) {
      this.blockedUntil = until;
      this.blockReason = reason;
    }
  }

  stats() {
    const t = this.now();
    return {
      limitPerMinute: this.limitPerMinute,
      safetyCap: Math.floor(this.limitPerMinute * this.safety),
      usedLocal: this.usedLocal(t),
      usedServer: this.usedServer(t),
      blockedForMs: Math.max(0, this.blockedUntil - t),
      blockReason: t < this.blockedUntil ? this.blockReason : null,
    };
  }
}
