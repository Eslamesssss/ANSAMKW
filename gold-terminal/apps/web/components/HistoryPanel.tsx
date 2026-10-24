"use client";

import { useEffect, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { fmtDateTime, fmtPrice, fmtSigned } from "@/lib/format";
import type { HistoryRow } from "@/lib/types";
import { Badge, Empty, Panel } from "./ui";

const HORIZONS = [
  { min: 15, label: "+15m" },
  { min: 60, label: "+1h" },
  { min: 240, label: "+4h" },
  { min: 1440, label: "+24h" },
];

export function HistoryPanel({ version }: { version: number }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<HistoryRow[]>("/api/history?limit=100")
        .then((r) => alive && (setRows(r), setError(null)))
        .catch((e) => alive && setError((e as Error).message));
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [version]);

  return (
    <Panel title="Event history" right={<span className="text-[10.5px] text-ink-3">outcomes measured on confirmed 1m closes after each alert</span>}>
      {!rows ? (
        <Empty>{error ?? "Loading…"}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No events recorded yet.</Empty>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[820px] text-[12px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-3">
                <th className="px-4 py-2 font-medium">Fired (Cairo)</th>
                <th className="px-2 py-2 font-medium">TF</th>
                <th className="px-2 py-2 font-medium">Event</th>
                <th className="px-2 py-2 text-right font-medium">Close</th>
                {HORIZONS.map((h) => (
                  <th key={h.min} className="px-2 py-2 text-right font-medium" title="Close change after horizon · max high / min low within it">
                    {h.label}
                  </th>
                ))}
                <th className="px-4 py-2 font-medium">Input</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line/60 align-top">
                  <td className="num px-4 py-2 text-ink-2">{fmtDateTime(r.triggeredAt)}</td>
                  <td className="px-2 py-2 font-semibold">{r.timeframe}</td>
                  <td className="px-2 py-2">
                    <div className="text-ink">{r.title}</div>
                    <div className="text-[10.5px] text-ink-3">
                      {r.ruleType}
                      {r.dataOrigin === "fixture" && <Badge tone="warn" className="ml-1">fixture</Badge>}
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-right text-ink">{fmtPrice(r.price)}</td>
                  {HORIZONS.map((h) => {
                    const o = r.outcomes.find((x) => x.horizonMin === h.min);
                    if (!o) return <td key={h.min} className="px-2 py-2 text-right text-ink-3">pending</td>;
                    if (o.status !== "complete") return <td key={h.min} className="px-2 py-2 text-right text-ink-3">{o.status.replace("_", " ")}</td>;
                    return (
                      <td key={h.min} className="num px-2 py-2 text-right">
                        <div className={o.changeAbs! >= 0 ? "text-bull" : "text-bear"}>{fmtSigned(o.changeAbs)}</div>
                        <div className="text-[10.5px] text-ink-3">
                          {fmtPrice(o.maxHigh)} / {fmtPrice(o.minLow)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2">
                    {r.snapshotId ? (
                      <a className="num text-[11px] text-gold-2 hover:underline" href={`${API_BASE}/api/snapshots/${r.snapshotId}`} target="_blank" rel="noreferrer">
                        snapshot {r.snapshotId.slice(0, 8)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
