"use client";

import { sizePosition, type SizingInput } from "@gold/core";
import { useEffect, useMemo, useState } from "react";
import { fmtPrice } from "@/lib/format";
import type { ContractSpec, SizerPreset } from "@/lib/types";
import { Badge, Empty, Panel } from "./ui";

/**
 * USDT risk calculator on the live Binance contract spec (tick size, step
 * size, min/max quantity, min notional). It calculates only; nothing here can
 * place an order.
 */
export function PositionSizer({ contract, preset, lastPrice }: { contract: ContractSpec | null; preset: SizerPreset | null; lastPrice: number | null }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [equity, setEquity] = useState("1000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [targets, setTargets] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [feePct, setFeePct] = useState("0.05");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (!preset) return;
    setSide(preset.side);
    setEntry(String(preset.entry));
    setStop(String(preset.stop));
    setTargets(preset.targets.join(", "));
    setSource(preset.label);
  }, [preset]);

  const result = useMemo(() => {
    if (!contract || !entry || !stop) return null;
    const input: SizingInput = {
      side,
      equityUsdt: Number(equity),
      riskPct: Number(riskPct),
      entry: Number(entry),
      stop: Number(stop),
      targets: targets.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite),
      leverage: Number(leverage),
      feeRate: Number(feePct) / 100,
      orderType,
    };
    return sizePosition(contract, input);
  }, [contract, side, equity, riskPct, entry, stop, targets, leverage, feePct, orderType]);

  const q = contract?.quoteAsset ?? "USDT";
  const input = "num w-full rounded border border-line-2 bg-panel-2 px-2 py-1 text-[12px] text-ink outline-none focus:border-gold/60";
  return (
    <Panel title={<>Position sizing · {q}</>} right={<span className="text-[10.5px] text-ink-3">calculator only · no orders</span>}>
      {!contract ? (
        <Empty>Contract specification not loaded from Binance yet.</Empty>
      ) : (
        <div className="space-y-3 p-4">
          <div className="text-[10.5px] text-ink-3">
            {contract.symbol} spec from exchangeInfo: tick {contract.tickSize} · step {contract.stepSize} (market {contract.marketStepSize ?? contract.stepSize}) · min qty {contract.minQty} · min notional {contract.minNotional ?? "—"} {q}
          </div>
          {source && <Badge tone="info" className="normal-case">prefilled from {source}</Badge>}
          <div className="grid grid-cols-2 gap-2 text-[11px] text-ink-3">
            <label className="space-y-0.5">
              Side
              <select className={input} value={side} onChange={(e) => setSide(e.target.value as "long" | "short")}>
                <option value="long">long</option>
                <option value="short">short</option>
              </select>
            </label>
            <label className="space-y-0.5">
              Order type (lot filter)
              <select className={input} value={orderType} onChange={(e) => setOrderType(e.target.value as "limit" | "market")}>
                <option value="limit">limit (LOT_SIZE)</option>
                <option value="market">market (MARKET_LOT_SIZE)</option>
              </select>
            </label>
            <Field label={`Equity (${q})`} value={equity} onChange={setEquity} cls={input} />
            <Field label="Risk per trade (%)" value={riskPct} onChange={setRiskPct} cls={input} />
            <Field label={`Entry (${q})`} value={entry} onChange={setEntry} cls={input} placeholder={lastPrice ? String(lastPrice) : ""} />
            <Field label={`Stop (${q})`} value={stop} onChange={setStop} cls={input} />
            <label className="col-span-2 space-y-0.5">
              Targets ({q}, comma-separated)
              <input className={input} value={targets} onChange={(e) => setTargets(e.target.value)} />
            </label>
            <Field label="Leverage (x)" value={leverage} onChange={setLeverage} cls={input} />
            <Field label="Assumed fee per side (%)" value={feePct} onChange={setFeePct} cls={input} />
          </div>
          {lastPrice !== null && !entry && (
            <button className="text-[11px] text-gold-2 hover:underline" onClick={() => setEntry(String(lastPrice))}>
              Use last trade {fmtPrice(lastPrice)} as entry
            </button>
          )}
          {result && (
            <div className="space-y-2 rounded-md border border-line bg-panel-2 p-3 text-[12px]">
              {result.errors.length > 0 ? (
                <ul className="space-y-0.5 text-bear">
                  {result.errors.map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
                </ul>
              ) : (
                <>
                  <div className="num grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-ink-3">Quantity</span>
                    <span className="text-right font-semibold text-ink">{result.quantity} {contract.baseAsset}</span>
                    <span className="text-ink-3">Entry / stop (tick-rounded)</span>
                    <span className="text-right text-ink">{fmtPrice(result.entry)} / {fmtPrice(result.stop)}</span>
                    <span className="text-ink-3">Notional</span>
                    <span className="text-right text-ink">{fmtPrice(result.notionalUsdt)} {q}</span>
                    <span className="text-ink-3">Initial margin</span>
                    <span className="text-right text-ink">{fmtPrice(result.initialMarginUsdt)} {q}</span>
                    <span className="text-ink-3">Loss at stop (incl. fees)</span>
                    <span className="text-right text-bear">−{fmtPrice(result.riskAtStopUsdt)} {q} ({result.riskPctOfEquity.toFixed(2)}%)</span>
                    <span className="text-ink-3">Fees at stop (assumed)</span>
                    <span className="text-right text-ink-2">{fmtPrice(result.feesRoundTripAtStopUsdt)} {q}</span>
                  </div>
                  {result.targets.length > 0 && (
                    <table className="num w-full text-[12px]">
                      <thead>
                        <tr className="text-[10.5px] uppercase text-ink-3">
                          <th className="text-left font-medium">Target</th>
                          <th className="text-right font-medium">P&L ({q}, net)</th>
                          <th className="text-right font-medium">R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.targets.map((t) => (
                          <tr key={t.price}>
                            <td>{fmtPrice(t.price)}</td>
                            <td className="text-right text-bull">+{fmtPrice(t.pnlUsdt)}</td>
                            <td className="text-right text-ink-2">{t.rMultiple.toFixed(2)}R</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
              {result.warnings.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-ink-3">
                  {result.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="text-[10.5px] leading-snug text-ink-3">
            Quantity is floored to the contract step so the loss at the stop, including the assumed fee on entry and exit, stays within your risk. Your actual fee tier and liquidation price need your account data and are not used.
          </p>
        </div>
      )}
    </Panel>
  );
}

function Field({ label, value, onChange, cls, placeholder }: { label: string; value: string; onChange: (v: string) => void; cls: string; placeholder?: string }) {
  return (
    <label className="space-y-0.5">
      {label}
      <input className={cls} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder={placeholder} />
    </label>
  );
}
