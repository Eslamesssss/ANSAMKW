/**
 * Binance USDⓈ-M Futures connectivity test for XAUUSDT. Makes REAL public
 * requests (no API key) and reports, per endpoint and per stream, what works.
 * Uses roughly 25 request weight out of the exchange's per-minute limit.
 *
 *   npm run connectivity                        # from gold-terminal/
 *   npm run connectivity -- --ws-seconds=30 --skip-anthropic
 */
import Anthropic from "@anthropic-ai/sdk";
import { formatCairo } from "@gold/core";
import type { StreamKind } from "../src/market/adapter";
import { loadConfig, loadDotEnv } from "../src/config";
import { BinanceFuturesAdapter, BOOK_STREAMS, MARKET_STREAMS } from "../src/market/binance/adapter";
import { WeightBudget } from "../src/market/binance/weightBudget";

loadDotEnv();
const cfg = loadConfig();
const skipAnthropic = process.argv.includes("--skip-anthropic");
const wsSeconds = Number(process.argv.find((a) => a.startsWith("--ws-seconds="))?.split("=")[1] ?? 20);
let failures = 0;
const ok = (m: string) => console.log(`  ✔ ${m}`);
const warn = (m: string) => console.log(`  ! ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  ✘ ${m}`);
};
const check = async <T>(label: string, fn: () => Promise<T>, describe: (v: T) => string) => {
  try {
    const v = await fn();
    ok(`${label}: ${describe(v)}`);
    return v;
  } catch (e) {
    fail(`${label}: ${(e as Error).message}`);
    return null;
  }
};

console.log(`\nGOLD INTELLIGENCE TERMINAL — Binance USDⓈ-M connectivity test for XAUUSDT (${new Date().toISOString()})`);
console.log(`REST ${cfg.BINANCE_REST_URL}\nWS market ${cfg.BINANCE_WS_MARKET_URL}\nWS book   ${cfg.BINANCE_WS_BOOK_URL}\n`);

const budget = new WeightBudget(2400, 0.5);
const bn = new BinanceFuturesAdapter({ restUrl: cfg.BINANCE_REST_URL, wsMarketUrl: cfg.BINANCE_WS_MARKET_URL, wsBookUrl: cfg.BINANCE_WS_BOOK_URL, budget });

console.log("REST");
await check("server time", () => bn.measureClockOffset(), (off) => `local clock offset ${Math.round(off)}ms`);
const spec = await check(
  "exchangeInfo / contract validation",
  () => bn.loadContract(),
  (s) =>
    `${s.symbol} ${s.contractType} status=${s.status} base=${s.baseAsset} quote=${s.quoteAsset} margin=${s.marginAsset} tick=${s.tickSize} step=${s.stepSize} minQty=${s.minQty} minNotional=${s.minNotional ?? "n/a"} underlying=${s.underlyingType ?? "n/a"} ${s.underlyingSubType.join(",")}`,
);
if (spec && spec.status !== "TRADING") warn(`contract status is ${spec.status}: signals will be flagged as not trading`);
await check("klines 1m", () => bn.fetchHistory("1m", { outputsize: 5 }), (h) => `${h.closed.length} closed, forming=${h.forming ? "yes" : "no"}, last closed ${h.closed.at(-1) ? formatCairo(h.closed.at(-1)!.openTime) : "none"}, volume=${h.closed.at(-1)?.volume ?? "n/a"}`);
await check("klines 1d (history depth)", () => bn.fetchHistory("1d", { outputsize: 1000 }), (h) => `${h.closed.length} closed daily bars (EMA200 warm-up needs 600)`);
const sync = await check("depth / bookTicker / premiumIndex / 24h ticker / openInterest", () => bn.fetchMarketSync(), (s) => {
  const parts = [
    s.bookTop ? `bid ${s.bookTop.bid} ask ${s.bookTop.ask}` : "bookTicker ✘",
    s.depth ? `depth ${s.depth.bids.length}x${s.depth.asks.length}` : "depth ✘",
    s.mark ? `mark ${s.mark.markPrice} index ${s.mark.indexPrice} funding ${s.mark.fundingRate}` : "premiumIndex ✘",
    s.ticker ? `24h ${s.ticker.priceChangePercent}% vol ${s.ticker.volume}` : "ticker ✘",
    s.openInterest ? `OI ${s.openInterest.openInterest}` : "openInterest ✘",
  ];
  return parts.join(" · ");
});
if (sync && (!sync.bookTop || !sync.depth || !sync.mark || !sync.ticker || !sync.openInterest)) fail("one or more market-state endpoints failed (see ✘ above)");
await check("funding schedule", () => bn.fetchFundingSchedule(), (f) => `interval ${f.intervalHours ? `${f.intervalHours}h (${f.intervalSource})` : "unknown"}, last rate ${f.lastFundingRate ?? "n/a"}`);
await check("open interest history (5m)", () => bn.fetchOpenInterestHistory(), (h) => `${h.length} samples`);
try {
  const c = await bn.fetchIndexConstituents();
  if (c) ok(`index constituents: ${c.constituents.map((x) => `${x.exchange}:${x.symbol}${x.weight !== null ? ` w=${x.weight}` : ""}`).join(", ") || "none listed"}`);
  else warn("index constituents: endpoint returned no data for XAUUSDT");
} catch (e) {
  warn(`index constituents unavailable (${(e as Error).message}); the index regime falls back to the session schedule plus the static-index check`);
}
console.log(`  weight: ${JSON.stringify(budget.stats())}`);

console.log(`\nWebSocket (${wsSeconds}s)`);
console.log(`  market streams: ${MARKET_STREAMS.join(", ")}`);
console.log(`  book streams:   ${BOOK_STREAMS.join(", ")}`);
const counts = new Map<StreamKind, number>();
let lastStatus = "";
await new Promise<void>((resolve) => {
  const h = bn.streamMarket({
    onPrice: () => {},
    onStatus: (s, d) => {
      lastStatus = `${s}${d ? ` (${d})` : ""}`;
      console.log(`    status: ${lastStatus}`);
    },
    onStreamMessage: (kind) => counts.set(kind, (counts.get(kind) ?? 0) + 1),
  });
  setTimeout(() => {
    h.close();
    resolve();
  }, wsSeconds * 1000);
});
for (const kind of ["mark", "kline", "ticker", "trade", "bookTicker", "depth"] as StreamKind[]) {
  const n = counts.get(kind) ?? 0;
  if (n > 0) ok(`${kind}: ${n} messages`);
  else if (kind === "trade") warn("trade: no trades in the window (quiet market or stream issue)");
  else if (kind === "bookTicker" || kind === "depth") fail(`${kind}: no messages; check BINANCE_WS_BOOK_URL (currently ${cfg.BINANCE_WS_BOOK_URL})`);
  else fail(`${kind}: no messages; check BINANCE_WS_MARKET_URL (currently ${cfg.BINANCE_WS_MARKET_URL})`);
}

console.log("\nAnthropic");
if (skipAnthropic) console.log("  – skipped");
else if (!cfg.ANTHROPIC_API_KEY) warn("ANTHROPIC_API_KEY is not set (analyst disabled; market data unaffected)");
else {
  await check("model", () => new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY }).models.retrieve(cfg.ANTHROPIC_MODEL), (m) => `${m.id} available (${m.display_name})`);
}

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
