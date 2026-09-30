import "server-only";
import type { HolidayRecord } from "@/types/hr-config";

/** Sample holiday calendar. HR must publish the real list per location. */
/** Seed-time list. After start-up HR edits the copy in the mock store. */
export const holidays: HolidayRecord[] = ([
  { date: "2026-01-26", name: "Republic Day", kind: "national" },
  { date: "2026-03-04", name: "Holi", kind: "festival" },
  { date: "2026-04-03", name: "Good Friday", kind: "optional" },
  { date: "2026-08-15", name: "Independence Day", kind: "national" },
  { date: "2026-08-28", name: "Raksha Bandhan", kind: "optional" },
  { date: "2026-09-04", name: "Janmashtami", kind: "festival" },
  { date: "2026-10-02", name: "Gandhi Jayanti", kind: "national" },
  { date: "2026-10-20", name: "Dussehra", kind: "festival" },
  { date: "2026-11-09", name: "Diwali (observed)", kind: "festival" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti", kind: "optional" },
  { date: "2026-12-25", name: "Christmas", kind: "festival" },
  { date: "2027-01-01", name: "New Year's Day", kind: "optional" },
  { date: "2027-01-26", name: "Republic Day", kind: "national" },
  { date: "2027-03-22", name: "Holi", kind: "festival" },
] as const).map((holiday, index) => ({ ...holiday, id: `hol_${index + 1}`, locations: [] }));

const holidaySet = new Set(holidays.filter((h) => h.kind !== "optional").map((h) => h.date));

/** Seed-time check only (fixture generation). Runtime code uses handlers/config. */
export function isSeedHoliday(date: string): boolean {
  return holidaySet.has(date);
}
