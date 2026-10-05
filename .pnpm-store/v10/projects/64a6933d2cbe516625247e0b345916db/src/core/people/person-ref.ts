import type { Prisma } from "@prisma/client";

/** `types/common.ts` personRefSchema. */
export interface PersonRef {
  id: string;
  name: string;
  initials: string;
  designation: string;
  photoUrl: string | null;
}

/** Prisma `select` for everything `personRef()` needs. */
export const personRefSelect = {
  id: true,
  name: true,
  designation: true,
  photoVersion: true,
} satisfies Prisma.EmployeeSelect;

export type PersonRefSource = Prisma.EmployeeGetPayload<{ select: typeof personRefSelect }>;

/** Up to two initials, matching the frontend's `initialsOf`. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Versioned photo URL served by the frontend's `/api/photos/<id>` route (which proxies the API), so a new upload is
 * fetched everywhere and a stale one is never cached. Null shows initials.
 */
export function photoUrlFor(employeeId: string, photoVersion: number | null): string | null {
  return photoVersion === null ? null : `/api/photos/${employeeId}?v=${photoVersion}`;
}

export function personRef(employee: PersonRefSource): PersonRef {
  return {
    id: employee.id,
    name: employee.name,
    initials: initialsOf(employee.name),
    designation: employee.designation,
    photoUrl: photoUrlFor(employee.id, employee.photoVersion),
  };
}
