import { indexRegime, type ContractSpec, type MarketSnapshot } from "@gold/core";
import type { BookTop, DepthSnapshot, FundingSchedule, IndexConstituents, MarkUpdate, OpenInterestSample, StreamKind, Ticker24h } from "../market/adapter";

const HOUR = 3_600_000;

/**
 * Perpetual-futures state that sits beside the candle pipeline: contract
 * spec, top of book and depth, mark/index/funding, 24h ticker, open interest,
 * index constituents and per-stream liveness. Everything here is exchange
 * data as received; derived numbers (spread, basis, imbalance, OI change) are
 * plain arithmetic on it.
 */
export class MarketState {
  contract: ContractSpec | null = null;
  contractCheckedAt: number | null = null;
  bookTop: BookTop | null = null;
  depth: DepthSnapshot | null = null;
  mark: MarkUpdate | null = null;
  ticker: Ticker24h | null = null;
  funding: FundingSchedule | null = null;
  constituents: IndexConstituents | null = null;
  clockOffsetMs: number | null = null;
  private oi: OpenInterestSample[] = [];
  private lastIndex: number | null = null;
  lastIndexChangeAt: number | null = null;
  private streamLast = new Map<StreamKind, number>();
  private streamCount = new Map<StreamKind, number>();

  constructor(private staleAfter: Partial<Record<StreamKind, number>>) {}

  onMark(m: MarkUpdate) {
    if (this.lastIndex === null || m.indexPrice !== this.lastIndex) {
      this.lastIndex = m.indexPrice;
      this.lastIndexChangeAt = m.receivedAt;
    }
    this.mark = m;
  }

  addOpenInterest(samples: OpenInterestSample[]) {
    const byTime = new Map(this.oi.map((s) => [s.time, s]));
    for (const s of samples) byTime.set(s.time, s);
    const sorted = [...byTime.values()].sort((a, b) => a.time - b.time);
    const newest = sorted.at(-1)?.time ?? 0;
    this.oi = sorted.filter((s) => newest - s.time <= 2 * HOUR);
  }

  get openInterest(): OpenInterestSample | null {
    return this.oi.at(-1) ?? null;
  }

  /** Change in open interest (base units) versus the sample closest to one hour earlier, if one exists. */
  openInterestChange1h(): number | null {
    const last = this.openInterest;
    if (!last) return null;
    const target = last.time - HOUR;
    const candidates = this.oi.filter((s) => Math.abs(s.time - target) <= 10 * 60_000);
    if (!candidates.length) return null;
    const ref = candidates.reduce((a, b) => (Math.abs(a.time - target) <= Math.abs(b.time - target) ? a : b));
    return last.openInterest - ref.openInterest;
  }

  touchStream(kind: StreamKind, at: number) {
    this.streamLast.set(kind, at);
    this.streamCount.set(kind, (this.streamCount.get(kind) ?? 0) + 1);
  }

  lastActivity(): number | null {
    const ts = [...this.streamLast.values()];
    return ts.length ? Math.max(...ts) : null;
  }

  streamHealth(now: number) {
    return (Object.keys(this.staleAfter) as StreamKind[]).map((stream) => {
      const last = this.streamLast.get(stream) ?? null;
      const staleAfterMs = this.staleAfter[stream]!;
      return { stream, lastAt: last, ageMs: last === null ? null : now - last, staleAfterMs, stale: last === null || now - last > staleAfterMs, messages: this.streamCount.get(stream) ?? 0 };
    });
  }

  /** Human-readable warnings for streams that went quiet. Trades may legitimately pause, so they are only noted. */
  staleWarnings(now: number, connected: boolean): string[] {
    if (!connected) return [];
    return this.streamHealth(now)
      .filter((h) => h.stale)
      .map((h) =>
        h.lastAt === null
          ? `${h.stream} stream: no data received yet`
          : h.stream === "trade"
            ? `no trades for ${Math.round(h.ageMs! / 1000)}s (quiet market or stream issue)`
            : `${h.stream} stream stale: last update ${Math.round(h.ageMs! / 1000)}s ago`,
      );
  }

  spread() {
    const b = this.bookTop;
    if (!b || !(b.bid > 0) || !(b.ask > 0)) return null;
    const mid = (b.bid + b.ask) / 2;
    return { spread: b.ask - b.bid, spreadBps: ((b.ask - b.bid) / mid) * 10_000, mid };
  }

  /** Order-book imbalance over the top `n` levels: (bidQty − askQty) / (bidQty + askQty). */
  imbalance(n = 10): number | null {
    const d = this.depth;
    if (!d || !d.bids.length || !d.asks.length) return null;
    const bid = d.bids.slice(0, n).reduce((s, [, q]) => s + q, 0);
    const ask = d.asks.slice(0, n).reduce((s, [, q]) => s + q, 0);
    return bid + ask > 0 ? (bid - ask) / (bid + ask) : null;
  }

  regime(now: number) {
    return indexRegime(now, this.lastIndexChangeAt);
  }

  view(now: number, lastTrade: number | null) {
    const sp = this.spread();
    const m = this.mark;
    const oi = this.openInterest;
    const basis = lastTrade !== null && m ? lastTrade - m.indexPrice : null;
    return {
      contract: this.contract,
      contractCheckedAt: this.contractCheckedAt,
      bookTop: this.bookTop ? { ...this.bookTop, ...sp, ageMs: now - this.bookTop.receivedAt } : null,
      depth: this.depth ? { bids: this.depth.bids, asks: this.depth.asks, exchangeTime: this.depth.exchangeTime, ageMs: now - this.depth.receivedAt, imbalanceTop10: this.imbalance(10) } : null,
      mark: m ? { ...m, ageMs: now - m.receivedAt } : null,
      basis,
      basisBps: basis !== null && m ? (basis / m.indexPrice) * 10_000 : null,
      markIndexSpread: m ? m.markPrice - m.indexPrice : null,
      funding: { ...this.funding, currentRate: m?.fundingRate ?? null, nextFundingTime: m?.nextFundingTime ?? null },
      ticker: this.ticker,
      openInterest: oi ? { ...oi, notionalUsdt: m ? oi.openInterest * m.markPrice : null, change1h: this.openInterestChange1h() } : null,
      constituents: this.constituents,
      regime: this.regime(now),
      clockOffsetMs: this.clockOffsetMs,
      streams: this.streamHealth(now),
    };
  }

  snapshotSections(now: number, lastTrade: number | null): Pick<MarketSnapshot, "contract" | "derivatives" | "book" | "indexRegime"> {
    const c = this.contract;
    const m = this.mark;
    const sp = this.spread();
    const oi = this.openInterest;
    const basis = lastTrade !== null && m ? lastTrade - m.indexPrice : null;
    const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
    const regime = this.regime(now);
    return {
      contract: c
        ? { exchange: c.exchange, symbol: c.symbol, contractType: c.contractType, status: c.status, quoteAsset: c.quoteAsset, marginAsset: c.marginAsset, tickSize: c.tickSize, stepSize: c.stepSize, minQty: c.minQty, minNotional: c.minNotional }
        : null,
      derivatives: m || this.ticker || oi
        ? {
            markPrice: m?.markPrice ?? null,
            indexPrice: m?.indexPrice ?? null,
            basis: r2(basis),
            basisBps: basis !== null && m ? Math.round((basis / m.indexPrice) * 10_000 * 10) / 10 : null,
            fundingRate: m?.fundingRate ?? null,
            nextFundingTime: m?.nextFundingTime ? new Date(m.nextFundingTime).toISOString() : null,
            fundingIntervalHours: this.funding?.intervalHours ?? null,
            openInterest: oi?.openInterest ?? null,
            openInterestUsdt: oi && m ? Math.round(oi.openInterest * m.markPrice) : null,
            openInterestChange1h: this.openInterestChange1h(),
            volume24h: this.ticker?.volume ?? null,
            quoteVolume24h: this.ticker ? Math.round(this.ticker.quoteVolume) : null,
            change24hPct: this.ticker?.priceChangePercent ?? null,
          }
        : null,
      book:
        this.bookTop && sp
          ? { bestBid: this.bookTop.bid, bestAsk: this.bookTop.ask, spread: r2(sp.spread)!, spreadBps: Math.round(sp.spreadBps * 100) / 100, imbalanceTop10: this.imbalance(10), ageMs: Math.max(0, now - this.bookTop.receivedAt) }
          : null,
      indexRegime: { regime: regime.regime, scheduled: regime.scheduled, indexStatic: regime.indexStatic, note: regime.note },
    };
  }
}
