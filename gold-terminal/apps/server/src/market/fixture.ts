import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { bucketEnd, TIMEFRAMES, type ContractSpec, type Timeframe } from "@gold/core";
import { z } from "zod";
import type { FeedCharacteristics, HistoryRequest, HistoryResult, MarketDataAdapter, MarketSync, StreamHandle, StreamHandlers } from "./adapter";
import { BinanceFuturesAdapter } from "./binance/adapter";
import { BINANCE_SYMBOL, parseWsFrame, streamKindOf } from "./binance/parse";
import { WeightBudget } from "./binance/weightBudget";

export const fixtureManifestSchema = z.object({
  /** `synthetic`: generated, NOT market data. `recorded`: captured from Binance at a past time. */
  kind: z.enum(["synthetic", "recorded"]),
  notLiveData: z.literal(true),
  description: z.string(),
  symbol: z.literal(BINANCE_SYMBOL),
  format: z.literal("binance-usdm"),
  recordedAt: z.string().nullable(),
  replayStart: z.string(),
  replayEnd: z.string(),
  /** REST bodies by endpoint path, e.g. "/fapi/v1/exchangeInfo": "exchangeInfo.json". */
  rest: z.record(z.string(), z.string()),
  /** Klines bodies by interval. */
  klines: z.record(z.string(), z.string()),
  wsFrames: z.string().nullable(),
});
export type FixtureManifest = z.infer<typeof fixtureManifestSchema>;

interface Frame {
  receivedAt: number;
  raw: string;
}

/**
 * Replays Binance-format fixture files through the same parsers as live mode
 * on a virtual clock starting at the fixture's replay start. REST calls are
 * answered from files (klines only up to the virtual "now", so nothing from
 * the future leaks in) and stream frames are released at their recorded
 * receive times. Everything is labelled `origin: "fixture"`.
 */
export class FixtureAdapter implements MarketDataAdapter {
  readonly id: string;
  readonly origin = "fixture" as const;
  readonly symbol = BINANCE_SYMBOL;
  readonly characteristics: FeedCharacteristics;
  readonly manifest: FixtureManifest;
  private rest: BinanceFuturesAdapter;
  private klines = new Map<Timeframe, unknown[][]>();
  private frames: Frame[] = [];
  private startedReal: number;
  private readonly replayStart: number;
  private readonly replayEnd: number;

  constructor(
    readonly dir: string,
    readonly speed = 1,
    private realNow: () => number = Date.now,
  ) {
    const manifestPath = path.join(dir, "manifest.json");
    if (!existsSync(manifestPath)) throw new Error(`Fixture manifest not found: ${manifestPath}`);
    this.manifest = fixtureManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
    this.id = `fixture-${this.manifest.kind}`;
    this.replayStart = Date.parse(this.manifest.replayStart);
    this.replayEnd = Date.parse(this.manifest.replayEnd);
    for (const tf of TIMEFRAMES) {
      const file = this.manifest.klines[tf];
      if (file) this.klines.set(tf, JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    }
    if (this.manifest.wsFrames) {
      this.frames = readFileSync(path.join(dir, this.manifest.wsFrames), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Frame)
        .sort((a, b) => a.receivedAt - b.receivedAt);
    }
    this.startedReal = this.realNow();
    // REST goes through the real Binance adapter with file-backed responses.
    this.rest = new BinanceFuturesAdapter({
      restUrl: "https://fixture.invalid",
      wsMarketUrl: "ws://fixture.invalid",
      wsBookUrl: "ws://fixture.invalid",
      budget: new WeightBudget(1_000_000, 1, this.clock),
      fetchImpl: this.fetchFromFiles,
      now: this.clock,
    });
    this.characteristics = { ...this.rest.characteristics };
  }

  /** Virtual "now" inside the fixture timeline; it stops at the end of the replay. */
  clock = (): number => Math.min(this.replayEnd, this.replayStart + (this.realNow() - this.startedReal) * this.speed);

  get finished() {
    return this.clock() >= this.replayEnd;
  }

  private fetchFromFiles = (async (input: string | URL) => {
    const url = new URL(String(input));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/fapi/v1/klines") {
      const tf = url.searchParams.get("interval") as Timeframe;
      const rows = this.klines.get(tf);
      if (!rows) return json({ code: -1120, msg: `fixture has no ${tf} klines` }, 400);
      const now = this.clock();
      const start = Number(url.searchParams.get("startTime") ?? -Infinity);
      const end = Number(url.searchParams.get("endTime") ?? Infinity);
      const limit = Number(url.searchParams.get("limit") ?? 500);
      // Only bars that have closed by the virtual clock: the fixture never reveals the future.
      const visible = rows.filter((r) => bucketEnd(r[0] as number, tf) <= now && (r[0] as number) >= start && (r[0] as number) <= end);
      return json(start > -Infinity ? visible.slice(0, limit) : visible.slice(-limit));
    }
    const file = this.manifest.rest[url.pathname];
    if (!file) return json({ code: -1000, msg: `fixture has no response for ${url.pathname}` }, 404);
    return new Response(readFileSync(path.join(this.dir, file)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  loadContract(): Promise<ContractSpec> {
    return this.rest.loadContract();
  }
  fetchHistory(tf: Timeframe, req: HistoryRequest): Promise<HistoryResult> {
    return this.rest.fetchHistory(tf, req).then((r) => ({ ...r, source: r.source.replace("binance-rest", this.id) }));
  }
  fetchMarketSync(): Promise<MarketSync> {
    return this.rest.fetchMarketSync();
  }
  fetchOpenInterest() {
    return this.rest.fetchOpenInterest();
  }
  fetchOpenInterestHistory() {
    return this.rest.fetchOpenInterestHistory();
  }
  fetchFundingSchedule() {
    return this.rest.fetchFundingSchedule();
  }
  fetchIndexConstituents() {
    return this.rest.fetchIndexConstituents().catch(() => null);
  }

  streamMarket(h: StreamHandlers): StreamHandle {
    let i = this.frames.findIndex((f) => f.receivedAt >= this.clock());
    if (i < 0) i = this.frames.length;
    h.onStatus("connected", `replaying ${this.manifest.kind} fixture (not live)`);
    const timer = setInterval(() => {
      const now = this.clock();
      while (i < this.frames.length && this.frames[i]!.receivedAt <= now) {
        const f = this.frames[i++]!;
        const e = parseWsFrame(f.raw, f.receivedAt, "fixture", `${this.id}-ws`);
        const kind = streamKindOf(e);
        if (kind) h.onStreamMessage?.(kind, f.receivedAt);
        if (e.kind === "trade") h.onPrice(e.update);
        else if (e.kind === "mark") h.onMark?.(e.mark);
        else if (e.kind === "bookTicker") h.onBookTop?.(e.book);
        else if (e.kind === "depth") h.onDepth?.(e.depth);
        else if (e.kind === "ticker") h.onTicker?.(e.ticker);
        else if (e.kind === "kline") h.onKline?.(e.kline);
      }
      if (i >= this.frames.length && this.finished) {
        clearInterval(timer);
        h.onStatus("disconnected", "fixture replay finished");
      }
    }, 100);
    return { close: () => clearInterval(timer) };
  }
}
