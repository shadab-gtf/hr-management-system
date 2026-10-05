import "server-only";
import { db, photoUrlFor } from "@/lib/mocks/store";
import { organization } from "@/lib/mocks/seed/organization";
import { problem } from "@/lib/api/core/problem";
import {
  personas,
  type MockPersona,
  type MockPersonaOption,
} from "@/lib/mocks/seed/people";
import { isAccountDisabled } from "@/lib/mocks/handlers/access-store";
import { actorFor, me } from "@/lib/mocks/handlers/shared";
import { initialsOf } from "@/lib/utils/format";
import type { Session } from "@/types/session";

/** A demo session; roles and capabilities may be empty (deny by default) when every grant was revoked. */
export function mockSession(persona: MockPersona): Session {
  const actor = actorFor(persona);
  if (isAccountDisabled(actor.employeeId))
    throw problem(401, "UNAUTHENTICATED", "This account is disabled.");
  const employee = me(actor);
  return {
    userId: `usr_${persona}`,
    employeeId: employee.id,
    displayName: employee.name,
    firstName: employee.name.split(" ")[0] ?? employee.name,
    initials: initialsOf(employee.name),
    photoUrl: photoUrlFor(employee.id),
    designation: employee.designation,
    department: employee.department,
    roles: actor.roles,
    capabilities: actor.capabilities,
    organization: {
      name: organization.name,
      timezone: organization.timezone,
      currency: organization.currency,
    },
    unreadNotifications: db().notifications.filter(
      (item) => item.employeeId === employee.id && !item.read,
    ).length,
    source: "mock",
  };
}

export function mockPersonaOptions(): MockPersonaOption[] {
  return (Object.keys(personas) as MockPersona[]).map((id) => {
    const actor = actorFor(id);
    const employee = me(actor);
    return {
      id,
      name: employee.name,
      title: personas[id].title,
      summary: personas[id].summary,
    };
  });
}
