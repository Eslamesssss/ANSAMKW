/**
 * Provider connectivity test. Makes REAL calls with your credentials and
 * reports what works. Uses ~3 Twelve Data credits and one small Anthropic call
 * (skip it with --skip-anthropic).
 *
 *   npm run connectivity            # from gold-terminal/
 */
import Anthropic from "@anthropic-ai/sdk";
import { formatCairo } from "@gold/core";
import { loadConfig, loadDotEnv } from "../src/config";
import { CreditBudget } from "../src/market/twelvedata/creditBudget";
import { TwelveDataAdapter } from "../src/market/twelvedata/adapter";

loadDotEnv();
const cfg = loadConfig();
const skipAnthropic = process.argv.includes("--skip-anthropic");
const wsSeconds = Number(process.argv.find((a) => a.startsWith("--ws-seconds="))?.split("=")[1] ?? 20);
let failures = 0;
const ok = (m: string) => console.log(`  ✔ ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  ✘ ${m}`);
};

console.log(`\nGOLD INTELLIGENCE TERMINAL — provider connectivity test (${new Date().toISOString()})\n`);

console.log("Twelve Data");
if (!cfg.TWELVEDATA_API_KEY) {
  fail("TWELVEDATA_API_KEY is not set");
} else {
  const td = new TwelveDataAdapter({ apiKey: cfg.TWELVEDATA_API_KEY, symbol: cfg.SYMBOL, restUrl: cfg.TWELVEDATA_REST_URL, wsUrl: cfg.TWELVEDATA_WS_URL, budget: new CreditBudget(cfg.TWELVEDATA_CREDITS_PER_MINUTE, cfg.TWELVEDATA_CREDITS_PER_DAY) });
  try {
    const q = await td.fetchQuote();
    ok(`quote: ${q.price} (${q.source}), provider says market open = ${q.isMarketOpen}, quote time ${formatCairo(q.providerTime)}`);
  } catch (e) {
    fail(`quote: ${(e as Error).message}`);
  }
  try {
    const h = await td.fetchHistory("1m", { outputsize: 5 });
    const last = h.closed.at(-1);
    ok(`time_series 1min: ${h.closed.length} closed bars, forming=${h.forming ? "yes" : "no"}, last closed ${last ? formatCairo(last.openTime) : "none"}, volume=${last?.volume ?? "not provided"}`);
  } catch (e) {
    fail(`time_series 1min: ${(e as Error).message}`);
  }
  try {
    const h = await td.fetchHistory("1d", { outputsize: 1000 });
    ok(`time_series 1day: ${h.closed.length} closed bars available (EMA200 warm-up needs 600)`);
  } catch (e) {
    fail(`time_series 1day: ${(e as Error).message}`);
  }
  console.log(`  … WebSocket: listening ${wsSeconds}s for ${cfg.SYMBOL} price events`);
  await new Promise<void>((resolve) => {
    let prices = 0;
    let status = "";
    const handle = td.streamPrices({
      onPrice: (u) => {
        prices++;
        if (prices <= 3) console.log(`    price ${u.price} kind=${u.priceKind} bid=${u.bid ?? "n/a"} ask=${u.ask ?? "n/a"} latency≈${u.receivedAt - u.providerTime}ms`);
      },
      onStatus: (s, d) => {
        status = `${s}${d ? ` (${d})` : ""}`;
        console.log(`    status: ${status}`);
      },
    });
    setTimeout(() => {
      handle.close();
      if (prices > 0) ok(`WebSocket delivered ${prices} price events in ${wsSeconds}s`);
      else fail(`WebSocket delivered no price events in ${wsSeconds}s (last status: ${status}; market may be closed or plan may not include WebSocket)`);
      resolve();
    }, wsSeconds * 1000);
  });
  console.log(`  credits: ${JSON.stringify(td.budget.stats())}`);
}

console.log("\nAnthropic");
if (skipAnthropic) console.log("  – skipped");
else if (!cfg.ANTHROPIC_API_KEY) fail("ANTHROPIC_API_KEY is not set");
else {
  try {
    const client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
    const m = await client.models.retrieve(cfg.ANTHROPIC_MODEL);
    ok(`model ${m.id} is available (${m.display_name})`);
  } catch (e) {
    fail(`model lookup: ${(e as Error).message}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
