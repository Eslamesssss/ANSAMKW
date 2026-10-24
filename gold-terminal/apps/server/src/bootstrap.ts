import path from "node:path";
import { alertRuleSchema, type AlertRule } from "@gold/core";
import pg from "pg";
import { AnalystService, type AnalystClient } from "./ai/analyst";
import { buildApp } from "./api/app";
import type { Config } from "./config";
import { MemoryRepository } from "./db/memoryRepository";
import { migrate } from "./db/migrate";
import { PgRepository } from "./db/pgRepository";
import type { Repository } from "./db/repository";
import { MarketEngine, type Logger } from "./engine/engine";
import type { MarketDataAdapter } from "./market/adapter";
import { FixtureAdapter } from "./market/fixture";
import { CreditBudget } from "./market/twelvedata/creditBudget";
import { TwelveDataAdapter } from "./market/twelvedata/adapter";

/** Starter rules created on first run; users can edit or delete them. */
export const DEFAULT_RULES: AlertRule[] = [
  { id: "default-bos-choch-15m", name: "15m BOS/CHoCH", type: "structure_break", timeframe: "15m", kinds: ["bos", "choch"], direction: "any" },
  { id: "default-bos-choch-1h", name: "1h BOS/CHoCH", type: "structure_break", timeframe: "1h", kinds: ["bos", "choch"], direction: "any" },
  { id: "default-trend-1h", name: "1h trend change", type: "trend_change", timeframe: "1h", to: "any" },
  { id: "default-trend-4h", name: "4h trend change", type: "trend_change", timeframe: "4h", to: "any" },
  { id: "default-levels-1h", name: "1h detected level breakout", type: "level_cross", timeframe: "1h", source: "detected", price: null, direction: "any" },
].map((r) => alertRuleSchema.parse(r));

export interface BootstrapOptions {
  config: Config;
  logger: Logger;
  /** Overrides for tests. */
  repo?: Repository;
  adapter?: MarketDataAdapter;
  now?: () => number;
  analystClient?: AnalystClient | null;
  startEngine?: boolean;
  httpLogger?: boolean | object;
}

export async function bootstrap(opts: BootstrapOptions) {
  const { config, logger } = opts;
  let repo = opts.repo;
  if (!repo) {
    if (config.DATABASE_URL) {
      const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
      const applied = await migrate(pool);
      if (applied.length) logger.info({ applied }, "migrations applied");
      repo = new PgRepository(pool);
    } else {
      logger.warn({}, "DATABASE_URL not set: using in-memory storage (history is lost on restart)");
      repo = new MemoryRepository();
    }
  }
  if ((await repo.listRules()).length === 0) for (const r of DEFAULT_RULES) await repo.saveRule(r);

  let adapter = opts.adapter ?? null;
  let now = opts.now ?? Date.now;
  let startupProblem: string | null = null;
  if (!adapter) {
    if (config.DATA_MODE === "fixture") {
      const fx = new FixtureAdapter(path.resolve(process.cwd(), config.FIXTURE_DIR), Number(process.env.FIXTURE_SPEED ?? 1));
      now = fx.clock;
      adapter = fx;
      logger.warn({ kind: fx.manifest.kind, dir: fx.dir }, "FIXTURE MODE: replaying fixture data — NOT LIVE");
    } else if (!config.TWELVEDATA_API_KEY) {
      startupProblem = "TWELVEDATA_API_KEY is not set: live market data unavailable. No prices are shown until credentials are configured.";
      logger.warn({}, startupProblem);
    } else {
      adapter = new TwelveDataAdapter({
        apiKey: config.TWELVEDATA_API_KEY,
        symbol: config.SYMBOL,
        restUrl: config.TWELVEDATA_REST_URL,
        wsUrl: config.TWELVEDATA_WS_URL,
        budget: new CreditBudget(config.TWELVEDATA_CREDITS_PER_MINUTE, config.TWELVEDATA_CREDITS_PER_DAY),
        log: (m, d) => logger.warn({ detail: d }, m),
      });
    }
  } else if (adapter instanceof FixtureAdapter && !opts.now) {
    now = adapter.clock;
  }

  const engine = adapter ? new MarketEngine(config, adapter, repo, now, logger) : null;
  const analyst = new AnalystService({
    config,
    repo,
    now,
    client: opts.analystClient,
    snapshot: async (trigger) => {
      if (!engine) throw new Error("engine not running");
      const s = await engine.persistSnapshot(engine.buildSnapshot(trigger));
      return { id: s.id, payload: s.payload };
    },
  });
  const { app, broadcast } = await buildApp({ config, repo, engine, analyst, startupProblem, logger: opts.httpLogger });

  if (engine) {
    engine.on("price", (p) => broadcast("price", p));
    engine.on("status", (s) => broadcast("status", s));
    engine.on("alert", (a) => broadcast("alert", a));
    engine.on("gap", (g) => broadcast("gap", g));
    engine.on("close", (c) => broadcast("close", { timeframe: c.timeframe, openTime: c.candle.openTime, trend: c.trend.state, events: c.events.map((e: { id: string; kind: string }) => ({ id: e.id, kind: e.kind })) }));
    engine.on("meaningful", async (events) => {
      const r = await analyst.run({ kind: "event", events });
      if (r.analysis) broadcast("analysis", r.analysis);
    });
    let lastStatusPush = 0;
    engine.on("heartbeat", ({ now: t }) => {
      if (t - lastStatusPush >= 5000) {
        lastStatusPush = t;
        broadcast("status", engine.status());
      }
    });
    if (opts.startEngine !== false) {
      engine.start().catch((err) => {
        logger.error({ err: (err as Error).message }, "engine failed to start");
      });
    }
  }
  return { app, engine, repo, analyst, startupProblem };
}
