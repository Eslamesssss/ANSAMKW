import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import { alertRuleSchema, isTimeframe, TIMEFRAMES } from "@gold/core";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import type { AnalystService } from "../ai/analyst";
import type { Config } from "../config";
import type { Repository } from "../db/repository";
import type { MarketEngine } from "../engine/engine";
import { adminGuard } from "./auth";

export interface AppDeps {
  config: Config;
  repo: Repository;
  /** null when the market feed could not start (e.g. missing credentials). */
  engine: MarketEngine | null;
  analyst: AnalystService;
  startupProblem: string | null;
  logger?: boolean | object;
}

type SseClient = { id: number; reply: FastifyReply; lastPriceAt: number };

export interface BuiltApp {
  app: FastifyInstance;
  broadcast: (event: string, data: unknown) => void;
}

export async function buildApp(deps: AppDeps): Promise<BuiltApp> {
  const { config, repo, engine, analyst } = deps;
  const app = Fastify({ logger: deps.logger ?? false });
  await app.register(cors, { origin: config.CORS_ORIGINS.split(",").map((s) => s.trim()), methods: ["GET", "POST", "PUT", "DELETE"], allowedHeaders: ["Content-Type", "Authorization"] });

  const clients = new Set<SseClient>();
  let nextId = 1;
  const broadcast = (event: string, data: unknown) => {
    const now = Date.now();
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) {
      // Price events are throttled per client; everything else is delivered.
      if (event === "price") {
        if (now - c.lastPriceAt < 250) continue;
        c.lastPriceAt = now;
      }
      c.reply.raw.write(payload);
    }
  };

  // Read endpoints are public market data; everything that changes state or spends money needs the admin token.
  const requireAdmin = adminGuard(config.ADMIN_API_TOKEN);
  const admin = { preHandler: requireAdmin };
  // Safety net: a state-changing route registered without the guard fails at startup.
  app.addHook("onRoute", (route) => {
    const methods = ([] as string[]).concat(route.method);
    const guarded = ([] as unknown[]).concat(route.preHandler ?? []).includes(requireAdmin);
    if (methods.some((m) => !["GET", "HEAD", "OPTIONS"].includes(m)) && !guarded) {
      throw new Error(`Mutating route ${methods.join(",")} ${route.url} must use the admin guard`);
    }
  });

  const problem = () => engine?.startupProblem ?? deps.startupProblem;
  const noFeed = (reply: FastifyReply) =>
    reply.code(503).send({ error: "market feed not running", detail: problem() ?? "engine not started" });

  app.get("/api/health", async () => ({
    ok: true,
    dataMode: config.DATA_MODE,
    database: repo.kind,
    feedRunning: !!engine?.started,
    startupProblem: problem(),
    analystConfigured: analyst.enabled,
    adminAuthConfigured: !!config.ADMIN_API_TOKEN,
  }));

  app.get("/api/auth/check", admin, async () => ({ ok: true }));

  app.get("/api/state", async () => {
    if (!engine) {
      return {
        origin: config.DATA_MODE,
        connection: "error",
        startupProblem: problem(),
        price: null,
        status: null,
        analyst: await analyst.budget(),
      };
    }
    return { origin: engine.origin, connection: engine.startupProblem ? "error" : engine.live.connection, startupProblem: problem(), price: engine.priceView(), status: engine.status(), analyst: await analyst.budget() };
  });

  app.get("/api/candles", async (req, reply) => {
    if (!engine) return noFeed(reply);
    const q = z.object({ tf: z.string().refine(isTimeframe), limit: z.coerce.number().int().min(10).max(2000).default(500) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid query", issues: q.error.issues });
    return engine.chartData(q.data.tf as (typeof TIMEFRAMES)[number], q.data.limit);
  });

  app.get("/api/trend", async (_req, reply) => {
    if (!engine) return noFeed(reply);
    return TIMEFRAMES.map((tf) => {
      const st = engine.tf.get(tf)!;
      const last = st.closed[st.closed.length - 1];
      return { ...st.trend, structureTrend: st.structure.trend, lastStatus: last?.status ?? null, lastSwingHigh: st.structure.lastSwingHigh, lastSwingLow: st.structure.lastSwingLow };
    });
  });

  app.get("/api/market", async (_req, reply) => {
    if (!engine) return noFeed(reply);
    return engine.marketView();
  });

  app.get("/api/contract", async (_req, reply) => {
    if (!engine?.market.contract) return reply.code(503).send({ error: "contract not verified", detail: problem() ?? "contract not loaded yet" });
    return engine.market.contract;
  });

  app.get("/api/snapshot", async (_req, reply) => {
    if (!engine) return noFeed(reply);
    return engine.buildSnapshot({ kind: "manual", eventIds: [] });
  });

  // ------------------------------------------------------------ analyst
  app.get("/api/analysis", async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }).parse(req.query);
    return { budget: await analyst.budget(), items: await repo.listAnalyses(limit) };
  });

  app.post("/api/analysis/refresh", admin, async (_req, reply) => {
    if (!engine) return noFeed(reply);
    const result = await analyst.run({ kind: "manual" });
    if (result.analysis) broadcast("analysis", result.analysis);
    if (!result.analysis) return reply.code(429).send({ ok: false, reason: result.reason });
    return result;
  });

  // ------------------------------------------------------------ alerts
  app.get("/api/alerts/rules", async () => repo.listRules());

  const ruleBody = (body: unknown, id?: string) => {
    const raw = { ...(body as Record<string, unknown>), id: id ?? (body as { id?: string })?.id ?? randomUUID() };
    return alertRuleSchema.safeParse(raw);
  };
  app.post("/api/alerts/rules", admin, async (req, reply) => {
    const r = ruleBody(req.body);
    if (!r.success) return reply.code(400).send({ error: "invalid rule", issues: r.error.issues });
    await repo.saveRule(r.data);
    await engine?.reloadRules();
    return reply.code(201).send(r.data);
  });
  app.put<{ Params: { id: string } }>("/api/alerts/rules/:id", admin, async (req, reply) => {
    const r = ruleBody(req.body, req.params.id);
    if (!r.success) return reply.code(400).send({ error: "invalid rule", issues: r.error.issues });
    await repo.saveRule(r.data);
    await engine?.reloadRules();
    return r.data;
  });
  app.delete<{ Params: { id: string } }>("/api/alerts/rules/:id", admin, async (req, reply) => {
    const ok = await repo.deleteRule(req.params.id);
    await engine?.reloadRules();
    return ok ? { ok } : reply.code(404).send({ error: "not found" });
  });

  app.get("/api/alerts/events", async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50), before: z.coerce.number().optional() }).parse(req.query);
    return repo.listAlertEvents({ limit: q.limit, before: q.before });
  });
  app.post<{ Params: { id: string } }>("/api/alerts/events/:id/ack", admin, async (req) => {
    await repo.acknowledgeAlert(req.params.id, Date.now());
    return { ok: true };
  });

  // ------------------------------------------------------------ history
  app.get("/api/history", async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), before: z.coerce.number().optional() }).parse(req.query);
    const events = await repo.listAlertEvents({ limit: q.limit, before: q.before });
    const outcomes = await repo.listOutcomes(events.map((e) => e.id));
    return events.map((e) => ({ ...e, outcomes: outcomes.filter((o) => o.alertId === e.id) }));
  });
  app.get<{ Params: { id: string } }>("/api/history/:id", async (req, reply) => {
    const e = await repo.getAlertEvent(req.params.id);
    if (!e) return reply.code(404).send({ error: "not found" });
    const [outcomes, snapshot] = await Promise.all([repo.listOutcomes([e.id]), e.snapshotId ? repo.getSnapshot(e.snapshotId) : null]);
    return { ...e, outcomes, snapshot };
  });
  app.get<{ Params: { id: string } }>("/api/snapshots/:id", async (req, reply) => {
    const s = await repo.getSnapshot(req.params.id);
    return s ?? reply.code(404).send({ error: "not found" });
  });

  // ------------------------------------------------------------ stream
  app.get("/api/stream", (req, reply) => {
    reply.hijack();
    const origin = req.headers.origin;
    const allowed = config.CORS_ORIGINS.split(",").map((s) => s.trim());
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...(origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    });
    const client: SseClient = { id: nextId++, reply, lastPriceAt: 0 };
    clients.add(client);
    reply.raw.write(`retry: 3000\n\n`);
    if (engine) reply.raw.write(`event: status\ndata: ${JSON.stringify(engine.status())}\n\n`);
    const ping = setInterval(() => reply.raw.write(`: ping\n\n`), 15_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      clients.delete(client);
    });
  });

  app.addHook("onClose", async () => {
    for (const c of clients) c.reply.raw.end();
    clients.clear();
  });

  return { app, broadcast };
}
