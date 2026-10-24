const cairo = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const cairoDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const cairoFull = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export const fmtTime = (ms: number | null | undefined) => (ms ? cairo.format(ms) : "—");
export const fmtDateTime = (ms: number | null | undefined) => (ms ? cairoDate.format(ms) : "—");
export const fmtFull = (ms: number | null | undefined) => (ms ? `${cairoFull.format(ms)} Cairo` : "—");
export const fmtUtc = (ms: number | null | undefined) => (ms ? `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC` : "—");

export function fmtPrice(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtSigned(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${fmtPrice(v, digits)}`;
}

export function fmtAge(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export const stateColor = (s: string | null | undefined) =>
  s === "bullish" ? "text-bull" : s === "bearish" ? "text-bear" : s === "insufficient_data" || s === "undetermined" ? "text-ink-3" : "text-neutral";

export const stateBg = (s: string | null | undefined) =>
  s === "bullish" ? "bg-bull/12 text-bull border-bull/30" : s === "bearish" ? "bg-bear/12 text-bear border-bear/30" : "bg-white/4 text-ink-2 border-line-2";
