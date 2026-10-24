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
   * `live`: real provider (requires TWELVEDATA_API_KEY).
   * `fixture`: replays recorded/synthetic fixture files; everything is labelled
   * as fixture data and never presented as live.
   */
  DATA_MODE: z.enum(["live", "fixture"]).default("live"),
  FIXTURE_DIR: z.string().default("../../fixtures/synthetic"),
  SYMBOL: z.string().default("XAU/USD"),

  DATABASE_URL: z.string().optional(),

  TWELVEDATA_API_KEY: z.string().optional(),
  TWELVEDATA_REST_URL: z.string().default("https://api.twelvedata.com"),
  TWELVEDATA_WS_URL: z.string().default("wss://ws.twelvedata.com/v1/quotes/price"),
  /** Plan limits; the scheduler never exceeds them. Defaults match the free Basic plan. */
  TWELVEDATA_CREDITS_PER_MINUTE: int(8),
  TWELVEDATA_CREDITS_PER_DAY: int(800),
  /** REST `/price` polling interval used only while the WebSocket is down. 0 disables. */
  PRICE_POLL_INTERVAL_SEC: int(0),
  HISTORY_BARS: int(1000),
  /** Seconds after a minute boundary before asking the provider for the closed bar. */
  RECONCILE_DELAY_SEC: int(4),
  /** Minimum seconds between 1m reconciliation fetches (raise on low-credit plans). */
  RECONCILE_INTERVAL_SEC: int(60),
  /** Timeframes whose native provider bar is fetched at each close (others are derived from 1m). */
  NATIVE_CONFIRM_TIMEFRAMES: tfList("1h,4h,1d"),

  /** Freshness thresholds for the streaming price, per feed. */
  PRICE_DELAYED_AFTER_MS: int(15_000),
  PRICE_STALE_AFTER_MS: int(60_000),

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
