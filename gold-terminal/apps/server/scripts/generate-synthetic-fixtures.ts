/**
 * Generates SYNTHETIC fixtures in Twelve Data response format for tests and
 * offline development. The prices are a seeded random walk: they are NOT market
 * data and are labelled as such in manifest.json. Timestamps are placed in the
 * past and follow the XAU/USD session calendar so weekend logic is exercised.
 *
 *   npx tsx scripts/generate-synthetic-fixtures.ts [outDir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateCandles, HOUR, MINUTE, TWELVE_DATA_INTERVAL, xauSessionStatus, type Candle, type Timeframe } from "@gold/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(here, "../../../fixtures/synthetic"));

let seed = 20240313;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const r2 = (v: number) => Math.round(v * 100) / 100;

// Replay window: the last REPLAY_MIN minutes before END.
const END = Date.UTC(2024, 2, 13, 15, 0); // Wed 2024-03-13 15:00 UTC
const REPLAY_MIN = 180;
const REPLAY_START = END - REPLAY_MIN * MINUTE;
const HOURS = 1450 * 24; // ~4 years of hourly buckets, enough for >1000 daily bars
const MINUTE_DAYS = 17;
const KEEP = 1600;

// 1) Hourly base series inside the trading session.
const hourly: Candle[] = [];
let price = 1500;
for (let h = HOURS; h > 0; h--) {
  const open = END - h * HOUR;
  if (!xauSessionStatus(open).open) continue;
  const t = (HOURS - h) / HOURS;
  const drift = 0.18 * Math.sin(t * Math.PI * 9) + 0.05;
  const o = price;
  const c = Math.max(100, o + drift + gauss() * 3.2);
  const hi = Math.max(o, c) + Math.abs(gauss()) * 1.6;
  const lo = Math.min(o, c) - Math.abs(gauss()) * 1.6;
  hourly.push({ openTime: open, open: r2(o), high: r2(hi), low: r2(lo), close: r2(c), volume: null, status: "confirmed" });
  price = c;
}

// 2) Subdivide recent hours into 1m bars consistent with each hour's OHLC.
const minutes: Candle[] = [];
for (const hb of hourly.filter((x) => x.openTime >= END - MINUTE_DAYS * 24 * HOUR)) {
  const path: number[] = [hb.open];
  for (let i = 1; i < 60; i++) {
    const remaining = 60 - i;
    const prev = path[i - 1]!;
    const pull = (hb.close - prev) / (remaining + 1);
    path.push(Math.min(hb.high, Math.max(hb.low, prev + pull + gauss() * 0.35)));
  }
  path.push(hb.close);
  const iHigh = Math.floor(rand() * 60);
  let iLow = Math.floor(rand() * 60);
  if (iLow === iHigh) iLow = (iLow + 17) % 60;
  for (let i = 0; i < 60; i++) {
    const o = r2(path[i]!);
    const c = r2(path[i + 1]!);
    let hi = Math.min(hb.high, Math.max(o, c) + Math.abs(gauss()) * 0.15);
    let lo = Math.max(hb.low, Math.min(o, c) - Math.abs(gauss()) * 0.15);
    if (i === iHigh) hi = hb.high;
    if (i === iLow) lo = hb.low;
    minutes.push({ openTime: hb.openTime + i * MINUTE, open: o, high: r2(hi), low: r2(lo), close: c, volume: null, status: "confirmed" });
  }
}

const series: Record<Timeframe, Candle[]> = {
  "1m": minutes,
  "5m": aggregateCandles(minutes, "5m", END),
  "15m": aggregateCandles(minutes, "15m", END),
  "1h": hourly,
  "4h": aggregateCandles(hourly, "4h", END),
  "1d": aggregateCandles(hourly, "1d", END),
};

const dt = (ms: number, tf: Timeframe) => {
  const s = new Date(ms).toISOString();
  return tf === "1d" ? s.slice(0, 10) : s.slice(0, 19).replace("T", " ");
};

mkdirSync(outDir, { recursive: true });
const files: Record<string, string> = {};
for (const [tf, candles] of Object.entries(series) as [Timeframe, Candle[]][]) {
  const interval = TWELVE_DATA_INTERVAL[tf];
  const body = {
    meta: { symbol: "XAU/USD", interval, currency_base: "Gold Spot", currency_quote: "US Dollar", exchange_timezone: "UTC", type: "Physical Currency", _fixture: "SYNTHETIC — NOT MARKET DATA" },
    values: candles.slice(-KEEP).map((c) => ({ datetime: dt(c.openTime, tf), open: c.open.toFixed(2), high: c.high.toFixed(2), low: c.low.toFixed(2), close: c.close.toFixed(2) })),
    status: "ok",
  };
  files[interval] = `time_series_${interval}.json`;
  writeFileSync(path.join(outDir, files[interval]!), JSON.stringify(body));
}

// 3) Streamed price frames for the replay window, consistent with the 1m bars.
const frames: string[] = [];
for (const m of minutes.filter((x) => x.openTime >= REPLAY_START && x.openTime < END)) {
  const n = 6 + Math.floor(rand() * 10);
  const seconds = [...new Set([0, 59, ...Array.from({ length: n }, () => 1 + Math.floor(rand() * 57))])].sort((a, b) => a - b);
  const extremes = new Map([[seconds[1 + Math.floor(rand() * (seconds.length - 2))]!, m.high]]);
  extremes.set(seconds[1 + Math.floor(rand() * (seconds.length - 2))]!, m.low);
  for (const s of seconds) {
    const p = s === 0 ? m.open : s === 59 ? m.close : (extremes.get(s) ?? r2(m.low + rand() * (m.high - m.low)));
    const ts = Math.floor(m.openTime / 1000) + s;
    const frame = { event: "price", symbol: "XAU/USD", currency_base: "Gold Spot", currency_quote: "US Dollar", type: "Physical Currency", timestamp: ts, price: p };
    const receivedAt = ts * 1000 + 150 + Math.floor(rand() * 250);
    frames.push(JSON.stringify({ receivedAt, raw: JSON.stringify(frame) }));
    // Occasional repeated frame: the same snapshot sent twice is not a new tick.
    if (rand() < 0.08) frames.push(JSON.stringify({ receivedAt: receivedAt + 20, raw: JSON.stringify(frame) }));
  }
  frames.push(JSON.stringify({ receivedAt: m.openTime + 30_000, raw: JSON.stringify({ event: "heartbeat", status: "ok" }) }));
}
writeFileSync(path.join(outDir, "ws_frames.jsonl"), frames.join("\n") + "\n");

const before = minutes.filter((x) => x.openTime < REPLAY_START);
const lastDaily = series["1d"].filter((d) => d.openTime + 24 * HOUR <= REPLAY_START).at(-1)!;
writeFileSync(
  path.join(outDir, "quote.json"),
  JSON.stringify({ symbol: "XAU/USD", name: "SYNTHETIC", close: before.at(-1)!.close.toFixed(2), previous_close: lastDaily.close.toFixed(2), is_market_open: true, timestamp: Math.floor(REPLAY_START / 1000) }),
);

writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    {
      kind: "synthetic",
      notLiveData: true,
      description: "SYNTHETIC seeded random walk in Twelve Data response format. NOT market data. For tests and offline UI development only.",
      symbol: "XAU/USD",
      format: "twelvedata",
      recordedAt: null,
      replayStart: new Date(REPLAY_START).toISOString(),
      replayEnd: new Date(END).toISOString(),
      files,
      wsFrames: "ws_frames.jsonl",
      quote: "quote.json",
    },
    null,
    2,
  ),
);
console.log(`Synthetic fixtures written to ${outDir}`);
