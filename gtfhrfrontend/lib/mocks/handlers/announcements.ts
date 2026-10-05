import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, nowInstant } from "@/lib/mocks/store";
import { departmentNames } from "@/lib/mocks/handlers/config";
import { can, idempotent, me, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import { zonedInstant } from "@/lib/utils/date";
import type { AnnouncementInput } from "@/types/admin";
import type { Announcement } from "@/types/workplace";

/**
 * Employees see published items for their audience. The HR admin view
 * (announcement.publish) also sees scheduled and other-audience items.
 */
export function listAnnouncements(actor: MockActor, view: "feed" | "admin" = "feed"): Announcement[] {
  requireCapability(actor, "directory.read");
  const admin = view === "admin" && can(actor, "announcement.publish");
  const now = nowInstant();
  const department = me(actor).department;
  return db()
    .announcements.map(({ authorId: _author, ...item }): Announcement => ({ ...item, status: item.publishedAt > now ? "scheduled" : "published" }))
    .filter((item) => admin || (item.status === "published" && (item.audience === "Everyone" || item.audience === department)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));
}

function validate(input: AnnouncementInput) {
  if (input.audience !== "Everyone" && !departmentNames().includes(input.audience))
    throw problem(422, "UNKNOWN_AUDIENCE", "Choose Everyone or a department.", { fieldErrors: { audience: "Choose Everyone or a department." } });
  const at = input.publishAt ? zonedInstant(input.publishAt.slice(0, 10), input.publishAt.slice(11, 16)) : null;
  if (at && at < nowInstant()) throw problem(422, "PAST_SCHEDULE", "Pick a time in the future, or leave it empty to publish now.", { fieldErrors: { publishAt: "Must be in the future." } });
  return at;
}

export function publishAnnouncement(actor: MockActor, input: AnnouncementInput, key: string | undefined) {
  requireCapability(actor, "announcement.publish");
  return idempotent(key, () => {
    const store = db();
    const scheduledFor = validate(input);
    store.counter += 1;
    const id = `an_${store.counter}`;
    const { id: _ignored, publishAt: _at, ...fields } = input;
    store.announcements.push({ id, ...fields, publishedAt: scheduledFor ?? nowInstant(), author: "People & Culture", authorId: actor.employeeId });
    // Company-wide news published now is mirrored into the Engage feed.
    if (!scheduledFor && input.audience === "Everyone")
      store.posts.unshift({
        id: `po_${store.counter}`,
        kind: "announcement",
        group: "People & Culture",
        authorId: null,
        subjectId: null,
        title: input.title,
        body: input.body,
        createdAt: nowInstant(),
        reactions: { like: [], celebrate: [], support: [], insightful: [] },
        comments: [],
      });
    return { id, scheduled: Boolean(scheduledFor) };
  });
}

export function updateAnnouncement(actor: MockActor, input: AnnouncementInput & { id: string }) {
  requireCapability(actor, "announcement.publish");
  const store = db();
  const current = store.announcements.find((item) => item.id === input.id);
  if (!current) throw problem(404, "NOT_FOUND", "That announcement no longer exists.");
  const scheduledFor = validate(input);
  const wasScheduled = current.publishedAt > nowInstant();
  Object.assign(current, {
    title: input.title,
    body: input.body,
    category: input.category,
    pinned: input.pinned,
    audience: input.audience,
    // Rescheduling only applies before publication; published history keeps its time.
    ...(wasScheduled ? { publishedAt: scheduledFor ?? nowInstant() } : {}),
  });
  return { id: current.id, scheduled: wasScheduled && Boolean(scheduledFor) };
}

export function removeAnnouncement(actor: MockActor, id: string) {
  requireCapability(actor, "announcement.publish");
  const store = db();
  const index = store.announcements.findIndex((item) => item.id === id);
  if (index === -1) throw problem(404, "NOT_FOUND", "That announcement no longer exists.");
  if (!can(actor, "announcement.publish") || me(actor).department !== "People & Culture")
    throw problem(403, "FORBIDDEN", "Only People & Culture can remove announcements.");
  store.announcements.splice(index, 1);
  return { ok: true };
}
