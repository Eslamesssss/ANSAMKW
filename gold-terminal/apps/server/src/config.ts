import { existsSync } from "node:fs";
import { TIMEFRAMES, type Timeframe } from "@gold/core";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v?.toLowerCase() === "true");
const int = (def: number) => z.coerce.number().int().nonnegative().default(def);
const num = (def: number) => z.coerce.number().nonnegative().default(def);
const tfList = (def: string) =>
  z
    .string()
    .default(def)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(TIMEFRAMES)));

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: int(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),

  /**
   * `live`: Binance USDⓈ-M Futures XAUUSDT (public market data, no key).
   * `fixture`: replays recorded/synthetic fixture files; everything is labelled
   * as fixture data and never presented as live.
   */
  DATA_MODE: z.enum(["live", "fixture"]).default("live"),
  FIXTURE_DIR: z.string().default("../../fixtures/synthetic"),

  DATABASE_URL: z.string().optional(),

  /**
   * Bearer token required by every mutating endpoint (alert rules, acks,
   * manual Claude refresh). Unset = those endpoints refuse all requests.
   * Generate with: openssl rand -hex 32
   */
  ADMIN_API_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().min(32, "ADMIN_API_TOKEN must be at least 32 characters").optional()),

  /**
   * Binance USDⓈ-M Futures public market data (no API key). The symbol is
   * fixed to XAUUSDT; only the endpoints are configurable.
   */
  BINANCE_REST_URL: z.string().url().default("https://fapi.binance.com"),
  BINANCE_WS_MARKET_URL: z.string().default("wss://fstream.binance.com/market/stream"),
  /** Book streams (bookTicker, depth). Set to the market URL if your region routes them there. */
  BINANCE_WS_BOOK_URL: z.string().default("wss://fstream.binance.com/public/stream"),
  /** Fraction of the exchange's per-minute request weight this app may use. */
  BINANCE_WEIGHT_SAFETY: z.coerce.number().min(0.1).max(1).default(0.5),
  OPEN_INTEREST_POLL_SEC: int(15),
  CONTRACT_REFRESH_SEC: int(300),
  /** REST price polling interval used only while the WebSocket is down. 0 disables. */
  PRICE_POLL_INTERVAL_SEC: int(5),
  HISTORY_BARS: int(1000),
  /** Seconds after a minute boundary before asking the provider for the closed bar. */
  RECONCILE_DELAY_SEC: int(4),
  /** Minimum seconds between 1m reconciliation fetches. */
  RECONCILE_INTERVAL_SEC: int(60),
  /** Timeframes whose native exchange bar is fetched over REST at each close (others are derived from 1m). */
  NATIVE_CONFIRM_TIMEFRAMES: tfList("5m,15m,1h,4h,1d"),

  /** Freshness thresholds for the streaming price, per feed. */
  PRICE_DELAYED_AFTER_MS: int(5_000),
  PRICE_STALE_AFTER_MS: int(30_000),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ANALYST_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  ANALYST_MAX_OUTPUT_TOKENS: int(12_000),
  ANALYST_AUTO_ENABLED: bool,
  ANALYST_AUTO_COOLDOWN_SEC: int(900),
  ANALYST_MANUAL_COOLDOWN_SEC: int(60),
  ANALYST_MAX_CALLS_PER_DAY: int(40),
  ANALYST_MAX_USD_PER_DAY: num(5),
  ANALYST_INPUT_USD_PER_MTOK: num(4),
  ANALYST_OUTPUT_USD_PER_MTOK: num(20),
  /** Timeframes whose BOS/CHoCH/trend changes count as meaningful events for auto-analysis. */
  ANALYST_TRIGGER_TIMEFRAMES: tfList("15m,1h,4h,1d"),
  /** Server-side refusal fallbacks (beta). */
  ANALYST_USE_FALLBACKS: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === "1" || v.toLowerCase() === "true"),
  /** Permit sending fixture snapshots to Claude (development only). */
  ANALYST_ALLOW_FIXTURE: bool,
});

export type Config = z.infer<typeof envSchema> & { timeframes: readonly Timeframe[] };

/** Load a local .env (cwd) into process.env for development; real environment variables win. */
export function loadDotEnv(file = ".env"): void {
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return { ...parsed.data, timeframes: TIMEFRAMES };
}
