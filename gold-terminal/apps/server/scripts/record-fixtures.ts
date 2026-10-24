/**
 * Records REAL Twelve Data responses into fixtures/recorded/<timestamp>/ for
 * deterministic replay in tests and fixture mode. Run while the market is open.
 * Uses 7 REST credits plus a WebSocket session.
 *
 *   npm run fixtures:record -- --minutes=20
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIMEFRAMES, TWELVE_DATA_INTERVAL } from "@gold/core";
import WebSocket from "ws";
import { loadConfig, loadDotEnv } from "../src/config";

loadDotEnv();
const cfg = loadConfig();
if (!cfg.TWELVEDATA_API_KEY) {
  console.error("TWELVEDATA_API_KEY is required to record fixtures");
  process.exit(1);
}
const minutes = Number(process.argv.find((a) => a.startsWith("--minutes="))?.split("=")[1] ?? 20);
const here = path.dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.resolve(here, `../../../fixtures/recorded/${stamp}`);
mkdirSync(dir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const get = async (p: string, params: Record<string, string>) => {
  const url = new URL(p, cfg.TWELVEDATA_REST_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", cfg.TWELVEDATA_API_KEY!);
  const res = await fetch(url);
  return res.json();
};

const replayStart = Date.now();
console.log(`Recording WebSocket frames for ${minutes} minutes into ${dir}`);
const framesFile = path.join(dir, "ws_frames.jsonl");
writeFileSync(framesFile, "");
await new Promise<void>((resolve) => {
  const ws = new WebSocket(`${cfg.TWELVEDATA_WS_URL}?apikey=${encodeURIComponent(cfg.TWELVEDATA_API_KEY!)}`);
  const hb = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ action: "heartbeat" })), 10_000);
  ws.on("open", () => ws.send(JSON.stringify({ action: "subscribe", params: { symbols: cfg.SYMBOL } })));
  ws.on("message", (d) => appendFileSync(framesFile, JSON.stringify({ receivedAt: Date.now(), raw: d.toString() }) + "\n"));
  setTimeout(() => {
    clearInterval(hb);
    ws.close();
    resolve();
  }, minutes * 60_000);
});
const replayEnd = Date.now();

const files: Record<string, string> = {};
for (const tf of TIMEFRAMES) {
  const interval = TWELVE_DATA_INTERVAL[tf];
  const body = await get("/time_series", { symbol: cfg.SYMBOL, interval, outputsize: "1600", timezone: "UTC", order: "ASC" });
  files[interval] = `time_series_${interval}.json`;
  writeFileSync(path.join(dir, files[interval]!), JSON.stringify(body));
  console.log(`  ${interval}: ${(body as { values?: unknown[] }).values?.length ?? JSON.stringify(body)}`);
  await sleep(8_000); // stay inside the free plan's per-minute credit limit
}
writeFileSync(path.join(dir, "quote.json"), JSON.stringify(await get("/quote", { symbol: cfg.SYMBOL, timezone: "UTC" })));
writeFileSync(
  path.join(dir, "manifest.json"),
  JSON.stringify(
    {
      kind: "recorded",
      notLiveData: true,
      description: `Recorded from Twelve Data on ${new Date(replayStart).toISOString()}. Historical replay, not live data.`,
      symbol: cfg.SYMBOL,
      format: "twelvedata",
      recordedAt: new Date(replayEnd).toISOString(),
      replayStart: new Date(replayStart).toISOString(),
      replayEnd: new Date(replayEnd).toISOString(),
      files,
      wsFrames: "ws_frames.jsonl",
      quote: "quote.json",
    },
    null,
    2,
  ),
);
console.log("Done. Note: Twelve Data terms may restrict redistribution of recorded data; keep recordings private.");
