import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { addDays, daysBetween, todayInOrgZone } from "../../src/utils/date.js";

/**
 * The frontend mock store exported as JSON (`gtfhrfrontend/scripts/export-mock-seed.mts`). Collections are untyped
 * here; each module seed narrows the slice it owns (see the frontend's `lib/mocks/seed/*.ts` for shapes).
 */
export type MockStore = Record<string, unknown> & {
  today: string;
  employees: SeedEmployee[];
  organization: {
    name: string;
    timezone: string;
    currency: string;
    legalEntity: string;
    payGroup: string;
    emailDomain: string;
  };
  personas: Record<string, { employeeId: string; roles: string[] }>;
};

export interface SeedEmployee {
  id: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  location: string;
  managerId: string | null;
  joinedOn: string;
  status: "onboarding" | "active" | "on_leave" | "notice" | "exited";
  type: "full_time" | "contract" | "intern";
  annualCtc: number;
}

export interface SeedContext {
  prisma: PrismaClient;
  data: MockStore;
  /** Business date in the export → same offset from today (the mock's data is relative to its `today`). */
  shiftDate(isoDate: string): string;
  /** Instant in the export → same offset from now. */
  shiftInstant(instant: string): Date;
  /** `dep_<slug>` for a department name, `loc_<slug>` for a location name. */
  departmentId(name: string): string;
  locationId(name: string): string;
  log(message: string): void;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function createSeedContext(prisma: PrismaClient, dataFile: URL): SeedContext {
  const data = JSON.parse(readFileSync(dataFile, "utf8")) as MockStore;
  const offsetDays = daysBetween(data.today, todayInOrgZone());
  return {
    prisma,
    data,
    shiftDate: (isoDate) => addDays(isoDate, offsetDays),
    shiftInstant: (instant) => new Date(new Date(instant).getTime() + offsetDays * 86_400_000),
    departmentId: (name) => `dep_${slug(name)}`,
    locationId: (name) => `loc_${slug(name)}`,
    log: (message) => {
      console.info(`  ${message}`);
    },
  };
}
