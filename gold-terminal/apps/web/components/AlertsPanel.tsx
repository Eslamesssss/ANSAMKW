"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime, fmtPrice } from "@/lib/format";
import type { AlertEvent, AlertRule, Timeframe } from "@/lib/types";
import { TIMEFRAMES } from "./ChartPanel";
import { Badge, Button, Empty, Panel } from "./ui";

type RuleType = AlertRule["type"];

const TYPE_LABEL: Record<RuleType, string> = {
  candle_close: "Candle close",
  level_cross: "Level cross",
  structure_break: "Structure break",
  trend_change: "Trend change",
};

function describe(r: AlertRule) {
  switch (r.type) {
    case "candle_close":
      return r.condition ? `close ${r.condition.op} ${r.condition.price}` : "every confirmed close";
    case "level_cross":
      return r.source === "manual" ? `close crosses ${r.price} (${r.direction})` : `detected S/R breakout (${r.direction})`;
    case "structure_break":
      return `${r.kinds.map((k) => k.toUpperCase()).join("/")} ${r.direction}`;
    case "trend_change":
      return `trend → ${r.to}`;
  }
}

export function AlertsPanel({ live, onDismiss, notificationsEnabled, onEnableNotifications }: { live: AlertEvent[]; onDismiss: (id: string) => void; notificationsEnabled: boolean; onEnableNotifications: () => void }) {
  const [tab, setTab] = useState<"feed" | "rules">("feed");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [recent, setRecent] = useState<AlertEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRules = () => api<AlertRule[]>("/api/alerts/rules").then(setRules).catch((e) => setError((e as Error).message));
  useEffect(() => {
    void loadRules();
    api<AlertEvent[]>("/api/alerts/events?limit=30").then(setRecent).catch(() => {});
  }, []);
  useEffect(() => {
    if (live[0]) setRecent((r) => [live[0]!, ...r.filter((x) => x.id !== live[0]!.id)].slice(0, 50));
  }, [live]);

  const ack = async (id: string) => {
    await api(`/api/alerts/events/${id}/ack`, { method: "POST" }).catch(() => {});
    setRecent((r) => r.map((a) => (a.id === id ? { ...a, acknowledgedAt: Date.now() } : a)));
    onDismiss(id);
  };
  const toggle = async (r: AlertRule) => {
    await api(`/api/alerts/rules/${r.id}`, { method: "PUT", body: JSON.stringify({ ...r, enabled: !r.enabled }) });
    void loadRules();
  };
  const remove = async (r: AlertRule) => {
    await api(`/api/alerts/rules/${r.id}`, { method: "DELETE" });
    void loadRules();
  };

  const unacked = recent.filter((a) => !a.acknowledgedAt).length;
  return (
    <Panel
      title={
        <>
          Smart alerts {unacked > 0 && <Badge tone="gold">{unacked} new</Badge>}
        </>
      }
      right={
        <div className="flex items-center gap-1">
          <TabButton on={tab === "feed"} onClick={() => setTab("feed")}>Feed</TabButton>
          <TabButton on={tab === "rules"} onClick={() => setTab("rules")}>Rules ({rules.length})</TabButton>
        </div>
      }
    >
      {tab === "feed" ? (
        <>
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-1.5 text-[10.5px] text-ink-3">
            <span>Confirmed candle closes only · deduplicated</span>
            {!notificationsEnabled && <button className="text-gold-2 hover:underline" onClick={onEnableNotifications}>Enable browser notifications</button>}
          </div>
          {recent.length === 0 ? (
            <Empty>No alerts yet.</Empty>
          ) : (
            <ul className="max-h-[360px] divide-y divide-line/60 overflow-y-auto">
              {recent.map((a) => (
                <li key={a.id} className={`flex items-start justify-between gap-3 px-4 py-2 ${a.acknowledgedAt ? "opacity-55" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                      <Badge tone="neutral">{a.timeframe}</Badge>
                      <span className="truncate">{a.title}</span>
                      {a.dataOrigin === "fixture" && <Badge tone="warn">fixture</Badge>}
                      {Boolean(a.detail?.late) && <Badge tone="warn">late</Badge>}
                    </div>
                    <div className="num mt-0.5 text-[11px] text-ink-3">
                      close {fmtPrice(a.price)} · candle {fmtDateTime(a.candleOpenTime)} · fired {fmtDateTime(a.triggeredAt)}
                    </div>
                  </div>
                  {!a.acknowledgedAt && <Button onClick={() => ack(a.id)}>Ack</Button>}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div>
          {error && <div className="px-4 py-2 text-[11.5px] text-bear">{error}</div>}
          <ul className="max-h-[260px] divide-y divide-line/60 overflow-y-auto">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[12px]">
                <div className="min-w-0">
                  <div className={`truncate font-medium ${r.enabled ? "text-ink" : "text-ink-3 line-through"}`}>{r.name}</div>
                  <div className="truncate text-[11px] text-ink-3">
                    {r.timeframe} · {TYPE_LABEL[r.type]} · {describe(r)}
                    {r.cooldownSec ? ` · cooldown ${r.cooldownSec}s` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button onClick={() => toggle(r)}>{r.enabled ? "Disable" : "Enable"}</Button>
                  <Button tone="danger" onClick={() => remove(r)}>✕</Button>
                </div>
              </li>
            ))}
          </ul>
          <RuleForm onCreated={loadRules} />
        </div>
      )}
    </Panel>
  );
}

function RuleForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<RuleType>("level_cross");
  const [tf, setTf] = useState<Timeframe>("15m");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState("any");
  const [op, setOp] = useState("above");
  const [kinds, setKinds] = useState("bos,choch");
  const [to, setTo] = useState("any");
  const [cooldown, setCooldown] = useState("0");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const base = { name: name || `${tf} ${TYPE_LABEL[type]}`, type, timeframe: tf, cooldownSec: Number(cooldown) || 0, enabled: true };
    const p = price ? Number(price) : null;
    const body =
      type === "candle_close"
        ? { ...base, condition: p ? { op, price: p } : null }
        : type === "level_cross"
          ? { ...base, source: p ? "manual" : "detected", price: p, direction }
          : type === "structure_break"
            ? { ...base, kinds: kinds.split(","), direction: direction === "up" ? "bullish" : direction === "down" ? "bearish" : "any" }
            : { ...base, to };
    try {
      await api("/api/alerts/rules", { method: "POST", body: JSON.stringify(body) });
      setName("");
      setPrice("");
      setMsg("Rule created");
      onCreated();
    } catch (err) {
      setMsg(err instanceof ApiError ? JSON.stringify((err.body as { issues?: unknown })?.issues ?? err.message).slice(0, 200) : (err as Error).message);
    }
  };

  const input = "w-full rounded border border-line-2 bg-panel-2 px-2 py-1 text-[12px] text-ink outline-none focus:border-gold/60";
  return (
    <form onSubmit={submit} className="space-y-2 border-t border-line px-4 py-3">
      <div className="panel-title">New rule</div>
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={type} onChange={(e) => setType(e.target.value as RuleType)}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className={input} value={tf} onChange={(e) => setTf(e.target.value as Timeframe)}>
          {TIMEFRAMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(type === "level_cross" || type === "candle_close") && (
          <input className={`${input} num`} placeholder={type === "level_cross" ? "Price (blank = detected levels)" : "Price (optional)"} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        )}
        {type === "candle_close" && price && (
          <select className={input} value={op} onChange={(e) => setOp(e.target.value)}>
            <option value="above">close above</option>
            <option value="below">close below</option>
          </select>
        )}
        {(type === "level_cross" || type === "structure_break") && (
          <select className={input} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="any">any direction</option>
            <option value="up">{type === "structure_break" ? "bullish" : "up"}</option>
            <option value="down">{type === "structure_break" ? "bearish" : "down"}</option>
          </select>
        )}
        {type === "structure_break" && (
          <select className={input} value={kinds} onChange={(e) => setKinds(e.target.value)}>
            <option value="bos,choch">BOS + CHoCH</option>
            <option value="bos">BOS only</option>
            <option value="choch">CHoCH only</option>
          </select>
        )}
        {type === "trend_change" && (
          <select className={input} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="any">to any state</option>
            <option value="bullish">to bullish</option>
            <option value="bearish">to bearish</option>
            <option value="neutral">to neutral</option>
          </select>
        )}
        <input className={`${input} num`} placeholder="Cooldown (s)" value={cooldown} onChange={(e) => setCooldown(e.target.value)} inputMode="numeric" />
        <input className={`${input} col-span-2`} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-3">{msg}</span>
        <Button tone="gold" type="submit">Add rule</Button>
      </div>
    </form>
  );
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded px-2 py-0.5 text-[11.5px] font-semibold ${on ? "bg-white/8 text-ink" : "text-ink-3 hover:text-ink"}`}>
      {children}
    </button>
  );
}
