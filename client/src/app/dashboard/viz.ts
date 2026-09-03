/**
 * Chart palette and formatters.
 *
 * Hues come from a validated categorical palette -- the ordering is the
 * colorblind-safety mechanism, not decoration, so slots are assigned in fixed
 * order and never cycled. Status colors are reserved for state (expiry
 * urgency, temperature excursions) and never reused as a series color, and
 * they always ship with a label so meaning is never carried by hue alone.
 */

export const SERIES = {
  blue: { light: "#2a78d6", dark: "#3987e5" },
  orange: { light: "#eb6834", dark: "#d95926" },
  aqua: { light: "#1baf7a", dark: "#199e70" },
  yellow: { light: "#eda100", dark: "#c98500" },
  magenta: { light: "#e87ba4", dark: "#d55181" },
} as const;

/** Reserved for state. Never a series. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const INK = {
  muted: "#898781",
  grid: { light: "#e1e0d9", dark: "#2c2c2a" },
  axis: { light: "#c3c2b7", dark: "#383835" },
};

export const hue = (k: keyof typeof SERIES, dark: boolean) =>
  dark ? SERIES[k].dark : SERIES[k].light;

// --- formatters ------------------------------------------------------------

export const money = (n: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n ?? 0);

export const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "--" : `${n.toFixed(digits)}%`;

export const count = (n: number) => new Intl.NumberFormat("en-US").format(n ?? 0);

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Expiry urgency band.
 *
 * Thresholds are tied to how a real operation reacts: two days or less means
 * discount it or move it today; a week means put it on the watch list.
 */
export function urgency(daysLeft: number) {
  if (daysLeft <= 1) return { key: "critical", color: STATUS.critical, label: "Critical" };
  if (daysLeft <= 3) return { key: "serious", color: STATUS.serious, label: "Urgent" };
  if (daysLeft <= 7) return { key: "warning", color: STATUS.warning, label: "Watch" };
  return { key: "good", color: STATUS.good, label: "OK" };
}

/** A cold location is in tolerance when |latest - target| <= tolerance. */
export function tempStatus(
  latest: number | null,
  target: number | null,
  tolerance: number
) {
  if (target === null || latest === null)
    return { color: INK.muted, label: "Not monitored", ok: true };
  const drift = Math.abs(latest - target);
  if (drift > tolerance)
    return { color: STATUS.critical, label: "Out of range", ok: false };
  if (drift > tolerance * 0.7)
    return { color: STATUS.warning, label: "Near limit", ok: true };
  return { color: STATUS.good, label: "In range", ok: true };
}
