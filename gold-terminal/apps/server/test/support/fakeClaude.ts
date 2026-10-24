import type { AnalystOutput, MarketSnapshot } from "@gold/core";
import type { AnalystClient } from "../../src/ai/analyst";

export interface FakeCall {
  params: Record<string, unknown>;
  snapshot: MarketSnapshot;
}

/**
 * Stand-in for the Anthropic client. It answers like the model would, using
 * only references present in the snapshot it receives, so the full
 * validation path is exercised without network access or cost.
 */
export function fakeClaude(behaviour: "valid" | "invented_price" | "refusal" | "throws" = "valid") {
  const calls: FakeCall[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, unknown>) => {
          const content = (params.messages as { content: string }[])[0]!.content;
          const snapshot = JSON.parse(content.slice(content.indexOf("{"))) as MarketSnapshot;
          calls.push({ params, snapshot });
          if (behaviour === "throws") throw new Error("socket hang up");
          const usage = { input_tokens: 5000, output_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
          if (behaviour === "refusal") return { model: params.model, stop_reason: "refusal", stop_details: { category: null }, usage, parsed_output: null, content: [] };
          return { model: params.model, stop_reason: "end_turn", stop_details: null, usage, parsed_output: answer(snapshot, behaviour === "invented_price"), content: [] };
        },
      },
    },
  } as unknown as AnalystClient;
  return { client, calls };
}

function answer(s: MarketSnapshot, invent: boolean): AnalystOutput {
  const price = s.price?.value ?? s.timeframes[0]!.close!;
  const above = s.references.filter((r) => r.price > price).sort((a, b) => a.price - b.price);
  const below = s.references.filter((r) => r.price < price).sort((a, b) => b.price - a.price);
  const scenarios: AnalystOutput["scenarios"] = [];
  const target = above.find((r) => above[0] && r.price > above[0].price);
  if (above.length >= 2 && below.length >= 1 && target) {
    scenarios.push({
      direction: "bullish",
      title_ar: "سيناريو صاعد",
      trigger_ar: "إغلاق 1h فوق أقرب resistance",
      trigger_ref: above[0]!.id,
      invalidation_ref: below[0]!.id,
      target_refs: [target.id],
      evidence: [{ ref: above[0]!.id, explanation_ar: "أقرب resistance" }],
    });
  }
  return {
    bias: "neutral",
    headline_ar: invent ? "الهدف 9999.5 بنسبة نجاح 80%" : "السوق محتاج تأكيد",
    summary_ar: "الـ timeframes الكبيرة والصغيرة مش متفقين.",
    scenarios,
    conflicting_signals: [],
    wait_conditions: [{ condition_ar: "استنى إغلاق 1h واضح", refs: above[0] ? [above[0].id] : [] }],
    action: "WAIT",
    data_quality_ar: s.dataOrigin === "fixture" ? "البيانات fixture مش live" : "البيانات live",
  };
}
