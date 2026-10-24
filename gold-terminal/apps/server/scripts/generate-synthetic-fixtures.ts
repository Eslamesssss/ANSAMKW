/**
 * Generates SYNTHETIC fixtures in Binance USDⓈ-M Futures response format for
 * tests and offline development. Prices, volumes, the contract spec and every
 * other value are a seeded random walk or illustrative placeholders: they are
 * NOT market data and NOT Binance's real XAUUSDT specification, and are
 * labelled as such in manifest.json and in each file.
 *
 *   npx tsx scripts/generate-synthetic-fixtures.ts [outDir]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateCandles, bucketEnd, bucketStart, HOUR, MINUTE, TIMEFRAMES, type Candle, type Timeframe } from "@gold/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(here, "../../../fixtures/synthetic"));
const LABEL = "SYNTHETIC — not market data, not Binance's real contract specification";

let seed = 20261021;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// Replay window crosses an hour boundary so 1h confirmation is exercised.
const END = Date.UTC(2026, 9, 21, 13, 15); // Wed 2026-10-21 13:15 UTC
const REPLAY_MIN = 25;
const REPLAY_START = END - REPLAY_MIN * MINUTE;
// The contract is young: only ~320 days of history exist, so 1d stays below the EMA200 warm-up.
const HISTORY_DAYS = 320;
const MINUTE_DAYS = 8;
const KEEP = 1500;

// 1) Hourly base series. The perpetual trades around the clock; volatility is lower off-hours.
const hourly: Candle[] = [];
let price = 2600;
for (let open = bucketStart(END - HISTORY_DAYS * 24 * HOUR, "1d"); open < END; open += HOUR) {
  const t = (open - (END - HISTORY_DAYS * 24 * HOUR)) / (HISTORY_DAYS * 24 * HOUR);
  const day = new Date(open).getUTCDay();
  const vol = day === 0 || day === 6 ? 1.2 : 3.4;
  const o = price;
  const c = Math.max(100, o + (0.12 * Math.sin(t * Math.PI * 7) + 0.11) + gauss() * vol);
  const hi = Math.max(o, c) + Math.abs(gauss()) * vol * 0.5;
  const lo = Math.min(o, c) - Math.abs(gauss()) * vol * 0.5;
  hourly.push({ openTime: open, open: r2(o), high: r2(hi), low: r2(lo), close: r2(c), volume: r3(200 + rand() * 800), status: "confirmed" });
  price = c;
}

// 2) Recent hours subdivided into 1m bars consistent with each hour's OHLC; hourly volume = sum of minutes.
const minutes: Candle[] = [];
for (const hb of hourly.filter((x) => x.openTime >= END - MINUTE_DAYS * 24 * HOUR)) {
  const pathPts: number[] = [hb.open];
  for (let i = 1; i < 60; i++) {
    const prev = pathPts[i - 1]!;
    pathPts.push(Math.min(hb.high, Math.max(hb.low, prev + (hb.close - prev) / (60 - i + 1) + gauss() * 0.3)));
  }
  pathPts.push(hb.close);
  const iHigh = Math.floor(rand() * 60);
  let iLow = Math.floor(rand() * 60);
  if (iLow === iHigh) iLow = (iLow + 17) % 60;
  let vsum = 0;
  for (let i = 0; i < 60; i++) {
    const o = r2(pathPts[i]!);
    const c = r2(pathPts[i + 1]!);
    let hi = Math.min(hb.high, Math.max(o, c) + Math.abs(gauss()) * 0.12);
    let lo = Math.max(hb.low, Math.min(o, c) - Math.abs(gauss()) * 0.12);
    if (i === iHigh) hi = hb.high;
    if (i === iLow) lo = hb.low;
    const v = r3(2 + rand() * 18);
    vsum += v;
    minutes.push({ openTime: hb.openTime + i * MINUTE, open: o, high: r2(hi), low: r2(lo), close: c, volume: v, status: "confirmed" });
  }
  hb.volume = r3(vsum);
}

const series: Record<Timeframe, Candle[]> = {
  "1m": minutes,
  "5m": aggregateCandles(minutes, "5m", END + 365 * 24 * HOUR),
  "15m": aggregateCandles(minutes, "15m", END + 365 * 24 * HOUR),
  "1h": hourly,
  "4h": aggregateCandles(hourly, "4h", END + 365 * 24 * HOUR),
  "1d": aggregateCandles(hourly, "1d", END + 365 * 24 * HOUR),
};

/** Binance kline row: [openTime, o, h, l, c, v, closeTime, quoteVolume, trades, takerBase, takerQuote, ignore]. */
const row = (c: Candle, tf: Timeframe) => [
  c.openTime,
  c.open.toFixed(2),
  c.high.toFixed(2),
  c.low.toFixed(2),
  c.close.toFixed(2),
  (c.volume ?? 0).toFixed(3),
  bucketEnd(c.openTime, tf) - 1,
  ((c.volume ?? 0) * c.close).toFixed(2),
  Math.round((c.volume ?? 0) * 3),
  ((c.volume ?? 0) / 2).toFixed(3),
  (((c.volume ?? 0) / 2) * c.close).toFixed(2),
  "0",
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const write = (name: string, body: unknown) => writeFileSync(path.join(outDir, name), JSON.stringify(body));
const klineFiles: Record<string, string> = {};
for (const tf of TIMEFRAMES) {
  klineFiles[tf] = `klines_${tf}.json`;
  // Includes bars after the replay start; the fixture adapter only reveals those closed by its virtual clock.
  write(klineFiles[tf]!, series[tf].filter((c) => c.openTime < END).slice(-KEEP).map((c) => row(c, tf)));
}

// 3) Stream frames for the replay window, consistent with the 1m klines.
const frames: string[] = [];
const sym = "XAUUSDT";
const push = (receivedAt: number, stream: string, data: Record<string, unknown>) => frames.push(JSON.stringify({ receivedAt, raw: JSON.stringify({ stream, data }) }));
let aggId = 9_000_000;
let lastPrice = 0;
let basis = 0.6;
let oiBase = 4200;
const fundingT = (t: number) => Math.ceil((t + 1) / (8 * HOUR)) * 8 * HOUR;
const replayMinutes = minutes.filter((x) => x.openTime >= REPLAY_START && x.openTime < END);
const partial = new Map<Timeframe, Candle>();

for (const m of replayMinutes) {
  // Trades: first at open, last at close, extremes inside.
  const n = 8 + Math.floor(rand() * 14);
  const secs = [...new Set([0, 59, ...Array.from({ length: n }, () => 1 + Math.floor(rand() * 57))])].sort((a, b) => a - b);
  const hiAt = secs[1 + Math.floor(rand() * (secs.length - 2))]!;
  let loAt = secs[1 + Math.floor(rand() * (secs.length - 2))]!;
  if (loAt === hiAt) loAt = secs[secs.length - 2]!;
  const trades = secs.map((s) => ({ t: m.openTime + s * 1000 + Math.floor(rand() * 900), p: s === 0 ? m.open : s === 59 ? m.close : s === hiAt ? m.high : s === loAt ? m.low : r2(m.low + rand() * (m.high - m.low)), q: 0 }));
  const vol = m.volume ?? 0;
  trades.forEach((tr, i) => (tr.q = i === trades.length - 1 ? r3(vol - trades.slice(0, -1).reduce((s, x) => s + x.q, 0)) : r3(vol / trades.length)));

  let ti = 0;
  for (let sec = 0; sec < 60; sec++) {
    const t = m.openTime + sec * 1000;
    while (ti < trades.length && trades[ti]!.t < t + 1000) {
      const tr = trades[ti++]!;
      lastPrice = tr.p;
      push(tr.t + 120 + Math.floor(rand() * 80), `${sym.toLowerCase()}@aggTrade`, { e: "aggTrade", E: tr.t + 5, s: sym, a: aggId++, p: tr.p.toFixed(2), q: tr.q.toFixed(3), f: aggId * 3, l: aggId * 3 + 1, T: tr.t, m: rand() < 0.5 });
      // Exact forming bars from the trades seen so far.
      for (const tf of TIMEFRAMES) {
        const open = bucketStart(tr.t, tf);
        const cur = partial.get(tf);
        if (!cur || cur.openTime !== open) {
          // Start from the bucket's earlier minutes so the forming bar matches what the exchange would show.
          const earlier = minutes.filter((c) => c.openTime >= open && c.openTime < m.openTime);
          const first = earlier[0];
          partial.set(tf, {
            openTime: open,
            open: first ? first.open : tr.p,
            high: Math.max(tr.p, ...earlier.map((c) => c.high)),
            low: Math.min(tr.p, ...earlier.map((c) => c.low)),
            close: tr.p,
            volume: r3(earlier.reduce((sum, c) => sum + (c.volume ?? 0), 0) + tr.q),
            status: "forming",
          });
        } else {
          cur.high = Math.max(cur.high, tr.p);
          cur.low = Math.min(cur.low, tr.p);
          cur.close = tr.p;
          cur.volume = r3((cur.volume ?? 0) + tr.q);
        }
      }
    }
    if (!lastPrice) lastPrice = m.open;
    const recv = t + 150 + Math.floor(rand() * 100);
    basis = Math.max(-2, Math.min(2, basis + gauss() * 0.05));
    const mark = r2(lastPrice + gauss() * 0.05);
    push(recv, `${sym.toLowerCase()}@markPrice@1s`, { e: "markPriceUpdate", E: t, s: sym, p: mark.toFixed(2), i: r2(lastPrice - basis).toFixed(2), P: r2(lastPrice - basis).toFixed(2), r: "0.00010000", T: fundingT(t) });
    const spread = r2(0.1 + Math.floor(rand() * 3) * 0.05);
    const bid = r2(lastPrice - spread / 2);
    push(recv + 3, `${sym.toLowerCase()}@bookTicker`, { e: "bookTicker", u: t, E: t, T: t, s: sym, b: bid.toFixed(2), B: r3(1 + rand() * 9).toFixed(3), a: r2(bid + spread).toFixed(2), A: r3(1 + rand() * 9).toFixed(3) });
    if (sec % 5 === 0) {
      const lv = (side: 1 | -1) => Array.from({ length: 20 }, (_, k) => [r2(bid + (side === 1 ? 0 : spread) - side * k * 0.05).toFixed(2), r3(0.5 + rand() * 12).toFixed(3)]);
      push(recv + 5, `${sym.toLowerCase()}@depth20@100ms`, { e: "depthUpdate", E: t, T: t, s: sym, U: t, u: t + 1, pu: t - 1, b: lv(1), a: lv(-1) });
    }
    if (sec % 2 === 0) {
      const d = series["1d"].find((c) => c.openTime === bucketStart(t, "1d")) ?? series["1d"].at(-1)!;
      push(recv + 7, `${sym.toLowerCase()}@ticker`, { e: "24hrTicker", E: t, s: sym, p: r2(lastPrice - d.open).toFixed(2), P: (((lastPrice - d.open) / d.open) * 100).toFixed(3), w: lastPrice.toFixed(2), c: lastPrice.toFixed(2), Q: "0.010", o: d.open.toFixed(2), h: Math.max(d.high, lastPrice).toFixed(2), l: Math.min(d.low, lastPrice).toFixed(2), v: "12345.678", q: (12345.678 * lastPrice).toFixed(2), O: t - 24 * HOUR, C: t, F: 1, L: 2, n: 3 });
    }
    for (const tf of TIMEFRAMES) {
      const cur = partial.get(tf);
      if (!cur) continue;
      const every = tf === "1m" ? 2 : 10;
      if (sec % every === 0) push(recv + 9, `${sym.toLowerCase()}@kline_${tf}`, klineFrame(t, tf, cur, false));
    }
  }
  // Final klines at the bucket end, for every timeframe whose bucket closes now.
  const end = m.openTime + MINUTE;
  for (const tf of TIMEFRAMES) {
    if (bucketEnd(bucketStart(m.openTime, tf), tf) !== end) continue;
    const finalBar = series[tf].find((c) => c.openTime === bucketStart(m.openTime, tf));
    if (finalBar) push(end + 180, `${sym.toLowerCase()}@kline_${tf}`, klineFrame(end, tf, finalBar, true));
  }
  oiBase += gauss() * 3;
}

function klineFrame(E: number, tf: Timeframe, c: Candle, x: boolean) {
  return {
    e: "kline",
    E,
    s: sym,
    k: { t: c.openTime, T: bucketEnd(c.openTime, tf) - 1, s: sym, i: tf, f: 1, L: 2, o: c.open.toFixed(2), c: c.close.toFixed(2), h: c.high.toFixed(2), l: c.low.toFixed(2), v: (c.volume ?? 0).toFixed(3), n: 10, x, q: ((c.volume ?? 0) * c.close).toFixed(2), V: "0", Q: "0", B: "0" },
  };
}
frames.sort((a, b) => JSON.parse(a).receivedAt - JSON.parse(b).receivedAt);
writeFileSync(path.join(outDir, "ws_frames.jsonl"), frames.join("\n") + "\n");

// 4) REST snapshots as of the replay start.
const before = minutes.filter((x) => x.openTime < REPLAY_START).at(-1)!;
const p0 = before.close;
const d0 = series["1d"].find((c) => c.openTime === bucketStart(REPLAY_START, "1d"))!;
write("exchangeInfo.json", {
  _fixture: LABEL,
  timezone: "UTC",
  serverTime: REPLAY_START,
  rateLimits: [{ rateLimitType: "REQUEST_WEIGHT", interval: "MINUTE", intervalNum: 1, limit: 2400 }],
  assets: [],
  symbols: [
    {
      symbol: sym,
      pair: sym,
      contractType: "PERPETUAL",
      deliveryDate: 4133404800000,
      onboardDate: END - HISTORY_DAYS * 24 * HOUR,
      status: "TRADING",
      maintMarginPercent: "2.5000",
      requiredMarginPercent: "5.0000",
      baseAsset: "XAU",
      quoteAsset: "USDT",
      marginAsset: "USDT",
      pricePrecision: 2,
      quantityPrecision: 3,
      underlyingType: "COMMODITY",
      underlyingSubType: ["TradFi"],
      liquidationFee: "0.012500",
      filters: [
        { filterType: "PRICE_FILTER", minPrice: "100", maxPrice: "100000", tickSize: "0.01" },
        { filterType: "LOT_SIZE", minQty: "0.001", maxQty: "1000", stepSize: "0.001" },
        { filterType: "MARKET_LOT_SIZE", minQty: "0.001", maxQty: "100", stepSize: "0.001" },
        { filterType: "MIN_NOTIONAL", notional: "5" },
      ],
    },
  ],
});
write("premiumIndex.json", { symbol: sym, markPrice: p0.toFixed(2), indexPrice: (p0 - 0.6).toFixed(2), estimatedSettlePrice: (p0 - 0.6).toFixed(2), lastFundingRate: "0.00010000", interestRate: "0.00010000", nextFundingTime: fundingT(REPLAY_START), time: REPLAY_START });
write("ticker24hr.json", { symbol: sym, priceChange: (p0 - d0.open).toFixed(2), priceChangePercent: (((p0 - d0.open) / d0.open) * 100).toFixed(3), lastPrice: p0.toFixed(2), highPrice: d0.high.toFixed(2), lowPrice: d0.low.toFixed(2), volume: "12345.678", quoteVolume: (12345.678 * p0).toFixed(2), openTime: REPLAY_START - 24 * HOUR, closeTime: REPLAY_START });
const lv = (side: 1 | -1) => Array.from({ length: 20 }, (_, k) => [r2(p0 - side * (0.05 + k * 0.05)).toFixed(2), r3(0.5 + rand() * 12).toFixed(3)]);
write("depth.json", { lastUpdateId: 1, E: REPLAY_START, T: REPLAY_START, bids: lv(1), asks: lv(-1) });
write("bookTicker.json", { symbol: sym, bidPrice: r2(p0 - 0.05).toFixed(2), bidQty: "3.100", askPrice: r2(p0 + 0.05).toFixed(2), askQty: "2.700", time: REPLAY_START });
write("openInterest.json", { symbol: sym, openInterest: oiBase.toFixed(3), time: REPLAY_START });
write("openInterestHist.json", Array.from({ length: 13 }, (_, k) => ({ symbol: sym, sumOpenInterest: (oiBase - (12 - k) * 6).toFixed(3), sumOpenInterestValue: ((oiBase - (12 - k) * 6) * p0).toFixed(2), timestamp: REPLAY_START - (12 - k) * 5 * MINUTE })));
write("fundingInfo.json", []);
write("fundingRate.json", Array.from({ length: 4 }, (_, k) => ({ symbol: sym, fundingTime: fundingT(REPLAY_START) - (4 - k) * 8 * HOUR, fundingRate: "0.00010000", markPrice: p0.toFixed(2) })));
write("constituents.json", { symbol: sym, time: REPLAY_START, constituents: [{ exchange: "SYNTHETIC", symbol: "SYNTHETIC-GOLD", price: (p0 - 0.6).toFixed(2), weight: "1.00000000" }] });

writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    {
      kind: "synthetic",
      notLiveData: true,
      description: `${LABEL}. Seeded random walk in Binance USDⓈ-M response format, for tests and offline UI development only.`,
      symbol: sym,
      format: "binance-usdm",
      recordedAt: null,
      replayStart: new Date(REPLAY_START).toISOString(),
      replayEnd: new Date(END).toISOString(),
      rest: {
        "/fapi/v1/exchangeInfo": "exchangeInfo.json",
        "/fapi/v1/premiumIndex": "premiumIndex.json",
        "/fapi/v1/ticker/24hr": "ticker24hr.json",
        "/fapi/v1/depth": "depth.json",
        "/fapi/v1/ticker/bookTicker": "bookTicker.json",
        "/fapi/v1/openInterest": "openInterest.json",
        "/futures/data/openInterestHist": "openInterestHist.json",
        "/fapi/v1/fundingInfo": "fundingInfo.json",
        "/fapi/v1/fundingRate": "fundingRate.json",
        "/fapi/v1/constituents": "constituents.json",
      },
      klines: klineFiles,
      wsFrames: "ws_frames.jsonl",
    },
    null,
    2,
  ),
);
console.log(`Synthetic Binance-format fixtures written to ${outDir} (${frames.length} stream frames)`);
