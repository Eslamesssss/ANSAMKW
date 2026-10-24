import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { bucketEnd, TIMEFRAMES, TWELVE_DATA_INTERVAL, type Timeframe } from "@gold/core";
import { z } from "zod";
import { ProviderError, type FeedCharacteristics, type HistoryRequest, type HistoryResult, type MarketDataAdapter, type QuoteResult, type StreamHandle, type StreamHandlers } from "./adapter";
import { parseQuote, parseTimeSeries, parseUtcDatetime, parseWsMessage } from "./twelvedata/parse";

export const fixtureManifestSchema = z.object({
  /** `synthetic`: generated, NOT market data. `recorded`: captured from a real provider at a past time. */
  kind: z.enum(["synthetic", "recorded"]),
  notLiveData: z.literal(true),
  description: z.string(),
  symbol: z.string(),
  format: z.literal("twelvedata"),
  recordedAt: z.string().nullable(),
  replayStart: z.string(),
  replayEnd: z.string(),
  files: z.record(z.string(), z.string()),
  wsFrames: z.string().nullable(),
  quote: z.string().nullable(),
});
export type FixtureManifest = z.infer<typeof fixtureManifestSchema>;

interface Frame {
  receivedAt: number;
  raw: string;
}

/**
 * Replays fixture files through the same Twelve Data parsers as live mode,
 * on a virtual clock starting at the fixture's replay start. Everything it
 * produces is labelled `origin: "fixture"`.
 */
export class FixtureAdapter implements MarketDataAdapter {
  readonly id: string;
  readonly origin = "fixture" as const;
  readonly symbol: string;
  readonly characteristics: FeedCharacteristics = { expectedUpdateIntervalMs: null, providesBidAsk: false, providesVolume: false };
  readonly manifest: FixtureManifest;
  private series = new Map<Timeframe, { meta: unknown; values: { datetime: string }[] }>();
  private frames: Frame[] = [];
  private startedReal = Date.now();
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
    this.symbol = this.manifest.symbol;
    this.replayStart = Date.parse(this.manifest.replayStart);
    this.replayEnd = Date.parse(this.manifest.replayEnd);
    for (const tf of TIMEFRAMES) {
      const file = this.manifest.files[TWELVE_DATA_INTERVAL[tf]];
      if (file) this.series.set(tf, JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    }
    if (this.manifest.wsFrames) {
      this.frames = readFileSync(path.join(dir, this.manifest.wsFrames), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Frame)
        .sort((a, b) => a.receivedAt - b.receivedAt);
    }
    this.startedReal = this.realNow();
  }

  /** Virtual "now" inside the fixture timeline; it stops at the end of the replay. */
  clock = (): number => Math.min(this.replayEnd, this.replayStart + (this.realNow() - this.startedReal) * this.speed);

  get finished() {
    return this.clock() >= this.replayEnd;
  }

  async fetchHistory(tf: Timeframe, req: HistoryRequest): Promise<HistoryResult> {
    const s = this.series.get(tf);
    if (!s) throw new ProviderError(`fixture has no ${tf} series`, "bad_request");
    const now = this.clock();
    let values = s.values.filter((v) => bucketEnd(parseUtcDatetime(v.datetime), tf) <= now);
    if (req.startMs !== undefined) values = values.filter((v) => parseUtcDatetime(v.datetime) >= req.startMs!);
    if (req.endMs !== undefined) values = values.filter((v) => parseUtcDatetime(v.datetime) <= req.endMs!);
    if (req.outputsize) values = values.slice(-req.outputsize);
    const parsed = parseTimeSeries({ meta: s.meta, values, status: "ok" }, tf, now);
    return { ...parsed, source: `${this.id}:${TWELVE_DATA_INTERVAL[tf]}`, fetchedAt: now };
  }

  async fetchQuote(): Promise<QuoteResult> {
    if (!this.manifest.quote) throw new ProviderError("fixture has no quote", "bad_request");
    const q = parseQuote(JSON.parse(readFileSync(path.join(this.dir, this.manifest.quote), "utf8")));
    return { ...q, source: `${this.id}:quote` };
  }

  streamPrices(handlers: StreamHandlers): StreamHandle {
    let i = this.frames.findIndex((f) => f.receivedAt >= this.clock());
    if (i < 0) i = this.frames.length;
    handlers.onStatus("connected", `replaying ${this.manifest.kind} fixture (not live)`);
    const timer = setInterval(() => {
      const now = this.clock();
      while (i < this.frames.length && this.frames[i]!.receivedAt <= now) {
        const f = this.frames[i++]!;
        const msg = parseWsMessage(f.raw, f.receivedAt, "fixture");
        if (msg.type === "price") handlers.onPrice({ ...msg.update, source: `${this.id}-ws` });
      }
      if (i >= this.frames.length && this.finished) {
        clearInterval(timer);
        handlers.onStatus("disconnected", "fixture replay finished");
      }
    }, 100);
    return { close: () => clearInterval(timer) };
  }
}
