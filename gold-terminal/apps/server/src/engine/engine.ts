import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  aggregateCandles,
  analyzeStructure,
  applyCooldown,
  bucketEnd,
  bucketStart,
  classifyTrend,
  computeOutcome,
  diffCandles,
  ema,
  evaluateRules,
  findGaps,
  marketSnapshotSchema,
  MINUTE,
  nearestLevels,
  OUTCOME_HORIZONS_MIN,
  TIMEFRAME_MS,
  TIMEFRAMES,
  type AlertRule,
  type Candle,
  type CloseContext,
  type MarketSnapshot,
  type PriceUpdate,
  type Reference,
  type StructureEvent,
  type StructureResult,
  type Timeframe,
  type TimeframeSnapshot,
  type TrendReading,
} from "@gold/core";
import type { Config } from "../config";
import type { Repository, StoredAlertEvent } from "../db/repository";
import { ContractValidationError, ProviderError, type KlineUpdate, type MarketDataAdapter, type StreamHandle } from "../market/adapter";
import { LivePriceState } from "./liveState";
import { MarketState } from "./marketState";

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

interface TfState {
  closed: Candle[];
  forming: Candle | null;
  trend: TrendReading;
  structure: StructureResult;
  /** Open time of the newest bar whose close has been processed for signals. */
  lastProcessed: number | null;
  initialised: boolean;
}

interface PendingConfirm {
  tf: Timeframe;
  openTime: number;
  derived: Candle | null;
  attempts: number;
  nextAttemptAt: number;
}

export interface MeaningfulEvent {
  kind: "structure" | "trend_change";
  timeframe: Timeframe;
  id: string;
  description: string;
}

/** Keep enough 1m history in memory for 24h outcome horizons. */
const MEMORY_BARS = 3000;

export class MarketEngine extends EventEmitter {
  readonly tf = new Map<Timeframe, TfState>();
  readonly live: LivePriceState;
  private stream: StreamHandle | null = null;
  private timers: NodeJS.Timeout[] = [];
  private nextReconcileAt = 0;
  private lastReconcileAt = 0;
  private fetchedSinceClose = false;
  private pending = new Map<string, PendingConfirm>();
  private rules: AlertRule[] = [];
  private busy = false;
  private lastPollAt = 0;
  private ingestLock: Promise<unknown> = Promise.resolve();
  private due = { openInterest: 0, contract: 0, funding: 0, constituents: 0, clock: 0, sync: 0 };
  private hasConnectedOnce = false;
  readonly dataQuality = new Map<string, string>();
  readonly market: MarketState;
  /** Set when the feed cannot run (e.g. contract validation failed). */
  startupProblem: string | null = null;
  started = false;

  constructor(
    readonly config: Config,
    readonly adapter: MarketDataAdapter,
    readonly repo: Repository,
    readonly now: () => number,
    readonly log: Logger,
  ) {
    super();
    this.live = new LivePriceState(config.PRICE_DELAYED_AFTER_MS, config.PRICE_STALE_AFTER_MS);
    this.market = new MarketState(adapter.characteristics.streams);
    for (const tf of TIMEFRAMES) {
      this.tf.set(tf, { closed: [], forming: null, trend: classifyTrend(tf, []), structure: analyzeStructure(tf, []), lastProcessed: null, initialised: false });
    }
  }

  get origin() {
    return this.adapter.origin;
  }
  get symbol() {
    return this.adapter.symbol;
  }

  /**
   * Whether the contract is trading, from the exchange's own status in
   * exchangeInfo. Binance TradFi perpetuals trade outside underlying-market
   * hours; that difference is reported separately as the index regime.
   */
  session(): { open: boolean; reason: string } {
    const c = this.market.contract;
    if (!c) return { open: false, reason: "contract_unverified" };
    if (c.status === "TRADING") return { open: true, reason: "trading" };
    return { open: false, reason: `exchange_status_${c.status.toLowerCase()}` };
  }

  // ---------------------------------------------------------------- lifecycle

  /** `timers: false` lets tests drive `tick()` and `evaluateOutcomes()` manually. */
  async start(opts: { timers?: boolean } = {}): Promise<void> {
    this.rules = await this.repo.listRules();
    await this.repo.recordFeedEvent(this.adapter.id, "engine_start", { origin: this.origin, symbol: this.symbol });
    if (!(await this.verifyContract(true))) return;
    for (const tf of TIMEFRAMES) {
      const stored = await this.repo.loadCandles(this.origin, this.symbol, tf, MEMORY_BARS);
      if (stored.length) this.tf.get(tf)!.closed = stored;
    }
    await this.loadHistory();
    await this.syncMarket(true);
    this.stream = this.adapter.streamMarket({
      onPrice: (u) => this.onPrice(u),
      onKline: (k) => this.onKline(k),
      onBookTop: (b) => {
        this.market.bookTop = b;
      },
      onDepth: (d) => {
        this.market.depth = d;
      },
      onMark: (m) => this.market.onMark(m),
      onTicker: (t) => {
        this.market.ticker = t;
      },
      onStreamMessage: (kind, at) => this.market.touchStream(kind, at),
      onStatus: (s, d) => {
        const wasConnected = this.live.connection === "connected";
        this.live.setConnection(s, d ?? null, this.now());
        // After any reconnect, resynchronise book/mark/ticker/OI over REST and backfill candles.
        if (s === "connected" && !wasConnected) {
          if (this.hasConnectedOnce) {
            this.due.sync = 0;
            this.nextReconcileAt = 0;
          }
          this.hasConnectedOnce = true;
        }
        this.emit("status", this.status());
        void this.repo.recordFeedEvent(this.adapter.id, `ws_${s}`, d ?? null).catch(() => {});
      },
    });
    if (opts.timers !== false) {
      this.timers.push(setInterval(() => void this.tick(), 1000));
      this.timers.push(setInterval(() => void this.evaluateOutcomes(), 60_000));
    }
    this.started = true;
  }

  /**
   * Read the contract from the exchange and validate it. A validation failure
   * stops the feed: the app never substitutes another instrument.
   */
  private async verifyContract(initial: boolean): Promise<boolean> {
    for (let attempt = 0; attempt < (initial ? 5 : 1); attempt++) {
      try {
        const spec = await this.adapter.loadContract();
        const prev = this.market.contract;
        this.market.contract = spec;
        this.market.contractCheckedAt = this.now();
        this.dataQuality.delete("contract");
        if (prev && prev.status !== spec.status) {
          this.log.warn({ from: prev.status, to: spec.status }, "contract status changed");
          void this.repo.recordFeedEvent(this.adapter.id, "contract_status", { from: prev.status, to: spec.status }).catch(() => {});
        }
        if (spec.status !== "TRADING") this.dataQuality.set("contract", `${spec.symbol} exchange status is ${spec.status}`);
        this.due.contract = this.now() + this.config.CONTRACT_REFRESH_SEC * 1000;
        return true;
      } catch (err) {
        if (err instanceof ContractValidationError) {
          this.startupProblem = `${err.message}. The feed is stopped; no other instrument is substituted.`;
          this.market.contract = null;
          this.dataQuality.set("contract", this.startupProblem);
          this.log.error({ problems: err.problems }, "contract validation failed");
          this.emit("status", this.status());
          return false;
        }
        const e = err as ProviderError;
        this.dataQuality.set("contract", `contract check failed: ${e.message}`);
        this.log.warn({ err: e.message }, "exchangeInfo fetch failed");
        if (!initial) {
          this.due.contract = this.now() + 60_000;
          return this.market.contract !== null;
        }
        if (e.code === "restricted" || e.code === "banned") break;
        await sleep(Math.min(e.retryAfterMs ?? 2000, 30_000));
      }
    }
    this.startupProblem = `Could not read the XAUUSDT contract from Binance: ${this.dataQuality.get("contract") ?? "unknown error"}`;
    this.emit("status", this.status());
    return false;
  }

  /** REST synchronisation of book, mark/index/funding, 24h ticker, open interest and slower reference data. */
  private async syncMarket(initial = false) {
    const now = this.now();
    try {
      const s = await this.adapter.fetchMarketSync();
      if (s.bookTop) this.market.bookTop = s.bookTop;
      if (s.depth) this.market.depth = s.depth;
      if (s.mark) this.market.onMark(s.mark);
      if (s.ticker) this.market.ticker = s.ticker;
      if (s.openInterest) this.market.addOpenInterest([s.openInterest]);
      this.dataQuality.delete("sync");
    } catch (err) {
      this.dataQuality.set("sync", `market sync failed: ${(err as Error).message}`);
    }
    this.due.sync = Number.POSITIVE_INFINITY; // only re-run after a reconnect
    if (initial) {
      await this.adapter.fetchOpenInterestHistory?.().then((h) => this.market.addOpenInterest(h)).catch(() => {});
      this.due.openInterest = now + this.config.OPEN_INTEREST_POLL_SEC * 1000;
      await this.refreshSlow("funding");
      await this.refreshSlow("constituents");
      await this.refreshSlow("clock");
    }
  }

  private async refreshSlow(which: "funding" | "constituents" | "clock") {
    const now = this.now();
    try {
      if (which === "funding" && this.adapter.fetchFundingSchedule) this.market.funding = await this.adapter.fetchFundingSchedule();
      if (which === "constituents" && this.adapter.fetchIndexConstituents) this.market.constituents = await this.adapter.fetchIndexConstituents();
      if (which === "clock" && this.adapter.measureClockOffset) {
        const off = await this.adapter.measureClockOffset();
        this.market.clockOffsetMs = off;
        this.live.clockOffsetMs = off;
        if (Math.abs(off) > 1000) this.dataQuality.set("clock", `local clock differs from Binance by ${Math.round(off)}ms; latency figures are corrected for it`);
        else this.dataQuality.delete("clock");
      }
    } catch (err) {
      this.log.warn({ which, err: (err as Error).message }, "reference data refresh failed");
    }
    const every = { funding: 30 * MINUTE, constituents: 15 * MINUTE, clock: 10 * MINUTE }[which];
    this.due[which] = now + every;
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.stream?.close();
    this.stream = null;
  }

  async reloadRules() {
    this.rules = await this.repo.listRules();
  }

  /** Initial history for each timeframe, sized so EMA200 is fully warmed up. */
  private async loadHistory() {
    for (const tf of TIMEFRAMES) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await this.adapter.fetchHistory(tf, { outputsize: this.config.HISTORY_BARS });
          await this.ingestClosed(tf, res.closed, res.source, { silent: true });
          const st = this.tf.get(tf)!;
          st.forming = res.forming;
          st.initialised = true;
          if (res.rejected) this.dataQuality.set(`rejected:${tf}`, `${res.rejected} malformed ${tf} rows rejected`);
          if (res.closed.length < this.config.HISTORY_BARS * 0.6) this.dataQuality.set(`short:${tf}`, `only ${res.closed.length} ${tf} bars from provider`);
          else this.dataQuality.delete(`short:${tf}`);
          break;
        } catch (err) {
          const e = err as ProviderError;
          this.log.warn({ tf, err: e.message }, "history fetch failed");
          this.dataQuality.set(`history:${tf}`, `history for ${tf} unavailable: ${e.message}`);
          if (e.code === "auth" || e.code === "bad_request" || e.code === "budget_exhausted" || e.code === "restricted") break;
          await sleep(Math.min(e.retryAfterMs ?? 2000, 65_000));
        }
      }
      if (this.tf.get(tf)!.initialised) this.dataQuality.delete(`history:${tf}`);
    }
  }

  // ------------------------------------------------------------------- prices

  onPrice(u: PriceUpdate) {
    if (u.origin !== this.origin) return; // never mix fixture and live data
    if (u.symbol !== this.symbol) return; // never mix instruments
    if (!this.live.accept(u)) return;
    // With a kline stream the exchange's own forming bars are used; otherwise build them from trades (display only).
    const buildFromTrades = this.adapter.characteristics.streams.kline === undefined;
    for (const tf of buildFromTrades ? TIMEFRAMES : []) {
      const st = this.tf.get(tf)!;
      const open = bucketStart(u.providerTime, tf);
      const lastClosed = st.closed[st.closed.length - 1];
      if (lastClosed && open <= lastClosed.openTime) continue;
      if (!st.forming || st.forming.openTime !== open) {
        st.forming = { openTime: open, open: u.price, high: u.price, low: u.price, close: u.price, volume: null, status: "forming" };
      } else {
        st.forming.high = Math.max(st.forming.high, u.price);
        st.forming.low = Math.min(st.forming.low, u.price);
        st.forming.close = u.price;
      }
    }
    this.emit("price", this.priceView());
  }

  /**
   * Exchange kline stream. A forming kline updates the provisional bar; a
   * final kline (x=true) is the exchange's confirmed bar and is ingested at
   * once. REST reconciliation later verifies it and records any revision.
   */
  onKline(k: KlineUpdate) {
    const st = this.tf.get(k.tf)!;
    const lastClosed = st.closed[st.closed.length - 1];
    if (!st.initialised || (lastClosed && k.candle.openTime <= lastClosed.openTime)) return;
    if (!k.closed) {
      st.forming = k.candle;
      return;
    }
    void this.ingestClosed(k.tf, [{ ...k.candle, status: "confirmed" }], "binance-ws:kline").catch((err) => this.log.warn({ err: (err as Error).message }, "kline ingest failed"));
    // Cross-check higher timeframes over REST (1m is reconciled every minute anyway); differences become revisions.
    if (k.tf !== "1m" && this.config.NATIVE_CONFIRM_TIMEFRAMES.includes(k.tf)) {
      const key = `${k.tf}|${k.candle.openTime}`;
      if (!this.pending.has(key)) this.pending.set(key, { tf: k.tf, openTime: k.candle.openTime, derived: null, attempts: 0, nextAttemptAt: this.now() + this.config.RECONCILE_DELAY_SEC * 1000 });
    }
  }

  // --------------------------------------------------------------- scheduler

  async tick() {
    const now = this.now();
    this.emit("heartbeat", { now });
    if (this.busy) return;
    this.busy = true;
    try {
      if (now >= this.due.contract) await this.verifyContract(false);
      if (!this.market.contract) return;
      if (now >= this.due.sync) await this.syncMarket();
      await this.maybePollPrice(now);
      if (now >= this.nextReconcileAt) await this.reconcileOneMinute(now);
      await this.processPending(now);
      if (now >= this.due.openInterest) {
        this.due.openInterest = now + this.config.OPEN_INTEREST_POLL_SEC * 1000;
        await this.adapter.fetchOpenInterest().then((o) => this.market.addOpenInterest([o])).catch((err) => this.log.warn({ err: (err as Error).message }, "open interest poll failed"));
      }
      for (const which of ["funding", "constituents", "clock"] as const) if (now >= this.due[which]) await this.refreshSlow(which);
    } catch (err) {
      this.log.error({ err: (err as Error).message }, "tick failed");
    } finally {
      this.busy = false;
    }
  }

  private async maybePollPrice(now: number) {
    const interval = this.config.PRICE_POLL_INTERVAL_SEC * 1000;
    if (!interval || this.live.connection === "connected" || now - this.lastPollAt < interval) return;
    if (!this.session().open) return;
    if (!this.adapter.fetchPrice) return;
    this.lastPollAt = now;
    try {
      const { price, time } = await this.adapter.fetchPrice();
      this.onPrice({ symbol: this.symbol, price, providerTime: time, receivedAt: this.now(), bid: null, ask: null, priceKind: "last", source: `${this.adapter.id}-rest-price`, origin: this.origin });
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, "price poll failed");
    }
  }

  private scheduleNextReconcile(now: number, retryMs?: number) {
    if (retryMs !== undefined) {
      this.nextReconcileAt = now + retryMs;
      return;
    }
    const nextBoundary = bucketStart(now, "1m") + MINUTE + this.config.RECONCILE_DELAY_SEC * 1000;
    this.nextReconcileAt = Math.max(nextBoundary, this.lastReconcileAt + this.config.RECONCILE_INTERVAL_SEC * 1000);
  }

  /** Fetch recently closed 1m bars from the provider and roll them up. */
  private async reconcileOneMinute(now: number) {
    const st = this.tf.get("1m")!;
    const session = this.session();
    const last = st.closed[st.closed.length - 1];
    if (!session.open) {
      // One fetch after the close picks up the final bars; then stay quiet.
      if (this.fetchedSinceClose) return this.scheduleNextReconcile(now);
    } else {
      this.fetchedSinceClose = false;
    }
    const missing = last ? Math.ceil((now - bucketEnd(last.openTime, "1m")) / MINUTE) : this.config.HISTORY_BARS;
    const outputsize = Math.min(5000, Math.max(3, missing + 2));
    try {
      this.lastReconcileAt = now;
      const res = await this.adapter.fetchHistory("1m", { outputsize });
      if (!session.open) this.fetchedSinceClose = true;
      st.forming = res.forming ?? st.forming;
      await this.ingestClosed("1m", res.closed, res.source);
      await this.detectGaps("1m");
      this.rollUp(now);
      this.dataQuality.delete("reconcile:1m");
      // Provider can lag behind the clock: if the just-closed minute is absent during an open session, retry soon.
      const expected = bucketStart(now, "1m") - MINUTE;
      const newest = st.closed[st.closed.length - 1]?.openTime ?? 0;
      if (session.open && newest < expected && now - bucketEnd(expected, "1m") < 30_000) return this.scheduleNextReconcile(now, 5_000);
      this.scheduleNextReconcile(now);
    } catch (err) {
      const e = err as ProviderError;
      this.dataQuality.set("reconcile:1m", `1m reconciliation delayed: ${e.message}`);
      this.log.warn({ err: e.message, code: e.code }, "1m reconcile failed");
      this.scheduleNextReconcile(now, e.code === "budget_exhausted" ? 15 * MINUTE : Math.max(5_000, e.retryAfterMs ?? 15_000));
    }
  }

  /** Close higher-timeframe buckets from confirmed 1m bars, queueing native confirmation where configured. */
  private rollUp(now: number) {
    const one = this.tf.get("1m")!.closed;
    if (!one.length) return;
    for (const tf of TIMEFRAMES) {
      if (tf === "1m") continue;
      const st = this.tf.get(tf)!;
      if (!st.initialised) continue;
      const lastClosed = st.closed[st.closed.length - 1]?.openTime ?? -Infinity;
      const currentBucket = bucketStart(now, tf);
      // Buckets newer than the last closed bar whose end has passed.
      for (let open = lastClosed === -Infinity ? currentBucket - TIMEFRAME_MS[tf] : lastClosed + TIMEFRAME_MS[tf]; open < currentBucket; open += TIMEFRAME_MS[tf]) {
        const key = `${tf}|${open}`;
        if (this.pending.has(key)) continue;
        const end = bucketEnd(open, tf);
        const covered = one[0]!.openTime <= open;
        const parts = one.filter((c) => c.openTime >= open && c.openTime < end);
        const derived = covered && parts.length ? aggregateCandles(parts, tf, now)[0] ?? null : null;
        if (!parts.length && !this.session().open) continue; // contract not trading: no bar expected
        this.pending.set(key, { tf, openTime: open, derived, attempts: 0, nextAttemptAt: now });
      }
    }
  }

  private async processPending(now: number) {
    for (const [key, p] of [...this.pending.entries()].sort((a, b) => a[1].openTime - b[1].openTime)) {
      if (now < p.nextAttemptAt) continue;
      // Native confirmation when configured, or when 1m coverage could not produce a derived bar.
      const needsNative = this.config.NATIVE_CONFIRM_TIMEFRAMES.includes(p.tf) || !p.derived;
      if (!needsNative && p.derived) {
        await this.ingestClosed(p.tf, [p.derived], "derived:1m");
        this.pending.delete(key);
        continue;
      }
      try {
        p.attempts++;
        const res = await this.adapter.fetchHistory(p.tf, { outputsize: 3 });
        await this.ingestClosed(p.tf, res.closed, res.source);
        this.tf.get(p.tf)!.forming = res.forming ?? this.tf.get(p.tf)!.forming;
        if (res.closed.some((c) => c.openTime === p.openTime) || res.closed.some((c) => c.openTime > p.openTime)) {
          this.pending.delete(key);
        } else {
          p.nextAttemptAt = now + 10_000;
        }
      } catch (err) {
        const e = err as ProviderError;
        p.nextAttemptAt = now + Math.max(10_000, e.retryAfterMs ?? 30_000);
        this.log.warn({ tf: p.tf, err: e.message }, "native confirmation failed");
      }
      // After repeated failures fall back to the 1m-derived bar (real provider data, aggregated).
      if (this.pending.has(key) && p.attempts >= 3 && p.derived) {
        await this.ingestClosed(p.tf, [p.derived], "derived:1m");
        this.dataQuality.set(`derived:${p.tf}`, `${p.tf} bar ${new Date(p.openTime).toISOString()} derived from 1m (native confirmation unavailable)`);
        this.pending.delete(key);
      }
      return; // at most one provider call per tick
    }
  }

  private async detectGaps(tf: Timeframe) {
    const st = this.tf.get(tf)!;
    const recent = st.closed.slice(-600);
    for (const g of findGaps(recent, TIMEFRAME_MS[tf])) {
      if (!this.session().open) continue;
      const inserted = await this.repo.recordGap(this.origin, this.symbol, tf, g.from, g.to);
      if (inserted) {
        this.log.warn({ tf, from: new Date(g.from).toISOString(), to: new Date(g.to).toISOString() }, "data gap detected");
        this.emit("gap", { timeframe: tf, from: g.from, to: g.to });
        // One targeted backfill attempt; the provider may simply have no quotes for that window.
        try {
          const res = await this.adapter.fetchHistory(tf, { startMs: g.from, endMs: g.to - 1 });
          if (res.closed.length) {
            await this.ingestClosed(tf, res.closed, res.source, { silent: true });
            await this.repo.resolveGaps(this.origin, this.symbol, tf, res.closed.map((c) => c.openTime));
          }
        } catch {
          /* recorded; retried implicitly by later reconciliation windows */
        }
      }
    }
  }

  // ------------------------------------------------------------- ingestion

  /**
   * Merge provider (or 1m-derived) closed candles. Provider-confirmed bars
   * overwrite stored ones; any correction is recorded as a revision. New bars
   * beyond the last processed one are evaluated for signals in order.
   */
  async ingestClosed(tf: Timeframe, incoming: Candle[], source: string, opts: { silent?: boolean } = {}) {
    // Serialise: WS kline closes and REST reconciliation can arrive together.
    const run = this.ingestLock.then(() => this.ingestClosedNow(tf, incoming, source, opts));
    this.ingestLock = run.catch(() => {});
    return run;
  }

  private async ingestClosedNow(tf: Timeframe, incoming: Candle[], source: string, opts: { silent?: boolean }) {
    if (!incoming.length) return;
    const st = this.tf.get(tf)!;
    const now = this.now();
    const fresh = incoming.filter((c) => now >= bucketEnd(c.openTime, tf));
    if (!fresh.length) return;
    const from = fresh[0]!.openTime;
    const to = fresh[fresh.length - 1]!.openTime;
    const localWindow = st.closed.filter((c) => c.openTime >= from && c.openTime <= to);
    const diffs = diffCandles(localWindow, fresh, 1e-6).filter((d) => d.kind !== "missing_provider");
    const changed = diffs.filter((d) => d.kind === "changed");
    // A derived bar never overwrites a provider-confirmed one.
    const accept = fresh.filter((c) => {
      const existing = localWindow.find((l) => l.openTime === c.openTime);
      return !(existing && existing.status === "confirmed" && c.status === "derived");
    });
    if (changed.length && !opts.silent) {
      await this.repo.recordRevisions(this.origin, this.symbol, tf, changed);
      this.emit("revision", { timeframe: tf, count: changed.length });
    }
    const byTime = new Map(st.closed.map((c) => [c.openTime, c]));
    for (const c of accept) byTime.set(c.openTime, c);
    st.closed = [...byTime.values()].sort((a, b) => a.openTime - b.openTime).slice(-MEMORY_BARS);
    if (st.forming && byTime.has(st.forming.openTime)) st.forming = null;
    await this.repo.upsertCandles(this.origin, this.symbol, tf, accept.map((c) => ({ ...c, source })));

    if (opts.silent || st.lastProcessed === null) {
      // History load: compute state without firing signals for past bars.
      this.recompute(tf);
      st.lastProcessed = st.closed[st.closed.length - 1]?.openTime ?? null;
      this.emit("candles", { timeframe: tf });
      return;
    }
    if (changed.length && changed.some((d) => d.openTime <= st.lastProcessed!)) this.recompute(tf);
    const newBars = st.closed.filter((c) => c.openTime > st.lastProcessed!);
    for (const candle of newBars) await this.processClose(tf, candle);
    this.emit("candles", { timeframe: tf });
  }

  private window(tf: Timeframe, upTo?: number): Candle[] {
    const all = this.tf.get(tf)!.closed;
    const idx = upTo === undefined ? all.length : all.findIndex((c) => c.openTime > upTo);
    const end = idx === -1 ? all.length : idx;
    return all.slice(Math.max(0, end - this.config.HISTORY_BARS), end);
  }

  private recompute(tf: Timeframe) {
    const st = this.tf.get(tf)!;
    const w = this.window(tf);
    st.trend = classifyTrend(tf, w);
    st.structure = analyzeStructure(tf, w);
  }

  /** Signals for one newly confirmed close. */
  private async processClose(tf: Timeframe, candle: Candle) {
    const st = this.tf.get(tf)!;
    const trendBefore = st.trend.state;
    const prev = st.closed[st.closed.findIndex((c) => c.openTime === candle.openTime) - 1] ?? null;
    this.recompute(tf);
    st.lastProcessed = candle.openTime;
    const events = st.structure.events.filter((e) => e.openTime === candle.openTime);
    const ctx: CloseContext = { timeframe: tf, candle, prevCandle: prev, trendBefore, trendAfter: st.trend.state, events };
    const late = this.now() - bucketEnd(candle.openTime, tf) > Math.max(2 * TIMEFRAME_MS[tf], 5 * MINUTE);
    this.emit("close", { timeframe: tf, candle, events, trend: st.trend, late });

    const meaningful: MeaningfulEvent[] = [];
    if (this.config.ANALYST_TRIGGER_TIMEFRAMES.includes(tf) && !late) {
      for (const e of events) if (e.kind === "bos" || e.kind === "choch") meaningful.push({ kind: "structure", timeframe: tf, id: e.id, description: `${tf} ${e.kind} ${e.direction}` });
      if (trendBefore !== st.trend.state && trendBefore !== "insufficient_data" && st.trend.state !== "insufficient_data") {
        meaningful.push({ kind: "trend_change", timeframe: tf, id: `${tf}:trend:${candle.openTime}`, description: `${tf} trend ${trendBefore}→${st.trend.state}` });
      }
    }

    await this.fireAlerts(ctx, late);
    if (meaningful.length) this.emit("meaningful", meaningful);
  }

  private async fireAlerts(ctx: CloseContext, late: boolean) {
    const candidates = evaluateRules(this.rules, ctx);
    if (!candidates.length) return;
    const lastFired = await this.repo.lastFiredByRule();
    const kept = applyCooldown(candidates, this.rules, lastFired, this.now());
    if (!kept.length) return;
    const snapshot = await this.persistSnapshot(this.buildSnapshot({ kind: "event", eventIds: kept.map((k) => k.dedupeKey) }));
    for (const c of kept) {
      const event: StoredAlertEvent = {
        id: randomUUID(),
        ruleId: c.ruleId,
        ruleType: c.ruleType,
        dedupeKey: c.dedupeKey,
        symbol: this.symbol,
        timeframe: c.timeframe,
        candleOpenTime: c.candleOpenTime,
        triggeredAt: this.now(),
        price: c.price,
        title: c.title,
        detail: { ...c.detail, late, candleCloseTime: new Date(bucketEnd(c.candleOpenTime, c.timeframe)).toISOString() },
        snapshotId: snapshot.id,
        dataOrigin: this.origin,
        acknowledgedAt: null,
      };
      if (await this.repo.insertAlertEvent(event)) this.emit("alert", event);
    }
  }

  // ---------------------------------------------------------------- outcomes

  async evaluateOutcomes() {
    const now = this.now();
    const one = this.tf.get("1m")!.closed;
    const alerts = await this.repo.alertsNeedingOutcomes(now - 3 * 24 * 60 * MINUTE);
    for (const a of alerts) {
      if (a.dataOrigin !== this.origin) continue;
      const start = bucketEnd(a.candleOpenTime, a.timeframe);
      for (const h of OUTCOME_HORIZONS_MIN) {
        const o = computeOutcome(a.price, start, h, one, now);
        if (o.status === "pending") continue;
        if (o.status === "no_data" && one.length && one[0]!.openTime > start) continue; // outside memory window
        await this.repo.upsertOutcome({ ...o, alertId: a.id, evaluatedAt: now });
      }
    }
  }

  // ---------------------------------------------------------------- views

  /** Feed-level activity: the latest message on any market stream (or the last trade). */
  private activityAt(): number | null {
    const a = this.market.lastActivity();
    const t = this.live.last?.receivedAt ?? null;
    return a === null ? t : t === null ? a : Math.max(a, t);
  }

  priceView() {
    const now = this.now();
    const session = this.session();
    const u = this.live.last;
    const book = this.market.bookTop;
    const sp = this.market.spread();
    const tk = this.market.ticker;
    const activity = this.activityAt();
    return {
      symbol: this.symbol,
      origin: this.origin,
      quoteAsset: this.market.contract?.quoteAsset ?? "USDT",
      /** Last traded price on the exchange. */
      price: u?.price ?? null,
      priceKind: u?.priceKind ?? null,
      executable: false as const,
      /** Best bid/ask from the exchange order book at `bookTime`. */
      bid: book?.bid ?? null,
      ask: book?.ask ?? null,
      bidQty: book?.bidQty ?? null,
      askQty: book?.askQty ?? null,
      bookTime: book?.exchangeTime ?? null,
      spread: sp?.spread ?? null,
      spreadBps: sp?.spreadBps ?? null,
      markPrice: this.market.mark?.markPrice ?? null,
      indexPrice: this.market.mark?.indexPrice ?? null,
      source: u?.source ?? null,
      providerTime: u?.providerTime ?? null,
      receivedAt: u?.receivedAt ?? null,
      /** Age of the latest market-data message on any stream. */
      ageMs: activity === null ? null : now - activity,
      lastTradeAgeMs: this.live.ageMs(now),
      freshness: this.live.freshness(now, session.open, activity),
      change: tk?.priceChange ?? null,
      changePct: tk?.priceChangePercent ?? null,
      changeReference: tk ? { close: tk.lastPrice - tk.priceChange, openTime: tk.exchangeTime - 24 * 3600_000, label: "rolling 24h (Binance ticker)" } : null,
    };
  }

  marketView() {
    return { symbol: this.symbol, origin: this.origin, ...this.market.view(this.now(), this.live.last?.price ?? null) };
  }

  status() {
    const now = this.now();
    const session = this.session();
    const budget = (this.adapter as { budget?: { stats(): unknown } }).budget?.stats() ?? null;
    const quality = [...this.dataQuality.values(), ...this.market.staleWarnings(now, this.live.connection === "connected")];
    return {
      now,
      origin: this.origin,
      provider: this.adapter.id,
      symbol: this.symbol,
      session,
      contract: this.market.contract,
      contractCheckedAt: this.market.contractCheckedAt,
      startupProblem: this.startupProblem,
      regime: this.market.regime(now),
      connection: this.live.connection,
      connectionDetail: this.live.connectionDetail,
      connectionChangedAt: this.live.connectionChangedAt,
      feed: {
        messages: this.live.messages,
        distinctUpdates: this.live.distinct,
        duplicates: this.live.duplicates,
        outOfOrder: this.live.outOfOrder,
        avgUpdateIntervalMs: this.live.avgIntervalMs,
        avgLatencyMs: this.live.avgLatencyMs,
        clockOffsetMs: this.market.clockOffsetMs,
        expectedUpdateIntervalMs: this.adapter.characteristics.expectedUpdateIntervalMs,
        providesBidAsk: this.adapter.characteristics.providesBidAsk,
        providesVolume: this.adapter.characteristics.providesVolume,
      },
      streams: this.market.streamHealth(now),
      credits: budget,
      timeframes: TIMEFRAMES.map((tf) => {
        const st = this.tf.get(tf)!;
        const last = st.closed[st.closed.length - 1];
        return { timeframe: tf, bars: st.closed.length, lastClosedOpenTime: last?.openTime ?? null, lastStatus: last?.status ?? null, trend: st.trend.state, initialised: st.initialised };
      }),
      pendingConfirmations: [...this.pending.values()].map((p) => ({ timeframe: p.tf, openTime: p.openTime, attempts: p.attempts })),
      dataQuality: quality,
    };
  }

  chartData(tf: Timeframe, limit: number) {
    const st = this.tf.get(tf)!;
    const closed = st.closed.slice(-limit);
    // EMAs over all bars in memory, aligned 1:1 with the returned candles.
    const closes = st.closed.map((c) => c.close);
    const series = (period: number) => ema(closes, period).slice(closes.length - closed.length);
    const price = this.live.last?.price ?? closed[closed.length - 1]?.close ?? 0;
    return {
      timeframe: tf,
      origin: this.origin,
      candles: closed,
      forming: st.forming,
      ema20: series(20),
      ema50: series(50),
      ema200: series(200),
      trend: st.trend,
      structureTrend: st.structure.trend,
      swings: st.structure.swings.filter((s) => s.openTime >= (closed[0]?.openTime ?? 0)),
      events: st.structure.events.filter((e) => e.kind !== "swing").slice(-40),
      levels: nearestLevels(st.structure.levels, price, 5),
    };
  }

  // --------------------------------------------------------------- snapshot

  buildSnapshot(trigger: MarketSnapshot["trigger"]): MarketSnapshot {
    const now = this.now();
    const session = this.session();
    const u = this.live.last;
    const refs: Reference[] = [];
    const price = u?.price ?? null;
    const quote = this.market.contract?.quoteAsset ?? "USDT";
    if (u) refs.push({ id: "PRICE", kind: "price", timeframe: null, price: u.price, description: `last trade on Binance ${this.symbol} perpetual (${quote}); not a guaranteed fill` });
    const m = this.market.mark;
    if (m) {
      refs.push({ id: "MARK", kind: "price", timeframe: null, price: m.markPrice, description: `Binance mark price (${quote})` });
      refs.push({ id: "INDEX", kind: "price", timeframe: null, price: m.indexPrice, description: `Binance index price (${quote}); calculation method depends on the index regime` });
    }

    const timeframes: TimeframeSnapshot[] = TIMEFRAMES.map((tf) => {
      const st = this.tf.get(tf)!;
      const last = st.closed[st.closed.length - 1];
      const t = st.trend;
      const s = st.structure;
      for (const [name, v] of [["EMA20", t.ema20], ["EMA50", t.ema50], ["EMA200", t.ema200]] as const) {
        if (v !== null && t.barsUsed >= 200) refs.push({ id: `${tf}:${name}`, kind: "ema", timeframe: tf, price: round(v), description: `${tf} ${name} on closed bars` });
      }
      for (const sw of [s.lastSwingHigh, s.lastSwingLow]) {
        if (sw) refs.push({ id: sw.id, kind: sw.type === "high" ? "swing_high" : "swing_low", timeframe: tf, price: sw.price, description: `${tf} confirmed swing ${sw.type} (${sw.label}) confirmed ${new Date(sw.confirmedAt).toISOString()}` });
      }
      for (const l of nearestLevels(s.levels, price ?? last?.close ?? 0, 3)) {
        refs.push({ id: l.id, kind: "level", timeframe: tf, price: round(l.price), description: `${tf} ${l.role}, ${l.touches} touch(es)` });
      }
      const recent = s.events.filter((e) => e.kind !== "swing").slice(-5);
      return {
        timeframe: tf,
        lastClosedOpenTime: last ? iso(last.openTime) : null,
        lastClosedCloseTime: last ? iso(bucketEnd(last.openTime, tf)) : null,
        candleStatus: last ? (last.status === "derived" ? "derived" : "confirmed") : "none",
        barsUsed: t.barsUsed,
        close: t.close,
        ema20: r(t.ema20),
        ema50: r(t.ema50),
        ema200: r(t.ema200),
        rsi14: t.rsi14 === null ? null : Math.round(t.rsi14 * 10) / 10,
        atr14: r(t.atr14),
        trend: t.state,
        trendRules: t.rules,
        structureTrend: s.trend,
        lastSwingHighRef: s.lastSwingHigh?.id ?? null,
        lastSwingLowRef: s.lastSwingLow?.id ?? null,
        recentEvents: recent.map((e) => ({ id: e.id, kind: e.kind, direction: "direction" in e ? e.direction : null, level: "level" in e ? round(e.level) : null, at: iso(e.confirmedAt) })),
      };
    });
    const unique = [...new Map(refs.map((x) => [x.id, x])).values()];
    const quality = [...this.dataQuality.values(), ...this.market.staleWarnings(now, this.live.connection === "connected")];
    if (this.origin === "fixture") quality.unshift("FIXTURE DATA — not live market data");
    const activity = this.activityAt();
    const snapshot: MarketSnapshot = {
      snapshotVersion: 1,
      symbol: this.symbol,
      generatedAt: iso(now),
      dataOrigin: this.origin,
      price: u
        ? {
            value: u.price,
            kind: u.priceKind,
            executable: false,
            source: u.source,
            providerTime: iso(u.providerTime),
            receivedAt: iso(u.receivedAt),
            ageMs: Math.max(0, now - u.receivedAt),
            freshness: this.live.freshness(now, session.open, activity),
          }
        : null,
      session: { open: session.open, reason: session.reason },
      feed: { connection: this.live.connection, latencyMs: this.live.avgLatencyMs === null ? null : Math.round(this.live.avgLatencyMs) },
      timeframes,
      references: unique,
      trigger,
      dataQuality: quality,
      ...this.market.snapshotSections(now, u?.price ?? null),
    };
    return marketSnapshotSchema.parse(snapshot);
  }

  async persistSnapshot(payload: MarketSnapshot) {
    const id = randomUUID();
    const sha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const stored = { id, createdAt: this.now(), payload, sha256 };
    await this.repo.saveSnapshot(stored);
    return stored;
  }

  recentStructureEvents(tf: Timeframe): StructureEvent[] {
    return this.tf.get(tf)!.structure.events.slice(-50);
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const round = (v: number) => Math.round(v * 100) / 100;
const r = (v: number | null) => (v === null ? null : round(v));
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
