import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MINUTE } from "@gold/core";
import { bootstrap } from "../../src/bootstrap";
import { MemoryRepository } from "../../src/db/memoryRepository";
import { FixtureAdapter } from "../../src/market/fixture";
import { fakeClaude } from "../support/fakeClaude";
import { fakeClock, manifest, silentLogger, SYNTHETIC_DIR, testConfig } from "../support/helpers";

const m = manifest();
const clock = fakeClock(Date.parse(m.replayStart));
// The fixture adapter's virtual clock follows the fake clock.
const realNow = { t: 0 };
const adapter = new FixtureAdapter(SYNTHETIC_DIR, 1, () => realNow.t);
const fake = fakeClaude("valid");
const TOKEN = "t".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };
let ctx: Awaited<ReturnType<typeof bootstrap>>;

beforeAll(async () => {
  ctx = await bootstrap({
    config: testConfig({ ANTHROPIC_API_KEY: "x", ANALYST_MANUAL_COOLDOWN_SEC: "0", ADMIN_API_TOKEN: TOKEN }),
    logger: silentLogger,
    repo: new MemoryRepository(),
    adapter,
    now: adapter.clock,
    analystClient: fake.client,
    startEngine: false,
  });
  await ctx.engine!.start({ timers: false });
});
afterAll(async () => {
  ctx.engine?.stop();
  await ctx.app.close();
});

const advance = async (ms: number) => {
  realNow.t += ms;
  clock.advance(ms);
  await new Promise((r) => setTimeout(r, 150)); // let fixture frames flush
  await ctx.engine!.tick();
};

describe("HTTP API (fixture replay)", () => {
  it("labels fixture data everywhere", async () => {
    const health = (await ctx.app.inject("/api/health")).json();
    expect(health).toMatchObject({ ok: true, dataMode: "fixture", feedRunning: true });
    await advance(30_000);
    const state = (await ctx.app.inject("/api/state")).json();
    expect(state.origin).toBe("fixture");
    expect(state.price.origin).toBe("fixture");
    expect(state.price.executable).toBe(false);
    expect(state.price.source).toMatch(/^fixture-synthetic/);
    const snap = (await ctx.app.inject("/api/snapshot")).json();
    expect(snap.dataOrigin).toBe("fixture");
    expect(snap.dataQuality[0]).toMatch(/FIXTURE DATA/);
  });

  it("serves chart data with indicators, levels and structure", async () => {
    const r = await ctx.app.inject("/api/candles?tf=1h&limit=300");
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.candles).toHaveLength(300);
    expect(d.ema200).toHaveLength(300);
    expect(d.ema200.every((v: number | null) => typeof v === "number")).toBe(true);
    expect(d.levels.length).toBeGreaterThan(0);
    expect(d.candles.every((c: { status: string }) => c.status !== "forming")).toBe(true);
    expect((await ctx.app.inject("/api/candles?tf=2h")).statusCode).toBe(400);
    const trend = (await ctx.app.inject("/api/trend")).json();
    expect(trend).toHaveLength(6);
  });

  it("manages alert rules and validates input", async () => {
    const created = await ctx.app.inject({ method: "POST", url: "/api/alerts/rules", headers: auth, payload: { name: "1m close", type: "candle_close", timeframe: "1m" } });
    expect(created.statusCode).toBe(201);
    const bad = await ctx.app.inject({ method: "POST", url: "/api/alerts/rules", headers: auth, payload: { name: "x", type: "level_cross", timeframe: "7m" } });
    expect(bad.statusCode).toBe(400);
    const rules = (await ctx.app.inject("/api/alerts/rules")).json();
    expect(rules.some((r: { id: string }) => r.id === created.json().id)).toBe(true);
    expect(rules.some((r: { id: string }) => r.id.startsWith("default-"))).toBe(true);
  });

  it("records alerts on confirmed closes with snapshot references and outcomes", async () => {
    await advance(2 * MINUTE + 5_000);
    const history = (await ctx.app.inject("/api/history?limit=20")).json();
    const mine = history.filter((h: { ruleType: string }) => h.ruleType === "candle_close");
    expect(mine.length).toBeGreaterThanOrEqual(2);
    const detail = (await ctx.app.inject(`/api/history/${mine[0].id}`)).json();
    expect(detail.snapshot.payload.dataOrigin).toBe("fixture");
    expect(detail.snapshot.sha256).toMatch(/^[0-9a-f]{64}$/);
    // 15-minute horizon outcome after enough virtual time.
    await advance(16 * MINUTE);
    await ctx.engine!.evaluateOutcomes();
    const after = (await ctx.app.inject(`/api/history/${mine.at(-1).id}`)).json();
    const o15 = after.outcomes.find((o: { horizonMin: number }) => o.horizonMin === 15);
    expect(o15.status).toBe("complete");
    expect(o15.barsSeen).toBe(15);
  });

  it("runs a manual Claude analysis on the validated snapshot", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/api/analysis/refresh", headers: auth });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.analysis.status).toBe("ok");
    expect(body.analysis.dataOrigin).toBe("fixture");
    const sent = fake.calls.at(-1)!.snapshot;
    expect(sent.references.length).toBeGreaterThan(5);
    expect(sent.timeframes.map((t) => t.timeframe)).toEqual(["1m", "5m", "15m", "1h", "4h", "1d"]);
    const list = (await ctx.app.inject("/api/analysis?limit=5")).json();
    expect(list.items[0].id).toBe(body.analysis.id);
    expect(list.budget.callsToday).toBe(1);
  });

  it("streams server-sent events", async () => {
    await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    const port = (ctx.app.server.address() as { port: number }).port;
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/stream`, { signal: ac.signal });
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    let text = "";
    while (!text.includes("event: status")) text += new TextDecoder().decode((await reader.read()).value);
    ac.abort();
    expect(text).toMatch(/"origin":"fixture"/);
  });
});

describe("admin authentication", () => {
  const mutating = [
    { method: "POST", url: "/api/analysis/refresh" },
    { method: "POST", url: "/api/alerts/rules", payload: { name: "n", type: "trend_change", timeframe: "1h" } },
    { method: "PUT", url: "/api/alerts/rules/default-trend-1h", payload: { name: "n", type: "trend_change", timeframe: "1h" } },
    { method: "DELETE", url: "/api/alerts/rules/default-trend-1h" },
    { method: "POST", url: "/api/alerts/events/00000000-0000-0000-0000-000000000000/ack" },
    { method: "GET", url: "/api/auth/check" },
  ] as const;

  it("rejects mutating requests without a valid bearer token", async () => {
    const calls = fake.calls.length;
    for (const r of mutating) {
      const none = await ctx.app.inject({ ...r });
      expect(none.statusCode, `${r.method} ${r.url}`).toBe(401);
      expect(none.headers["www-authenticate"]).toMatch(/^Bearer/);
      const wrong = await ctx.app.inject({ ...r, headers: { authorization: `Bearer ${"x".repeat(40)}` } });
      expect(wrong.statusCode, `${r.method} ${r.url}`).toBe(401);
      const malformed = await ctx.app.inject({ ...r, headers: { authorization: TOKEN } });
      expect(malformed.statusCode).toBe(401);
    }
    // Nothing was changed or spent.
    expect(fake.calls.length).toBe(calls);
    expect((await ctx.repo.listRules()).some((r) => r.id === "default-trend-1h")).toBe(true);
  });

  it("accepts the correct token and keeps read endpoints public", async () => {
    expect((await ctx.app.inject({ url: "/api/auth/check", headers: auth })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "DELETE", url: "/api/alerts/rules/default-trend-1h", headers: auth })).statusCode).toBe(200);
    for (const url of ["/api/state", "/api/trend", "/api/alerts/rules", "/api/history", "/api/analysis"]) {
      expect((await ctx.app.inject(url)).statusCode, url).toBe(200);
    }
    expect((await ctx.app.inject("/api/health")).json().adminAuthConfigured).toBe(true);
  });

  it("fails closed when no admin token is configured", async () => {
    const b = await bootstrap({ config: testConfig({ ADMIN_API_TOKEN: "" }), logger: silentLogger, repo: new MemoryRepository(), adapter: new FixtureAdapter(SYNTHETIC_DIR), startEngine: false });
    const r = await b.app.inject({ method: "POST", url: "/api/alerts/rules", headers: auth, payload: { name: "n", type: "trend_change", timeframe: "1h" } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toBe("admin_token_not_configured");
    expect((await b.repo.listRules()).some((x) => x.name === "n")).toBe(false);
    await b.app.close();
  });

  it("refuses to register a mutating route without the guard", async () => {
    const b = await bootstrap({ config: testConfig({ ADMIN_API_TOKEN: TOKEN }), logger: silentLogger, repo: new MemoryRepository(), adapter: new FixtureAdapter(SYNTHETIC_DIR), startEngine: false });
    expect(() => b.app.post("/api/unguarded", async () => ({}))).toThrow(/must use the admin guard/);
    expect(() => b.app.get("/api/read-only", async () => ({}))).not.toThrow();
    await b.app.close();
  });

  it("rejects short tokens in configuration", () => {
    expect(() => testConfig({ ADMIN_API_TOKEN: "short" })).toThrow(/at least 32/);
  });
});

describe("HTTP API without credentials", () => {
  it("reports no_credentials and never shows a price", async () => {
    const b = await bootstrap({ config: testConfig({ DATA_MODE: "live", TWELVEDATA_API_KEY: "" }), logger: silentLogger, repo: new MemoryRepository(), startEngine: false });
    const state = (await b.app.inject("/api/state")).json();
    expect(state.connection).toBe("no_credentials");
    expect(state.price).toBeNull();
    expect((await b.app.inject("/api/candles?tf=1h")).statusCode).toBe(503);
    await b.app.close();
  });
});
