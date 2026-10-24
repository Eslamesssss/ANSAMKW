import { ProviderError } from "../adapter";

/**
 * Tracks Twelve Data API credits against the plan's per-minute and per-day
 * limits (sliding minute window, UTC day). Requests that would exceed the
 * budget are refused locally rather than sent and rejected upstream.
 */
export class CreditBudget {
  private minuteLog: number[] = [];
  private day = "";
  private usedToday = 0;
  /** Provider-reported remaining credits (from response headers), if known. */
  providerRemaining: number | null = null;
  blockedUntil = 0;

  constructor(
    readonly perMinute: number,
    readonly perDay: number,
    private now: () => number = Date.now,
  ) {}

  private roll() {
    const t = this.now();
    const d = new Date(t).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.usedToday = 0;
    }
    this.minuteLog = this.minuteLog.filter((x) => t - x < 60_000);
  }

  /** Milliseconds until `credits` could be spent, or null if today's budget can't cover it. */
  waitTime(credits = 1): number | null {
    this.roll();
    const t = this.now();
    if (this.perDay > 0 && this.usedToday + credits > this.perDay) return null;
    if (t < this.blockedUntil) return this.blockedUntil - t;
    if (this.perMinute > 0 && this.minuteLog.length + credits > this.perMinute) {
      const oldest = this.minuteLog[this.minuteLog.length + credits - this.perMinute - 1] ?? this.minuteLog[0]!;
      return Math.max(0, 60_000 - (t - oldest)) + 50;
    }
    return 0;
  }

  /** Reserve credits or throw `budget_exhausted` / `rate_limited`. */
  take(credits = 1): void {
    const w = this.waitTime(credits);
    if (w === null) throw new ProviderError("Daily Twelve Data credit budget exhausted", "budget_exhausted");
    if (w > 0) throw new ProviderError(`Per-minute credit budget exhausted; retry in ${Math.ceil(w / 1000)}s`, "rate_limited", w);
    const t = this.now();
    for (let i = 0; i < credits; i++) this.minuteLog.push(t);
    this.usedToday += credits;
  }

  /** Upstream said we are rate limited: stop sending for a while. */
  block(ms: number) {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
  }

  stats() {
    this.roll();
    return { usedLastMinute: this.minuteLog.length, perMinute: this.perMinute, usedToday: this.usedToday, perDay: this.perDay, providerRemaining: this.providerRemaining };
  }
}
