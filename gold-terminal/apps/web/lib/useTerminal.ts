"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE } from "./api";
import type { AlertEvent, Analysis, ContractSpec, EngineStatus, MarketView, PriceView, TerminalState, Timeframe } from "./types";

export interface Terminal {
  state: TerminalState | null;
  market: MarketView | null;
  contract: ContractSpec | null;
  error: string | null;
  streamConnected: boolean;
  liveAlerts: AlertEvent[];
  latestAnalysis: Analysis | null;
  /** Increments per timeframe whenever the server confirms a candle close. */
  closeVersion: Partial<Record<Timeframe, number>>;
  anyCloseVersion: number;
  refresh: () => Promise<void>;
  setLatestAnalysis: (a: Analysis) => void;
  dismissAlert: (id: string) => void;
  notificationsEnabled: boolean;
  enableNotifications: () => Promise<void>;
}

export function useTerminal(): Terminal {
  const [state, setState] = useState<TerminalState | null>(null);
  const [market, setMarket] = useState<MarketView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<AlertEvent[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [closeVersion, setCloseVersion] = useState<Partial<Record<Timeframe, number>>>({});
  const [anyCloseVersion, setAnyCloseVersion] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const notifyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api<TerminalState>("/api/state");
      if (next.price) next.price.clientAt = Date.now();
      setState(next);
      setError(null);
    } catch (e) {
      setError(`Backend unreachable at ${API_BASE}: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(refresh, 15_000);
    api<MarketView>("/api/market").then(setMarket).catch(() => {});
    api<{ items: Analysis[] }>("/api/analysis?limit=1")
      .then((r) => r.items[0] && setLatestAnalysis(r.items[0]))
      .catch(() => {});
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      notifyRef.current = true;
      setNotificationsEnabled(true);
    }
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/stream`);
    es.onopen = () => setStreamConnected(true);
    es.onerror = () => setStreamConnected(false);
    es.addEventListener("price", (ev) => {
      const price = { ...(JSON.parse((ev as MessageEvent).data) as PriceView), clientAt: Date.now() };
      setState((s) => (s ? { ...s, price } : s));
    });
    es.addEventListener("market", (ev) => setMarket(JSON.parse((ev as MessageEvent).data) as MarketView));
    es.addEventListener("status", (ev) => {
      const status = JSON.parse((ev as MessageEvent).data) as EngineStatus;
      setState((s) => (s ? { ...s, status, connection: status.connection } : s));
    });
    es.addEventListener("alert", (ev) => {
      const alert = JSON.parse((ev as MessageEvent).data) as AlertEvent;
      setLiveAlerts((a) => [alert, ...a.filter((x) => x.id !== alert.id)].slice(0, 50));
      if (notifyRef.current && typeof Notification !== "undefined") {
        const tag = alert.dataOrigin === "fixture" ? "[FIXTURE] " : "";
        new Notification(`${tag}XAUUSDT · ${alert.title}`, { body: `Confirmed close · ${alert.price.toFixed(2)} USDT`, tag: alert.dedupeKey });
      }
    });
    es.addEventListener("analysis", (ev) => setLatestAnalysis(JSON.parse((ev as MessageEvent).data) as Analysis));
    es.addEventListener("close", (ev) => {
      const { timeframe } = JSON.parse((ev as MessageEvent).data) as { timeframe: Timeframe };
      setCloseVersion((v) => ({ ...v, [timeframe]: (v[timeframe] ?? 0) + 1 }));
      setAnyCloseVersion((n) => n + 1);
    });
    return () => es.close();
  }, []);

  const enableNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    notifyRef.current = p === "granted";
    setNotificationsEnabled(p === "granted");
  }, []);

  return {
    state,
    market,
    contract: market?.contract ?? state?.status?.contract ?? null,
    error,
    streamConnected,
    liveAlerts,
    latestAnalysis,
    closeVersion,
    anyCloseVersion,
    refresh,
    setLatestAnalysis,
    dismissAlert: (id) => setLiveAlerts((a) => a.filter((x) => x.id !== id)),
    notificationsEnabled,
    enableNotifications,
  };
}

/** Re-render periodically so ages and countdowns stay current. */
export function useNow(intervalMs = 1000) {
  // Starts at 0 so server and first client render match (avoids hydration mismatch).
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
