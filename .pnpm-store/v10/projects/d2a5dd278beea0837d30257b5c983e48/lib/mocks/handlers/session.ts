import "server-only";
import { db, photoUrlFor } from "@/lib/mocks/store";
import { organization } from "@/lib/mocks/seed/organization";
import { personas } from "@/lib/mocks/seed/people";
import { actorFor, me } from "@/lib/mocks/handlers/shared";
import { initialsOf } from "@/lib/utils/format";
import type { Persona, PersonaOption, Session } from "@/types/session";

export function mockSession(persona: Persona): Session {
  const actor = actorFor(persona);
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

export function mockPersonaOptions(): PersonaOption[] {
  return (Object.keys(personas) as Persona[]).map((id) => {
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
