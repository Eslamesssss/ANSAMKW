import { xauSessionStatus } from "./marketHours";

/**
 * Binance TradFi perpetuals trade continuously, but the underlying gold market
 * does not. While the underlying market is open the index price tracks
 * underlying-market quotes; outside those hours (weekends, the daily break,
 * holidays) Binance computes the index with a different method, so mark and
 * index can drift from the underlying and behave differently.
 *
 * The scheduled regime comes from the gold session calendar. Holidays are not
 * in the calendar, so a data check flags an index that stops moving during
 * scheduled hours.
 */
export type IndexRegime = "underlying_hours" | "off_hours";

export interface IndexRegimeStatus {
  regime: IndexRegime;
  scheduled: "open" | "weekend" | "daily_break";
  /** Data-driven flag: index unchanged for a long stretch during scheduled hours. */
  indexStatic: boolean;
  indexStaticForMs: number | null;
  note: string;
}

/** Index unchanged this long during scheduled underlying hours is treated as off-hours (e.g. holiday). */
export const INDEX_STATIC_THRESHOLD_MS = 10 * 60_000;

export function indexRegime(nowMs: number, lastIndexChangeAt: number | null): IndexRegimeStatus {
  const s = xauSessionStatus(nowMs);
  const staticFor = lastIndexChangeAt === null ? null : nowMs - lastIndexChangeAt;
  const indexStatic = s.open && staticFor !== null && staticFor >= INDEX_STATIC_THRESHOLD_MS;
  if (!s.open) {
    return { regime: "off_hours", scheduled: s.reason === "daily_break" ? "daily_break" : "weekend", indexStatic: false, indexStaticForMs: staticFor, note: `underlying gold market closed (${s.reason.replace("_", " ")}): Binance uses its off-hours index method` };
  }
  if (indexStatic) {
    return { regime: "off_hours", scheduled: "open", indexStatic: true, indexStaticForMs: staticFor, note: "index price unchanged during scheduled hours: underlying market may be closed (holiday); treat as off-hours" };
  }
  return { regime: "underlying_hours", scheduled: "open", indexStatic: false, indexStaticForMs: staticFor, note: "underlying gold market open: index tracks underlying-market prices" };
}
