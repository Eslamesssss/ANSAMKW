import { zonedParts } from "./time";

/**
 * Underlying gold market session (the market Binance's TradFi index tracks),
 * expressed in New York time so DST is handled:
 * - Weekly: opens Sunday 18:00 ET, closes Friday 17:00 ET.
 * - Daily maintenance break: 17:00–18:00 ET Monday–Thursday.
 *
 * This is a schedule, not a guarantee: holidays are detected from the data
 * (a static index price; see regime.ts). The XAUUSDT perpetual itself trades
 * outside these hours; its tradability comes from the exchange status.
 */
export interface MarketSessionStatus {
  open: boolean;
  reason: "open" | "weekend" | "daily_break";
}

const NY = "America/New_York";

export function xauSessionStatus(timeMs: number): MarketSessionStatus {
  const { weekday, hour } = zonedParts(timeMs, NY);
  // Saturday: closed all day.
  if (weekday === 6) return { open: false, reason: "weekend" };
  // Sunday: opens at 18:00 ET.
  if (weekday === 0) return hour >= 18 ? { open: true, reason: "open" } : { open: false, reason: "weekend" };
  // Friday: closes at 17:00 ET.
  if (weekday === 5) return hour < 17 ? { open: true, reason: "open" } : { open: false, reason: "weekend" };
  // Monday–Thursday: daily break 17:00–18:00 ET.
  if (hour === 17) return { open: false, reason: "daily_break" };
  return { open: true, reason: "open" };
}

/**
 * True when the whole interval [fromMs, toMs) is outside the session, so missing
 * bars inside it are expected and not a data gap.
 */
export function isEntirelyClosed(fromMs: number, toMs: number, stepMs = 60_000): boolean {
  for (let t = fromMs; t < toMs; t += stepMs) {
    if (xauSessionStatus(t).open) return false;
  }
  return true;
}
