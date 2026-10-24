"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAdminToken } from "@/lib/auth";
import { fmtFull, fmtPrice } from "@/lib/format";
import type { Analysis, AnalystBudget, MarketSnapshot, SizerPreset } from "@/lib/types";
import { useNow } from "@/lib/useTerminal";
import { Badge, Button, Empty, Panel } from "./ui";

const ACTION: Record<string, { label: string; ar: string; tone: "warn" | "bull" | "bear" | "info" }> = {
  WAIT: { label: "WAIT", ar: "استنى", tone: "warn" },
  MONITOR_BULLISH_SCENARIO: { label: "Monitor bullish", ar: "راقب السيناريو الصاعد", tone: "bull" },
  MONITOR_BEARISH_SCENARIO: { label: "Monitor bearish", ar: "راقب السيناريو الهابط", tone: "bear" },
  MONITOR_BOTH: { label: "Monitor both", ar: "راقب الاتنين", tone: "info" },
};

export function AnalystPanel({ analysis, budget, onNew, disabled, onUseScenario }: { analysis: Analysis | null; budget: AnalystBudget | null; onNew: (a: Analysis) => void; disabled: boolean; onUseScenario?: (p: SizerPreset) => void }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const now = useNow();
  const token = useAdminToken();

  useEffect(() => {
    setSnapshot(null);
    if (!analysis?.snapshotId) return;
    api<{ payload: MarketSnapshot }>(`/api/snapshots/${analysis.snapshotId}`)
      .then((s) => setSnapshot(s.payload))
      .catch(() => setSnapshot(null));
  }, [analysis?.snapshotId]);

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ ok: boolean; reason?: string; analysis: Analysis }>("/api/analysis/refresh", { method: "POST" });
      onNew(r.analysis);
      if (!r.ok && r.reason) setMessage(r.reason);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cooldownLeft = budget?.nextManualAt ? Math.max(0, Math.ceil((budget.nextManualAt - now) / 1000)) : 0;
  const ref = (id: string) => snapshot?.references.find((r) => r.id === id);
  const out = analysis?.status === "ok" || analysis?.status === "rejected_validation" ? analysis.output : null;
  const action = out ? ACTION[out.action] : null;

  return (
    <Panel
      title={<>Claude analyst</>}
      right={
        <Button tone="gold" onClick={refresh} disabled={busy || disabled || !budget?.configured || !token || cooldownLeft > 0} title={!budget?.configured ? "ANTHROPIC_API_KEY not configured on the server" : !token ? "Unlock admin to run analysis" : undefined}>
          {busy ? "Analysing…" : cooldownLeft > 0 ? `Refresh (${cooldownLeft}s)` : "Refresh analysis"}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/70 px-4 py-1.5 text-[10.5px] text-ink-3">
        <span>{budget?.configured ? budget.model : "not configured"}</span>
        {budget && (
          <>
            <span className="num">
              calls {budget.callsToday}/{budget.maxCallsPerDay} · ${budget.usdToday.toFixed(3)}/${budget.maxUsdPerDay}
            </span>
            <span>auto: {budget.autoEnabled ? `on (cooldown ${Math.round(budget.autoCooldownSec / 60)}m)` : "off"}</span>
          </>
        )}
      </div>
      {message && <div className="border-b border-warn/30 bg-warn/5 px-4 py-1.5 text-[11.5px] text-warn">{message}</div>}
      {!analysis ? (
        <Empty>{budget?.configured ? "No analysis yet. Runs on meaningful events (BOS/CHoCH/trend change) or manual refresh." : "Set ANTHROPIC_API_KEY on the server to enable analysis."}</Empty>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
            <Badge tone={analysis.status === "ok" ? "bull" : analysis.status === "skipped" ? "neutral" : "bear"}>{analysis.status.replace("_", " ")}</Badge>
            {analysis.dataOrigin === "fixture" && <Badge tone="warn">fixture input</Badge>}
            <span className="num">{fmtFull(analysis.createdAt)}</span>
            <span>· {analysis.triggerKind === "manual" ? "manual" : analysis.triggerDetail?.events?.map((e) => e.description).join(", ")}</span>
          </div>

          {analysis.errors && analysis.errors.length > 0 && (
            <div className="rounded-md border border-bear/30 bg-bear/5 p-2 text-[11.5px] text-bear">
              <div className="mb-1 font-semibold">{analysis.status === "rejected_validation" ? "Output rejected by validation — not shown as analysis" : analysis.status === "skipped" ? "Analysis skipped" : "Analysis failed"}</div>
              <ul className="space-y-0.5">
                {analysis.errors.slice(0, 6).map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.status === "ok" && out && (
            <>
              {action && (
                <div className={`flex items-center justify-between rounded-md border px-3 py-2 ${action.tone === "warn" ? "border-warn/40 bg-warn/10" : action.tone === "bull" ? "border-bull/40 bg-bull/10" : action.tone === "bear" ? "border-bear/40 bg-bear/10" : "border-info/40 bg-info/10"}`}>
                  <span className="text-[13px] font-bold tracking-wider">{action.label}</span>
                  <span className="ar text-[13px] font-semibold">{action.ar}</span>
                </div>
              )}
              <div className="ar">
                <h3 className="text-[15px] font-semibold text-ink">{out.headline_ar}</h3>
                <p className="mt-1 text-[13px] text-ink-2">{out.summary_ar}</p>
              </div>
              {out.scenarios.map((sc, i) => (
                <div key={i} className={`rounded-md border p-3 ${sc.direction === "bullish" ? "border-bull/30" : "border-bear/30"}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <Badge tone={sc.direction === "bullish" ? "bull" : "bear"}>{sc.direction} scenario</Badge>
                    {onUseScenario && ref(sc.trigger_ref) && ref(sc.invalidation_ref) && (
                      <button
                        className="text-[11px] text-gold-2 hover:underline"
                        title="Prefill the USDT position sizer with this scenario's trigger, invalidation and targets"
                        onClick={() =>
                          onUseScenario({
                            side: sc.direction === "bullish" ? "long" : "short",
                            entry: ref(sc.trigger_ref)!.price,
                            stop: ref(sc.invalidation_ref)!.price,
                            targets: sc.target_refs.map((t) => ref(t)?.price).filter((v): v is number => typeof v === "number"),
                            label: `Claude ${sc.direction} scenario`,
                          })
                        }
                      >
                        Use in sizer →
                      </button>
                    )}
                  </div>
                  <div className="ar text-[13px]">
                    <div className="font-semibold text-ink">{sc.title_ar}</div>
                    <div className="text-ink-2">{sc.trigger_ar}</div>
                  </div>
                  <div className="num mt-2 grid grid-cols-3 gap-2 text-[11.5px]">
                    <RefCell label="Trigger" r={ref(sc.trigger_ref)} />
                    <RefCell label="Invalidation" r={ref(sc.invalidation_ref)} />
                    <RefCell label="Targets" r={sc.target_refs.map(ref).filter(Boolean)[0]} extra={sc.target_refs.length > 1 ? `+${sc.target_refs.length - 1}` : undefined} />
                  </div>
                  {sc.evidence.length > 0 && (
                    <ul className="ar mt-2 space-y-0.5 text-[12px] text-ink-2">
                      {sc.evidence.map((e, j) => (
                        <li key={j}>
                          • {e.explanation_ar} <span className="num text-[10.5px] text-ink-3" dir="ltr">[{e.ref}]</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {out.conflicting_signals.length > 0 && (
                <Section title="Conflicting signals">
                  {out.conflicting_signals.map((c, i) => (
                    <li key={i}>• {c.explanation_ar}</li>
                  ))}
                </Section>
              )}
              {out.wait_conditions.length > 0 && (
                <Section title="WAIT conditions">
                  {out.wait_conditions.map((w, i) => (
                    <li key={i}>• {w.condition_ar}</li>
                  ))}
                </Section>
              )}
              <p className="ar text-[11.5px] text-ink-3">{out.data_quality_ar}</p>
            </>
          )}
          <p className="text-[10.5px] leading-snug text-ink-3">
            Claude interprets a code-computed snapshot; levels are resolved from snapshot references, not written by the model. No confidence scores, no order execution.
            {analysis.costUsd != null && <span className="num"> · {analysis.inputTokens}+{analysis.outputTokens} tok · ${analysis.costUsd.toFixed(4)}</span>}
          </p>
        </div>
      )}
    </Panel>
  );
}

function RefCell({ label, r, extra }: { label: string; r?: { id: string; price: number; description: string }; extra?: string }) {
  return (
    <div className="rounded border border-line bg-panel-2 px-2 py-1" title={r ? `${r.id}: ${r.description}` : "unresolved"}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label} (USDT)</div>
      <div className="text-ink">
        {r ? fmtPrice(r.price) : "—"} {extra && <span className="text-ink-3">{extra}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="panel-title mb-1">{title}</div>
      <ul className="ar space-y-0.5 text-[12.5px] text-ink-2">{children}</ul>
    </div>
  );
}
