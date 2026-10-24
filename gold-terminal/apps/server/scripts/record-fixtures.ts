/**
 * Records REAL Binance USDⓈ-M XAUUSDT responses into fixtures/recorded/<timestamp>/
 * for deterministic replay in tests and fixture mode. Public endpoints only.
 *
 *   npm run fixtures:record -- --minutes=20
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIMEFRAMES } from "@gold/core";
import WebSocket from "ws";
import { loadConfig, loadDotEnv } from "../src/config";
import { BOOK_STREAMS, MARKET_STREAMS } from "../src/market/binance/adapter";
import { BINANCE_SYMBOL } from "../src/market/binance/parse";

loadDotEnv();
const cfg = loadConfig();
const minutes = Number(process.argv.find((a) => a.startsWith("--minutes="))?.split("=")[1] ?? 20);
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, `../../../fixtures/recorded/${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(dir, { recursive: true });

const get = async (p: string, params: Record<string, string> = {}) => {
  const url = new URL(p, cfg.BINANCE_REST_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};

// Market-state snapshots are taken at the start so the replay never sees later state; klines are fetched at the end
// (the fixture adapter only reveals bars closed by its virtual clock).
const rest: Record<string, string> = {};
const save = async (endpoint: string, file: string, params: Record<string, string> = {}) => {
  writeFileSync(path.join(dir, file), JSON.stringify(await get(endpoint, params)));
  rest[endpoint] = file;
};
await save("/fapi/v1/exchangeInfo", "exchangeInfo.json");
await save("/fapi/v1/premiumIndex", "premiumIndex.json", { symbol: BINANCE_SYMBOL });
await save("/fapi/v1/ticker/24hr", "ticker24hr.json", { symbol: BINANCE_SYMBOL });
await save("/fapi/v1/depth", "depth.json", { symbol: BINANCE_SYMBOL, limit: "20" });
await save("/fapi/v1/ticker/bookTicker", "bookTicker.json", { symbol: BINANCE_SYMBOL });
await save("/fapi/v1/openInterest", "openInterest.json", { symbol: BINANCE_SYMBOL });
await save("/futures/data/openInterestHist", "openInterestHist.json", { symbol: BINANCE_SYMBOL, period: "5m", limit: "13" });
await save("/fapi/v1/fundingInfo", "fundingInfo.json");
await save("/fapi/v1/fundingRate", "fundingRate.json", { symbol: BINANCE_SYMBOL, limit: "4" });
await save("/fapi/v1/constituents", "constituents.json", { symbol: BINANCE_SYMBOL }).catch((e) => console.warn(`constituents not recorded: ${(e as Error).message}`));
const replayStart = Date.now();
const framesFile = path.join(dir, "ws_frames.jsonl");
writeFileSync(framesFile, "");
console.log(`Recording ${minutes} minutes of XAUUSDT streams into ${dir}`);
await new Promise<void>((resolve) => {
  const open = (base: string, streams: string[]) => {
    const ws = new WebSocket(`${base}?streams=${streams.join("/")}`);
    ws.on("message", (d) => appendFileSync(framesFile, JSON.stringify({ receivedAt: Date.now(), raw: d.toString() }) + "\n"));
    ws.on("error", (e) => console.error(`${base}: ${e.message}`));
    return ws;
  };
  const sockets = [open(cfg.BINANCE_WS_MARKET_URL, MARKET_STREAMS), open(cfg.BINANCE_WS_BOOK_URL, BOOK_STREAMS)];
  setTimeout(() => {
    sockets.forEach((s) => s.close());
    resolve();
  }, minutes * 60_000);
});
const replayEnd = Date.now();

const klines: Record<string, string> = {};
for (const tf of TIMEFRAMES) {
  klines[tf] = `klines_${tf}.json`;
  writeFileSync(path.join(dir, klines[tf]!), JSON.stringify(await get("/fapi/v1/klines", { symbol: BINANCE_SYMBOL, interval: tf, limit: "1500" })));
}
writeFileSync(
  path.join(dir, "manifest.json"),
  JSON.stringify(
    {
      kind: "recorded",
      notLiveData: true,
      description: `Recorded from Binance USDⓈ-M Futures (XAUUSDT) on ${new Date(replayStart).toISOString()}. Historical replay, not live data.`,
      symbol: BINANCE_SYMBOL,
      format: "binance-usdm",
      recordedAt: new Date(replayEnd).toISOString(),
      replayStart: new Date(replayStart).toISOString(),
      replayEnd: new Date(replayEnd).toISOString(),
      rest,
      klines,
      wsFrames: "ws_frames.jsonl",
    },
    null,
    2,
  ),
);
console.log("Done. Recordings are git-ignored; check Binance's terms before sharing market data.");
