import { describe, expect, it } from "vitest";
import { marketSnapshotSchema, type MarketSnapshot } from "@gold/core";
import { AnalystService } from "../../src/ai/analyst";
import { MemoryRepository } from "../../src/db/memoryRepository";
import { fakeClaude } from "../support/fakeClaude";
import { fakeClock, testConfig } from "../support/helpers";

function snapshot(over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return marketSnapshotSchema.parse({
    snapshotVersion: 1,
    symbol: "XAU/USD",
    generatedAt: "2024-03-13T12:00:00.000Z",
    dataOrigin: "live",
    price: { value: 2160, kind: "indicative", executable: false, source: "twelvedata-ws", providerTime: "2024-03-13T11:59:59.000Z", receivedAt: "2024-03-13T12:00:00.000Z", ageMs: 500, freshness: "fresh" },
    session: { open: true, reason: "open" },
    feed: { connection: "connected", latencyMs: 250 },
    timeframes: [{ timeframe: "1h", lastClosedOpenTime: "2024-03-13T10:00:00.000Z", lastClosedCloseTime: "2024-03-13T11:00:00.000Z", candleStatus: "confirmed", barsUsed: 1000, close: 2158, ema20: 2150, ema50: 2140, ema200: 2100, rsi14: 60, atr14: 8, trend: "bullish", trendRules: [], structureTrend: "bullish", lastSwingHighRef: null, lastSwingLowRef: null, recentEvents: [] }],
    references: [
      { id: "PRICE", kind: "price", timeframe: null, price: 2160, description: "price" },
      { id: "1h:L:a", kind: "level", timeframe: "1h", price: 2170, description: "r" },
      { id: "1h:L:b", kind: "level", timeframe: "1h", price: 2185, description: "r" },
      { id: "1h:L:c", kind: "level", timeframe: "1h", price: 2145, description: "s" },
    ],
    trigger: { kind: "manual", eventIds: [] },
    dataQuality: [],
    ...over,
  });
}

function setup(behaviour: Parameters<typeof fakeClaude>[0] = "valid", cfg: Record<string, string> = {}, snap = snapshot()) {
  const repo = new MemoryRepository();
  const clock = fakeClock(Date.UTC(2024, 2, 13, 12));
  const fake = fakeClaude(behaviour);
  const svc = new AnalystService({
    config: testConfig({ ANTHROPIC_API_KEY: "x", ANALYST_AUTO_ENABLED: "true", ...cfg }),
    repo,
    now: clock.now,
    client: fake.client,
    snapshot: async () => ({ id: "snap-1", payload: snap }),
  });
  return { svc, repo, clock, fake };
}

describe("AnalystService", () => {
  it("sends the validated snapshot with structured output and stores a valid analysis", async () => {
    const { svc, fake, repo } = setup();
    const r = await svc.run({ kind: "manual" });
    expect(r.ok).toBe(true);
    const params = fake.calls[0]!.params as Record<string, any>;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config.effort).toBe("medium");
    expect(params.output_config.format).toBeDefined();
    expect(params.fallbacks).toBe("default");
    expect(fake.calls[0]!.snapshot.references.length).toBe(4);
    const [stored] = await repo.listAnalyses(1);
    expect(stored!.status).toBe("ok");
    expect(stored!.costUsd).toBeCloseTo((5000 * 4 + 1200 * 20) / 1e6, 8);
  });

  it("rejects outputs with invented prices or percentages", async () => {
    const { svc } = setup("invented_price");
    const r = await svc.run({ kind: "manual" });
    expect(r.ok).toBe(false);
    expect(r.analysis!.status).toBe("rejected_validation");
    expect(r.analysis!.errors!.join("\n")).toMatch(/unsupported number 9999.5/);
    expect(r.analysis!.errors!.join("\n")).toMatch(/percentage/);
  });

  it("records refusals and API errors without throwing", async () => {
    expect((await setup("refusal").svc.run({ kind: "manual" })).analysis!.status).toBe("refused");
    const e = await setup("throws").svc.run({ kind: "manual" });
    expect(e.analysis!.status).toBe("error");
    expect(e.analysis!.errors![0]).toMatch(/socket hang up/);
  });

  it("enforces manual and automatic cooldowns", async () => {
    const { svc, clock, fake } = setup();
    expect((await svc.run({ kind: "manual" })).ok).toBe(true);
    expect((await svc.run({ kind: "manual" })).reason).toMatch(/cooldown/);
    clock.advance(61_000);
    expect((await svc.run({ kind: "manual" })).ok).toBe(true);
    const ev = { kind: "event" as const, events: [{ id: "e1", description: "1h bos" }] };
    expect((await svc.run(ev)).ok).toBe(true);
    clock.advance(60_000);
    expect((await svc.run(ev)).reason).toMatch(/automatic analysis cooldown/);
    expect(fake.calls).toHaveLength(3);
  });

  it("enforces daily call and cost limits", async () => {
    const { svc, clock } = setup("valid", { ANALYST_MAX_CALLS_PER_DAY: "2", ANALYST_MANUAL_COOLDOWN_SEC: "0" });
    await svc.run({ kind: "manual" });
    await svc.run({ kind: "manual" });
    expect((await svc.run({ kind: "manual" })).reason).toBe("daily call limit reached");
    clock.advance(24 * 3600_000);
    expect((await svc.run({ kind: "manual" })).ok).toBe(true);
    const cost = setup("valid", { ANALYST_MAX_USD_PER_DAY: "0.01", ANALYST_MANUAL_COOLDOWN_SEC: "0" });
    await cost.svc.run({ kind: "manual" });
    expect((await cost.svc.run({ kind: "manual" })).reason).toBe("daily cost limit reached");
  });

  it("does not call Claude with stale or fixture snapshots unless allowed", async () => {
    const stale = snapshot({ price: { ...snapshot().price!, ageMs: 600_000, freshness: "stale" } });
    const a = setup("valid", {}, stale);
    const r = await a.svc.run({ kind: "manual" });
    expect(r.analysis!.status).toBe("skipped");
    expect(a.fake.calls).toHaveLength(0);
    const fx = setup("valid", { ANALYST_ALLOW_FIXTURE: "false" }, snapshot({ dataOrigin: "fixture" }));
    expect((await fx.svc.run({ kind: "manual" })).analysis!.errors).toContain("snapshot built from fixture data");
    expect(fx.fake.calls).toHaveLength(0);
  });

  it("is disabled without an API key", async () => {
    const svc = new AnalystService({ config: testConfig(), repo: new MemoryRepository(), now: Date.now, snapshot: async () => ({ id: "x", payload: snapshot() }) });
    expect(svc.enabled).toBe(false);
    expect((await svc.run({ kind: "manual" })).reason).toMatch(/ANTHROPIC_API_KEY/);
  });
});
