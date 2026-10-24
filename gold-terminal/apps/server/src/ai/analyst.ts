import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { analystOutputSchema, snapshotBlockers, validateAnalystOutput, type AnalystOutput, type MarketSnapshot } from "@gold/core";
import type { Config } from "../config";
import type { Repository, StoredAnalysis } from "../db/repository";
import { ANALYST_SYSTEM_PROMPT } from "./prompt";

/** The subset of the SDK the analyst uses, so tests can inject a recorded response. */
export interface AnalystClient {
  beta: { messages: { parse: Anthropic["beta"]["messages"]["parse"] } };
}

export type AnalystTrigger = { kind: "manual" } | { kind: "event"; events: { id: string; description: string }[] };

export interface AnalystDeps {
  config: Config;
  repo: Repository;
  now: () => number;
  /** Builds and persists a snapshot; returns its id and payload. */
  snapshot: (trigger: MarketSnapshot["trigger"]) => Promise<{ id: string; payload: MarketSnapshot }>;
  client?: AnalystClient | null;
}

export class AnalystService {
  private client: AnalystClient | null;
  private lastAutoAt = 0;
  private lastManualAt = 0;
  private inFlight: Promise<StoredAnalysis> | null = null;

  constructor(private deps: AnalystDeps) {
    const key = deps.config.ANTHROPIC_API_KEY;
    this.client = deps.client !== undefined ? deps.client : key ? new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000 }) : null;
  }

  get enabled() {
    return this.client !== null;
  }

  async budget() {
    const c = this.deps.config;
    const dayStart = new Date(this.deps.now());
    dayStart.setUTCHours(0, 0, 0, 0);
    const spent = await this.deps.repo.analysisSpendSince(dayStart.getTime());
    return {
      callsToday: spent.calls,
      maxCallsPerDay: c.ANALYST_MAX_CALLS_PER_DAY,
      usdToday: Math.round(spent.usd * 10000) / 10000,
      maxUsdPerDay: c.ANALYST_MAX_USD_PER_DAY,
      autoEnabled: c.ANALYST_AUTO_ENABLED,
      autoCooldownSec: c.ANALYST_AUTO_COOLDOWN_SEC,
      manualCooldownSec: c.ANALYST_MANUAL_COOLDOWN_SEC,
      nextManualAt: this.lastManualAt ? this.lastManualAt + c.ANALYST_MANUAL_COOLDOWN_SEC * 1000 : null,
      nextAutoAt: this.lastAutoAt ? this.lastAutoAt + c.ANALYST_AUTO_COOLDOWN_SEC * 1000 : null,
      model: c.ANTHROPIC_MODEL,
      configured: this.enabled,
    };
  }

  /** Reason a call may not be made right now, or null. Gates are checked before any snapshot or API call. */
  async gate(trigger: AnalystTrigger): Promise<string | null> {
    const c = this.deps.config;
    const now = this.deps.now();
    if (!this.client) return "ANTHROPIC_API_KEY is not configured";
    if (this.inFlight) return "an analysis is already running";
    if (trigger.kind === "event") {
      if (!c.ANALYST_AUTO_ENABLED) return "automatic analysis is disabled";
      if (now - this.lastAutoAt < c.ANALYST_AUTO_COOLDOWN_SEC * 1000) return "automatic analysis cooldown active";
    } else if (now - this.lastManualAt < c.ANALYST_MANUAL_COOLDOWN_SEC * 1000) {
      return `manual refresh cooldown: wait ${Math.ceil((this.lastManualAt + c.ANALYST_MANUAL_COOLDOWN_SEC * 1000 - now) / 1000)}s`;
    }
    const b = await this.budget();
    if (b.callsToday >= c.ANALYST_MAX_CALLS_PER_DAY) return "daily call limit reached";
    if (b.usdToday >= c.ANALYST_MAX_USD_PER_DAY) return "daily cost limit reached";
    return null;
  }

  async run(trigger: AnalystTrigger): Promise<{ ok: boolean; reason?: string; analysis?: StoredAnalysis }> {
    const blocked = await this.gate(trigger);
    if (blocked) return { ok: false, reason: blocked };
    const now = this.deps.now();
    if (trigger.kind === "event") this.lastAutoAt = now;
    else this.lastManualAt = now;
    this.inFlight = this.execute(trigger);
    try {
      const analysis = await this.inFlight;
      return { ok: analysis.status === "ok", analysis, reason: analysis.errors?.[0] };
    } finally {
      this.inFlight = null;
    }
  }

  private async execute(trigger: AnalystTrigger): Promise<StoredAnalysis> {
    const c = this.deps.config;
    const snapTrigger: MarketSnapshot["trigger"] = trigger.kind === "manual" ? { kind: "manual", eventIds: [] } : { kind: "event", eventIds: trigger.events.map((e) => e.id) };
    const { id: snapshotId, payload: snapshot } = await this.deps.snapshot(snapTrigger);
    const base: StoredAnalysis = {
      id: randomUUID(),
      createdAt: this.deps.now(),
      snapshotId,
      triggerKind: trigger.kind,
      triggerDetail: trigger.kind === "event" ? { events: trigger.events } : null,
      status: "skipped",
      model: c.ANTHROPIC_MODEL,
      servedModel: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      output: null,
      errors: null,
      dataOrigin: snapshot.dataOrigin,
    };

    const blockers = snapshotBlockers(snapshot, { allowFixture: c.ANALYST_ALLOW_FIXTURE, maxPriceAgeMs: c.PRICE_STALE_AFTER_MS });
    if (blockers.length) return this.save({ ...base, status: "skipped", errors: blockers });

    try {
      const response = await this.client!.beta.messages.parse({
        model: c.ANTHROPIC_MODEL,
        max_tokens: c.ANALYST_MAX_OUTPUT_TOKENS,
        system: ANALYST_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Market snapshot (JSON). Analyse it according to your instructions.\n\n${JSON.stringify(snapshot)}`,
          },
        ],
        output_config: { effort: c.ANALYST_EFFORT, format: betaZodOutputFormat(analystOutputSchema) },
        ...(c.ANALYST_USE_FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      const usage = response.usage;
      const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      const outputTokens = usage.output_tokens ?? 0;
      const costUsd = (inputTokens * c.ANALYST_INPUT_USD_PER_MTOK + outputTokens * c.ANALYST_OUTPUT_USD_PER_MTOK) / 1_000_000;
      const withUsage = { ...base, servedModel: response.model, inputTokens, outputTokens, costUsd };

      if (response.stop_reason === "refusal") {
        return this.save({ ...withUsage, status: "refused", errors: [`model declined (${response.stop_details?.category ?? "unspecified"})`] });
      }
      if (response.stop_reason === "max_tokens") {
        return this.save({ ...withUsage, status: "error", errors: ["response truncated at max_tokens"] });
      }
      // Re-validate independently of the SDK helper, then apply semantic checks.
      const shape = analystOutputSchema.safeParse(response.parsed_output);
      if (!shape.success) {
        return this.save({ ...withUsage, status: "rejected_validation", errors: shape.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      }
      const semantic = validateAnalystOutput(shape.data, snapshot);
      if (!semantic.ok) {
        return this.save({ ...withUsage, status: "rejected_validation", output: shape.data, errors: semantic.errors });
      }
      return this.save({ ...withUsage, status: "ok", output: shape.data });
    } catch (err) {
      return this.save({ ...base, status: "error", errors: [describeError(err)] });
    }
  }

  private async save(a: StoredAnalysis) {
    await this.deps.repo.saveAnalysis(a);
    return a;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic authentication failed (check ANTHROPIC_API_KEY)";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit; try again later";
  if (err instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return `analysis failed: ${(err as Error).message}`;
}

export type { AnalystOutput };
