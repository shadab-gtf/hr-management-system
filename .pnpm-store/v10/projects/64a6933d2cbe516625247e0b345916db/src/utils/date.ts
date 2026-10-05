/**
 * Business dates are `YYYY-MM-DD` in the organization's zone (Asia/Kolkata); instants are UTC ISO strings.
 * Never derive "today" from `new Date().toISOString()` — between 00:00 and 05:30 IST that is still yesterday.
 */
export const ORG_TIMEZONE = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORG_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` for a date-only column (stored at UTC midnight). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Date-only column value for `YYYY-MM-DD`. */
export function fromIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** The business date of `instant` in the organization zone. */
export function businessDateOf(instant: Date): string {
  return dateFormatter.format(instant);
}

/** Today's business date in the organization zone. */
export function todayInOrgZone(): string {
  return businessDateOf(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const date = fromIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(isoDate: string): number {
  return fromIsoDate(isoDate).getUTCDay();
}

/** UTC instant for a wall-clock `HH:mm` on a business date in the organization zone (IST has no DST: +05:30). */
export function zonedInstant(isoDate: string, time: string): Date {
  return new Date(`${isoDate}T${time.length === 5 ? `${time}:00` : time}+05:30`);
}

/** ISO instant string for JSON responses. */
export function toInstant(date: Date): string {
  return date.toISOString();
}
