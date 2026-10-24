/**
 * Contract specification and USDT position sizing for a USDⓈ-M linear
 * perpetual. All prices, risk and P&L are in the quote/settlement asset
 * (USDT). Quantities are in the base asset, as Binance USDⓈ-M contracts are
 * quoted (notional = quantity × price).
 */

export interface ContractSpec {
  exchange: "binance-usdm";
  symbol: string;
  pair: string;
  contractType: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  underlyingType: string | null;
  underlyingSubType: string[];
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  minPrice: number;
  maxPrice: number;
  /** LOT_SIZE (limit orders). */
  stepSize: number;
  minQty: number;
  maxQty: number;
  /** MARKET_LOT_SIZE. */
  marketStepSize: number | null;
  marketMinQty: number | null;
  marketMaxQty: number | null;
  minNotional: number | null;
  maintMarginPercent: number | null;
  requiredMarginPercent: number | null;
  liquidationFee: number | null;
  onboardDate: number | null;
  deliveryDate: number | null;
  /** When the spec was read from /fapi/v1/exchangeInfo. */
  fetchedAt: number;
}

/** Number of decimals implied by a step such as 0.001 → 3. */
export function stepDecimals(step: number): number {
  if (!(step > 0)) return 0;
  const s = step.toString();
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  return s.includes(".") ? s.split(".")[1]!.replace(/0+$/, "").length : 0;
}

/** Floor `value` to a multiple of `step` without binary-float drift. */
export function floorToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const d = stepDecimals(step);
  const units = Math.floor(Number((value / step).toFixed(9)));
  return Number((units * step).toFixed(d));
}

export function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const d = stepDecimals(step);
  return Number((Math.round(value / step) * step).toFixed(d));
}

export interface SizingInput {
  side: "long" | "short";
  /** Account equity in USDT. */
  equityUsdt: number;
  /** Risk per trade as % of equity (e.g. 1 = 1%). Ignored if riskUsdt is given. */
  riskPct?: number;
  riskUsdt?: number;
  entry: number;
  stop: number;
  targets?: number[];
  leverage: number;
  /**
   * Assumed taker fee rate per side (0.0005 = 0.05%). Account-specific fee
   * tiers need a private API, so this is an explicit user assumption.
   */
  feeRate: number;
  /** Size against MARKET_LOT_SIZE (market entry) instead of LOT_SIZE. */
  orderType: "limit" | "market";
}

export interface SizingResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  side: "long" | "short";
  entry: number;
  stop: number;
  quantity: number;
  notionalUsdt: number;
  initialMarginUsdt: number;
  /** Loss at the stop including assumed entry+exit fees. */
  riskAtStopUsdt: number;
  riskPctOfEquity: number;
  feesRoundTripAtStopUsdt: number;
  targets: { price: number; pnlUsdt: number; rMultiple: number }[];
}

/**
 * Size a position so the loss at the stop (price move plus assumed fees) does
 * not exceed the risk budget, honouring the contract's tick size, step size,
 * min/max quantity and minimum notional. Pure arithmetic: places no orders.
 */
export function sizePosition(spec: ContractSpec, input: SizingInput): SizingResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entry = roundToStep(input.entry, spec.tickSize);
  const stop = roundToStep(input.stop, spec.tickSize);
  const step = input.orderType === "market" ? (spec.marketStepSize ?? spec.stepSize) : spec.stepSize;
  const minQty = input.orderType === "market" ? (spec.marketMinQty ?? spec.minQty) : spec.minQty;
  const maxQty = input.orderType === "market" ? (spec.marketMaxQty ?? spec.maxQty) : spec.maxQty;
  const base: SizingResult = { ok: false, errors, warnings, side: input.side, entry, stop, quantity: 0, notionalUsdt: 0, initialMarginUsdt: 0, riskAtStopUsdt: 0, riskPctOfEquity: 0, feesRoundTripAtStopUsdt: 0, targets: [] };

  if (!(input.equityUsdt > 0)) errors.push("equity must be positive");
  if (!(entry > 0) || !(stop > 0)) errors.push("entry and stop must be positive");
  if (input.side === "long" && !(stop < entry)) errors.push("long stop must be below entry");
  if (input.side === "short" && !(stop > entry)) errors.push("short stop must be above entry");
  if (!(input.leverage >= 1)) errors.push("leverage must be at least 1");
  if (!(input.feeRate >= 0 && input.feeRate < 0.01)) errors.push("fee rate must be between 0 and 1%");
  if (entry < spec.minPrice || (spec.maxPrice > 0 && entry > spec.maxPrice)) errors.push("entry outside the contract's price filter");
  const budget = input.riskUsdt ?? ((input.riskPct ?? 0) / 100) * input.equityUsdt;
  if (!(budget > 0)) errors.push("risk budget must be positive");
  if (errors.length) return base;

  // Loss per unit at the stop: price distance + fees on entry and exit notional.
  const perUnitLoss = Math.abs(entry - stop) + input.feeRate * (entry + stop);
  let quantity = floorToStep(budget / perUnitLoss, step);
  if (quantity > maxQty) {
    quantity = floorToStep(maxQty, step);
    warnings.push(`quantity capped at the contract maximum ${maxQty}`);
  }
  if (quantity < minQty) {
    errors.push(`risk budget too small: ${quantity} is below the minimum quantity ${minQty}`);
    return { ...base, quantity };
  }
  const notional = quantity * entry;
  if (spec.minNotional !== null && notional < spec.minNotional) {
    errors.push(`notional ${notional.toFixed(2)} USDT is below the contract minimum ${spec.minNotional} USDT`);
    return { ...base, quantity, notionalUsdt: notional };
  }
  const margin = notional / input.leverage;
  if (margin > input.equityUsdt) warnings.push("initial margin exceeds equity at this leverage");
  const fees = input.feeRate * quantity * (entry + stop);
  const risk = quantity * Math.abs(entry - stop) + fees;
  const dir = input.side === "long" ? 1 : -1;
  const targets = (input.targets ?? [])
    .map((t) => roundToStep(t, spec.tickSize))
    .filter((t) => (dir === 1 ? t > entry : t < entry))
    .map((t) => {
      const pnl = dir * quantity * (t - entry) - input.feeRate * quantity * (entry + t);
      return { price: t, pnlUsdt: pnl, rMultiple: risk > 0 ? pnl / risk : 0 };
    });
  warnings.push("liquidation price not computed: maintenance-margin brackets require a private API");
  return {
    ...base,
    ok: true,
    quantity,
    notionalUsdt: notional,
    initialMarginUsdt: margin,
    riskAtStopUsdt: risk,
    riskPctOfEquity: (risk / input.equityUsdt) * 100,
    feesRoundTripAtStopUsdt: fees,
    targets,
  };
}
