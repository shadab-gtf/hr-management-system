import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, photoUrlFor } from "@/lib/mocks/store";
import { personas, type SeedEmployee } from "@/lib/mocks/seed/people";
import { initialsOf } from "@/lib/utils/format";
import type { PersonRef } from "@/types/common";
import { capabilitiesFor } from "@/lib/mocks/capabilities";
import type { Capability, Persona, Role } from "@/types/session";

export interface MockActor {
  persona: Persona;
  employeeId: string;
  roles: Role[];
  capabilities: Capability[];
}

export function actorFor(persona: Persona): MockActor {
  const config = personas[persona];
  return {
    persona,
    employeeId: config.employeeId,
    roles: config.roles,
    capabilities: capabilitiesFor(config.roles),
  };
}

export function can(actor: MockActor, capability: Capability): boolean {
  return actor.capabilities.includes(capability);
}

/** Server-side denial; mirrors the live API's 403 problem. */
export function requireCapability(actor: MockActor, capability: Capability): void {
  if (!can(actor, capability))
    throw problem(403, "FORBIDDEN", "You don't have access to this.");
}

export function me(actor: MockActor): SeedEmployee {
  const employee = employeeById(actor.employeeId);
  if (!employee) throw problem(404, "EMPLOYEE_NOT_LINKED", "No employee record is linked to this account.");
  return employee;
}

export function ref(employee: SeedEmployee): PersonRef {
  return {
    id: employee.id,
    name: employee.name,
    initials: initialsOf(employee.name),
    designation: employee.designation,
    photoUrl: photoUrlFor(employee.id),
  };
}
export function refById(id: string | null): PersonRef | null {
  const employee = id ? employeeById(id) : undefined;
  return employee ? ref(employee) : null;
}

export function directReports(managerId: string): SeedEmployee[] {
  return db().employees.filter(
    (employee) => employee.managerId === managerId && employee.status !== "exited",
  );
}

/** Replays an earlier result for the same idempotency key (api-contract.md). */
export function idempotent<T>(key: string | undefined, run: () => T): T {
  if (!key) return run();
  const store = db().idempotency;
  if (store.has(key)) return store.get(key) as T;
  const result = run();
  store.set(key, result);
  return result;
}

export function versionCheck(current: number, expected: number | undefined) {
  if (expected !== undefined && expected !== current)
    throw problem(412, "STALE_VERSION", "This record changed since you opened it. Review the latest version.");
}
