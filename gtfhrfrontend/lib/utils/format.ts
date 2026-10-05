import type { Money } from "@/types/common";
import { DEFAULT_TIMEZONE } from "@/lib/utils/date";

/**
 * Exact decimal-string money formatting with Indian digit grouping.
 * No binary floating point is involved at any step.
 */
export function formatMoney(
  money: Money,
  options: { decimals?: boolean } = {},
): string {
  const { decimals = true } = options;
  const negative = money.amount.startsWith("-");
  const [whole = "0", fraction = ""] = money.amount.replace("-", "").split(".");
  const cents = (fraction + "00").slice(0, 2);
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`
    : last3;
  return `${negative ? "−" : ""}₹${grouped}${decimals ? `.${cents}` : ""}`;
}

/** Compact lakh/crore label for summaries; always pair with the exact value. */
export function formatMoneyCompact(money: Money): string {
  const whole = money.amount.replace("-", "").split(".")[0] ?? "0";
  const digits = whole.length;
  const sign = money.amount.startsWith("-") ? "−" : "";
  if (digits > 7) return `${sign}₹${trimDecimal(whole, digits - 7)} Cr`;
  if (digits > 5) return `${sign}₹${trimDecimal(whole, digits - 5)} L`;
  return formatMoney(money, { decimals: false });
}
function trimDecimal(whole: string, integerDigits: number): string {
  const integer = whole.slice(0, integerDigits);
  const decimals = whole.slice(integerDigits, integerDigits + 2).replace(/0+$/, "");
  return decimals ? `${integer}.${decimals}` : integer;
}

/** Leave units are exact decimal strings such as "1.5". */
export function formatUnits(units: string, unit = "day"): string {
  const trimmed = units.includes(".") ? units.replace(/\.?0+$/, "") : units;
  return `${trimmed} ${unit}${trimmed === "1" ? "" : "s"}`;
}

const dateFormats = {
  short: { day: "numeric", month: "short" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  weekday: { weekday: "short", day: "numeric", month: "short" },
  month: { month: "long", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof dateFormats;

/** Formats a business date without shifting it through the local zone. */
export function formatDate(iso: string, style: DateStyle = "medium"): string {
  const date = new Date(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", {
    ...dateFormats[style],
    timeZone: "UTC",
  }).format(date);
}

export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start, "medium");
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, sameYear ? "short" : "medium")} – ${formatDate(end, "medium")}`;
}

export function formatTime(instant: string, timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(instant));
}

export function formatDateTime(instant: string, timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(instant));
}

/** Relative label for a recent instant, e.g. "3h ago". */
export function formatRelative(instant: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(instant).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(instant);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

export function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function pluralize(count: number, noun: string, plural = `${noun}s`) {
  return `${count} ${count === 1 ? noun : plural}`;
}
