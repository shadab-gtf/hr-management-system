import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById } from "@/lib/mocks/store";
import { organization } from "@/lib/mocks/seed/organization";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { ref, refById, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import type { DirectoryCard, OrgNode } from "@/types/requests";

const active = () => db().employees.filter((employee) => employee.status !== "exited");

function email(employee: SeedEmployee) {
  const [first = "", ...rest] = employee.name.toLowerCase().split(" ");
  return `${first}.${rest.at(-1) ?? ""}@${organization.emailDomain}`;
}

/** Whole active organization as a flat list; the UI builds the tree. */
export function orgChart(actor: MockActor): OrgNode[] {
  requireCapability(actor, "directory.read");
  const people = active();
  const reports = new Map<string, string[]>();
  for (const person of people)
    if (person.managerId) reports.set(person.managerId, [...(reports.get(person.managerId) ?? []), person.id]);
  const total = (id: string): number => (reports.get(id) ?? []).reduce((sum, child) => sum + 1 + total(child), 0);
  return people.map((person) => ({
    person: ref(person),
    managerId: person.managerId,
    department: person.department,
    location: person.location,
    code: person.code,
    directCount: reports.get(person.id)?.length ?? 0,
    totalCount: total(person.id),
  }));
}

function starredSet(actorId: string) {
  const store = db();
  let set = store.starred.get(actorId);
  if (!set) {
    set = new Set();
    store.starred.set(actorId, set);
  }
  return set;
}

/** Directory-safe card (work contact only). */
export function directoryCard(actor: MockActor, id: string): DirectoryCard {
  requireCapability(actor, "directory.read");
  const person = employeeById(id);
  if (!person || person.status === "exited") throw problem(404, "NOT_FOUND", "We couldn't find that person.");
  const n = Number(person.id.slice(-4));
  return {
    person: ref(person),
    code: person.code,
    department: person.department,
    location: person.location,
    workEmail: email(person),
    workPhone: `+91 120 400 ${String(1000 + n).slice(-4)}`,
    manager: refById(person.managerId),
    joinedOn: person.joinedOn,
    starred: starredSet(actor.employeeId).has(person.id),
  };
}

export function starredIds(actor: MockActor): string[] {
  requireCapability(actor, "directory.read");
  return [...starredSet(actor.employeeId)];
}

export function toggleStar(actor: MockActor, id: string) {
  requireCapability(actor, "directory.read");
  if (!employeeById(id)) throw problem(404, "NOT_FOUND", "We couldn't find that person.");
  const set = starredSet(actor.employeeId);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return { starred: set.has(id) };
}
