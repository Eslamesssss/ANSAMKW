"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import type { ChartData, PriceView, Timeframe } from "@/lib/types";
import { Badge, Panel } from "./ui";

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const TF_MS: Record<Timeframe, number> = { "1m": 60e3, "5m": 300e3, "15m": 900e3, "1h": 3600e3, "4h": 14400e3, "1d": 86400e3 };

const COLORS = { bull: "#22c08a", bear: "#f0525a", ema20: "#4aa3f0", ema50: "#d6a84a", ema200: "#b07cf0", grid: "#141a23", text: "#8b95a5", forming: "rgba(214,168,74,0.45)" };

const cairoTick = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false });
const cairoDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "short" });
const cairoCross = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const sec = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

export function ChartPanel({ tf, onTf, price, closeVersion, onData }: { tf: Timeframe; onTf: (tf: Timeframe) => void; price: PriceView | null; closeVersion: number; onData: (d: ChartData | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<{ candles: ISeriesApi<"Candlestick">; e20: ISeriesApi<"Line">; e50: ISeriesApi<"Line">; e200: ISeriesApi<"Line">; markers: ISeriesMarkersPluginApi<Time> } | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const lastBar = useRef<{ openTime: number; open: number; high: number; low: number; close: number; formingFromServer: boolean } | null>(null);
  const lastClosedOpen = useRef<number>(0);
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState({ ema: true, levels: true, structure: true });

  // Create the chart once.
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: COLORS.text, fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 11 },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1d2531" },
      timeScale: {
        borderColor: "#1d2531",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: Time) => {
          const d = new Date((t as number) * 1000);
          const hm = cairoTick.format(d);
          return hm === "00:00" ? cairoDay.format(d) : hm;
        },
      },
      localization: { timeFormatter: (t: Time) => `${cairoCross.format(new Date((t as number) * 1000))} Cairo`, priceFormatter: (p: number) => p.toFixed(2) },
    });
    const candles = c.addSeries(CandlestickSeries, { upColor: COLORS.bull, downColor: COLORS.bear, borderVisible: false, wickUpColor: COLORS.bull, wickDownColor: COLORS.bear, priceLineVisible: true });
    const line = (color: string) => c.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    series.current = { candles, e20: line(COLORS.ema20), e50: line(COLORS.ema50), e200: line(COLORS.ema200), markers: createSeriesMarkers(candles, []) };
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  // Load data on timeframe change and on each confirmed close.
  useEffect(() => {
    let cancelled = false;
    api<ChartData>(`/api/candles?tf=${tf}&limit=400`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        onData(d);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
        setData(null);
        onData(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tf, closeVersion]);

  // Push data to the chart.
  useEffect(() => {
    const s = series.current;
    if (!s || !chart.current) return;
    if (!data) {
      s.candles.setData([]);
      s.e20.setData([]);
      s.e50.setData([]);
      s.e200.setData([]);
      s.markers.setMarkers([]);
      return;
    }
    const bars: CandlestickData<Time>[] = data.candles.map((c) => ({ time: sec(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close }));
    const lastClosed = data.candles.at(-1);
    lastClosedOpen.current = lastClosed?.openTime ?? 0;
    if (data.forming && (!lastClosed || data.forming.openTime > lastClosed.openTime)) {
      bars.push(formingBar(data.forming));
      lastBar.current = { ...data.forming, formingFromServer: true };
    } else lastBar.current = null;
    s.candles.setData(bars);
    const lineData = (vals: (number | null)[]): LineData<Time>[] => vals.flatMap((v, i) => (v === null || !data.candles[i] ? [] : [{ time: sec(data.candles[i]!.openTime), value: v }]));
    s.e20.setData(show.ema ? lineData(data.ema20) : []);
    s.e50.setData(show.ema ? lineData(data.ema50) : []);
    s.e200.setData(show.ema ? lineData(data.ema200) : []);

    for (const pl of priceLines.current) s.candles.removePriceLine(pl);
    priceLines.current = [];
    if (show.levels) {
      // Strongest nearby levels only: up to 3 per side, preferring more touches.
      const pick = (role: string) => data.levels.filter((l) => l.role === role).sort((a, b) => a.distance - b.distance).slice(0, 3);
      for (const l of [...pick("resistance"), ...pick("support")]) {
        priceLines.current.push(
          s.candles.createPriceLine({ price: l.price, color: l.role === "resistance" ? "rgba(240,82,90,0.55)" : "rgba(34,192,138,0.55)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${l.role === "resistance" ? "R" : "S"}×${l.touches}` }),
        );
      }
    }

    const firstTime = data.candles[0]?.openTime ?? 0;
    const markers: SeriesMarker<Time>[] = [];
    if (show.structure) {
      // Label only the most recent swings to keep the chart readable.
      for (const sw of data.swings.slice(-24)) {
        if (sw.openTime < firstTime || sw.label === "FIRST") continue;
        markers.push({ time: sec(sw.openTime), position: sw.type === "high" ? "aboveBar" : "belowBar", shape: "circle", size: 0.4, color: sw.type === "high" ? "#f0a8ac" : "#9fe3c8", text: sw.label });
      }
      for (const e of data.events) {
        if (e.openTime < firstTime) continue;
        if (e.kind === "bos" || e.kind === "choch") {
          markers.push({ time: sec(e.openTime), position: e.direction === "bullish" ? "belowBar" : "aboveBar", shape: e.direction === "bullish" ? "arrowUp" : "arrowDown", color: e.kind === "choch" ? "#f2a33a" : e.direction === "bullish" ? COLORS.bull : COLORS.bear, text: e.kind.toUpperCase() });
        } else if (e.kind === "retest") {
          markers.push({ time: sec(e.openTime), position: e.direction === "bullish" ? "belowBar" : "aboveBar", shape: "square", size: 0.6, color: "#4aa3f0", text: "RT" });
        }
      }
      markers.sort((a, b) => (a.time as number) - (b.time as number));
    }
    s.markers.setMarkers(markers);
  }, [data, show]);

  // Live updates to the provisional (forming) bar from streamed prices.
  useEffect(() => {
    const s = series.current;
    if (!s || !price || price.price === null || price.providerTime === null || !data) return;
    const open = Math.floor(price.providerTime / TF_MS[tf]) * TF_MS[tf];
    if (open <= lastClosedOpen.current) return;
    const cur = lastBar.current;
    const next = !cur || cur.openTime !== open ? { openTime: open, open: price.price, high: price.price, low: price.price, close: price.price, formingFromServer: false } : { ...cur, high: Math.max(cur.high, price.price), low: Math.min(cur.low, price.price), close: price.price };
    lastBar.current = next;
    try {
      s.candles.update(formingBar(next));
    } catch {
      /* out-of-order update after a reload: ignore, next reload fixes it */
    }
  }, [price, tf, data]);

  const last = data?.candles.at(-1);
  return (
    <Panel
      title={
        <>
          Chart <Badge tone="neutral">{tf}</Badge>
          {data?.origin === "fixture" && <Badge tone="warn">fixture</Badge>}
        </>
      }
      right={
        <div className="flex flex-wrap items-center gap-1">
          {TIMEFRAMES.map((t) => (
            <button key={t} onClick={() => onTf(t)} className={`num rounded px-2 py-0.5 text-[11.5px] font-semibold ${t === tf ? "bg-gold/20 text-gold-2" : "text-ink-3 hover:text-ink"}`}>
              {t}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line/70 px-4 py-1.5 text-[11px] text-ink-3">
        <Toggle on={show.ema} onClick={() => setShow((v) => ({ ...v, ema: !v.ema }))}>
          <span style={{ color: COLORS.ema20 }}>EMA20</span> <span style={{ color: COLORS.ema50 }}>EMA50</span> <span style={{ color: COLORS.ema200 }}>EMA200</span>
        </Toggle>
        <Toggle on={show.levels} onClick={() => setShow((v) => ({ ...v, levels: !v.levels }))}>
          S/R levels
        </Toggle>
        <Toggle on={show.structure} onClick={() => setShow((v) => ({ ...v, structure: !v.structure }))}>
          Swings · BOS · CHoCH · retests
        </Toggle>
        <span className="w-full sm:ml-auto sm:w-auto">
          Last closed: <span className="num text-ink-2">{last ? `${fmtTime(last.openTime)} (${last.status})` : "—"}</span> · <span style={{ color: COLORS.forming }}>■</span> forming bar is provisional
        </span>
      </div>
      <div className="relative h-[420px] w-full md:h-[520px]">
        <div ref={host} className="absolute inset-0" />
        {(error || !data?.candles.length) && (
          <div className="absolute inset-0 grid place-items-center text-[12.5px] text-ink-3">{error ? `No chart data: ${error}` : "No candles yet."}</div>
        )}
      </div>
    </Panel>
  );
}

function formingBar(c: { openTime: number; open: number; high: number; low: number; close: number }): CandlestickData<Time> {
  return { time: sec(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close, color: COLORS.forming, wickColor: COLORS.forming, borderColor: COLORS.forming };
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 ${on ? "text-ink-2" : "text-ink-3 line-through opacity-60"}`}>
      <span className={`h-2.5 w-2.5 rounded-sm border ${on ? "border-gold bg-gold/40" : "border-line-2"}`} />
      {children}
    </button>
  );
}
