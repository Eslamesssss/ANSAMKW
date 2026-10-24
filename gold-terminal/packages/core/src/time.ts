export const DISPLAY_TZ = "Africa/Cairo";

const cairoFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DISPLAY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Format a UTC epoch-ms timestamp for display in Africa/Cairo. */
export function formatCairo(timeMs: number): string {
  const parts = Object.fromEntries(cairoFormatter.formatToParts(new Date(timeMs)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} Cairo`;
}

export function toIso(timeMs: number): string {
  return new Date(timeMs).toISOString();
}

/**
 * Wall-clock parts of a UTC instant in a given IANA zone. Used to apply
 * DST-aware session rules without a timezone library.
 */
export function zonedParts(timeMs: number, timeZone: string): { weekday: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(timeMs)).map((p) => [p.type, p.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour) % 24;
  return { weekday: weekdays[parts.weekday ?? "Sun"] ?? 0, hour, minute: Number(parts.minute) };
}
