import { z } from "zod";
import type { MarketSnapshot } from "./snapshot";

/**
 * Structured output contract for the AI analyst. The model never writes a
 * price into a structured field: it cites reference ids from the snapshot and
 * the server resolves them. There is no confidence field by design.
 */
const evidence = z.object({ ref: z.string(), explanation_ar: z.string() });

export const analystOutputSchema = z.object({
  bias: z.enum(["bullish", "bearish", "neutral", "conflicted"]),
  headline_ar: z.string(),
  summary_ar: z.string(),
  scenarios: z.array(
    z.object({
      direction: z.enum(["bullish", "bearish"]),
      title_ar: z.string(),
      trigger_ar: z.string(),
      trigger_ref: z.string(),
      invalidation_ref: z.string(),
      target_refs: z.array(z.string()),
      evidence: z.array(evidence),
    }),
  ),
  conflicting_signals: z.array(z.object({ explanation_ar: z.string(), refs: z.array(z.string()) })),
  wait_conditions: z.array(z.object({ condition_ar: z.string(), refs: z.array(z.string()) })),
  action: z.enum(["WAIT", "MONITOR_BULLISH_SCENARIO", "MONITOR_BEARISH_SCENARIO", "MONITOR_BOTH"]),
  data_quality_ar: z.string(),
});
export type AnalystOutput = z.infer<typeof analystOutputSchema>;

export interface AnalystValidation {
  ok: boolean;
  errors: string[];
}

const EASTERN_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(EASTERN_DIGITS.indexOf(d))).replace(/٫/g, ".").replace(/٬/g, ",");
}

/** All free-text fields of an output, for content checks. */
function texts(o: AnalystOutput): string[] {
  return [
    o.headline_ar,
    o.summary_ar,
    o.data_quality_ar,
    ...o.scenarios.flatMap((s) => [s.title_ar, s.trigger_ar, ...s.evidence.map((e) => e.explanation_ar)]),
    ...o.conflicting_signals.map((c) => c.explanation_ar),
    ...o.wait_conditions.map((w) => w.condition_ar),
  ];
}

/**
 * Semantic validation on top of the Zod shape:
 * 1. every cited ref exists in the snapshot;
 * 2. scenario geometry is coherent (bullish invalidation below its trigger, etc.);
 * 3. no percentages anywhere (no invented confidence/probability numbers);
 * 4. every price-like number in free text matches a snapshot number.
 */
export function validateAnalystOutput(o: AnalystOutput, s: MarketSnapshot): AnalystValidation {
  const errors: string[] = [];
  const refs = new Map(s.references.map((r) => [r.id, r]));
  const need = (id: string, where: string) => {
    if (!refs.has(id)) errors.push(`${where}: unknown reference "${id}"`);
  };

  o.scenarios.forEach((sc, i) => {
    const where = `scenarios[${i}]`;
    need(sc.trigger_ref, `${where}.trigger_ref`);
    need(sc.invalidation_ref, `${where}.invalidation_ref`);
    sc.target_refs.forEach((t) => need(t, `${where}.target_refs`));
    sc.evidence.forEach((e) => need(e.ref, `${where}.evidence`));
    const trig = refs.get(sc.trigger_ref);
    const inv = refs.get(sc.invalidation_ref);
    if (trig && inv) {
      if (sc.direction === "bullish" && !(inv.price < trig.price)) errors.push(`${where}: bullish invalidation must be below trigger`);
      if (sc.direction === "bearish" && !(inv.price > trig.price)) errors.push(`${where}: bearish invalidation must be above trigger`);
    }
    for (const t of sc.target_refs) {
      const tr = refs.get(t);
      if (tr && trig) {
        if (sc.direction === "bullish" && tr.price <= trig.price) errors.push(`${where}: bullish target ${t} not above trigger`);
        if (sc.direction === "bearish" && tr.price >= trig.price) errors.push(`${where}: bearish target ${t} not below trigger`);
      }
    }
  });
  o.conflicting_signals.forEach((c, i) => c.refs.forEach((r) => need(r, `conflicting_signals[${i}]`)));
  o.wait_conditions.forEach((w, i) => w.refs.forEach((r) => need(r, `wait_conditions[${i}]`)));

  if (o.action === "MONITOR_BULLISH_SCENARIO" && !o.scenarios.some((s) => s.direction === "bullish")) errors.push("action references a missing bullish scenario");
  if (o.action === "MONITOR_BEARISH_SCENARIO" && !o.scenarios.some((s) => s.direction === "bearish")) errors.push("action references a missing bearish scenario");

  const known = knownNumbers(s);
  for (const raw of texts(o)) {
    const t = normalizeDigits(raw);
    if (/\d\s*[%٪]|[%٪]\s*\d/.test(t)) errors.push(`percentage found in text: "${raw.slice(0, 80)}"`);
    for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const n = Number(m[0].replace(/,/g, ""));
      // Only price-like magnitudes are checked; small numbers (RSI, counts, timeframes) are allowed.
      if (n < 500) continue;
      const tol = Math.max(0.5, n * 0.0002);
      if (!known.some((k) => Math.abs(k - n) <= tol)) errors.push(`unsupported number ${m[0]} in text: "${raw.slice(0, 80)}"`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function knownNumbers(s: MarketSnapshot): number[] {
  const out: number[] = s.references.map((r) => r.price);
  if (s.price) out.push(s.price.value);
  for (const t of s.timeframes) {
    for (const v of [t.close, t.ema20, t.ema50, t.ema200, t.atr14]) if (v !== null) out.push(v);
    for (const e of t.recentEvents) if (e.level !== null) out.push(e.level);
  }
  // Years in dates are legitimate numbers too.
  const year = new Date(s.generatedAt).getUTCFullYear();
  out.push(year, year - 1);
  return out;
}

/** Resolve a ref id to its snapshot entry, for display. */
export function resolveRef(s: MarketSnapshot, id: string) {
  return s.references.find((r) => r.id === id) ?? null;
}
