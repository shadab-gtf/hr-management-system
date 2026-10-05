/**
 * Pure calendar helpers for business dates (`YYYY-MM-DD`). Date-only values are
 * handled in UTC arithmetic so local machine zones never shift a business date.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayInZone(timezone = DEFAULT_TIMEZONE, now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}
export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}
/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}
export function isWeekend(iso: string): boolean {
  const day = weekday(iso);
  return day === 0 || day === 6;
}
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
export function addMonths(month: string, count: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}
export function daysInMonth(month: string): string[] {
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;
  const count = diffDays(first, next);
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}
export function lastDayOfMonth(month: string): string {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}
export function eachDay(from: string, to: string): string[] {
  const count = diffDays(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, index) => addDays(from, index));
}
export function isValidMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

/** Combine a business date and local wall time (IST, +05:30) into an instant. */
export function zonedInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}
