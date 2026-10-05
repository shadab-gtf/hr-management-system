import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, nowInstant } from "@/lib/mocks/store";
import { seededInt } from "@/lib/mocks/seed/random";
import type { MockActor } from "@/lib/mocks/handlers/shared";
import type { NotificationPreferences, NotificationTopic } from "@/types/hr-config";
import type { AppNotification } from "@/types/workplace";
import type { ChannelPreferences } from "@/types/notifications";

export function listNotifications(actor: MockActor): AppNotification[] {
  return db()
    .notifications.filter((item) => item.employeeId === actor.employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ employeeId: _owner, ...item }) => item);
}

export function markNotificationsRead(actor: MockActor) {
  for (const item of db().notifications)
    if (item.employeeId === actor.employeeId) item.read = true;
  return { ok: true };
}

/** Internal helper for other mock modules: in-app notification to one person. */
export function notify(
  employeeId: string,
  kind: AppNotification["kind"],
  title: string,
  body: string,
  href: string | null,
) {
  const store = db();
  store.counter += 1;
  store.notifications.push({ id: `nt_${store.counter}`, employeeId, kind, title, body, href, createdAt: nowInstant(), read: false });
}

/* Preferences -------------------------------------------------------------- */

const TOPICS: NotificationTopic[] = ["approval", "leave", "payroll", "helpdesk", "announcement"];

export function notificationPreferences(actor: MockActor): NotificationPreferences {
  const saved = db().notificationPrefs.get(actor.employeeId);
  return {
    topics: TOPICS.map((topic) => ({ topic, email: saved?.topics[topic].email ?? topic !== "announcement", push: saved?.topics[topic].push ?? topic === "approval" })),
    quietHours: saved?.quietHours ?? { enabled: false, from: "21:00", to: "08:00" },
    deliveryAvailable: false,
  };
}

export function saveNotificationPreferences(actor: MockActor, input: { topics: Record<NotificationTopic, { email: boolean; push: boolean }>; quietHours: { enabled: boolean; from: string; to: string } }) {
  db().notificationPrefs.set(actor.employeeId, input);
  return { ok: true };
}

/* Channel extensions: SMS, WhatsApp, digest, verified mobile ---------------- */

const OTP_TTL_MS = 10 * 60_000;
const OTP_ATTEMPTS = 5;

function maskPhone(number: string) {
  return `+91 ${number.slice(0, 2)}XXXXX${number.slice(-3)}`;
}

export function channelPreferences(actor: MockActor): ChannelPreferences {
  const base = notificationPreferences(actor);
  const store = db();
  const extra = store.notifChannelPrefs.get(actor.employeeId);
  const phone = store.notifPhones.get(actor.employeeId);
  const pending = phone?.pending && new Date(phone.pending.expiresAt).getTime() > Date.now() ? phone.pending : null;
  return {
    topics: base.topics.map((item) => ({ ...item, sms: extra?.sms[item.topic] ?? false, whatsapp: extra?.whatsapp[item.topic] ?? false })),
    quietHours: base.quietHours,
    digest: extra?.digest ?? { mode: "instant", time: "18:00" },
    phone: {
      masked: phone?.number ? maskPhone(phone.number) : null,
      verified: Boolean(phone?.verified),
      verifiedAt: phone?.verifiedAt ?? null,
      pending: pending ? { masked: maskPhone(pending.number), expiresAt: pending.expiresAt, attemptsLeft: pending.attemptsLeft } : null,
      // Mock backend only: surfaces the code an SMS gateway would deliver.
      devCode: pending?.code ?? null,
    },
    deliveryAvailable: false,
  };
}

export function saveChannelPreferences(
  actor: MockActor,
  input: {
    topics: Record<NotificationTopic, { email: boolean; push: boolean; sms: boolean; whatsapp: boolean }>;
    quietHours: { enabled: boolean; from: string; to: string };
    digest: { mode: "instant" | "daily"; time: string };
  },
) {
  const store = db();
  const phone = store.notifPhones.get(actor.employeeId);
  const wantsPhone = TOPICS.some((topic) => input.topics[topic].sms || input.topics[topic].whatsapp);
  if (wantsPhone && !phone?.verified)
    throw problem(422, "PHONE_NOT_VERIFIED", "Verify your mobile number to use SMS or WhatsApp.", { fieldErrors: { phone: "Verify your mobile number to use SMS or WhatsApp." } });
  if (input.quietHours.enabled && input.quietHours.from === input.quietHours.to)
    throw problem(422, "QUIET_HOURS", "Quiet hours need different start and end times.", { fieldErrors: { to: "Choose an end time different from the start." } });
  const pick = (channel: "email" | "push" | "sms" | "whatsapp") => Object.fromEntries(TOPICS.map((topic) => [topic, input.topics[topic][channel]])) as Record<NotificationTopic, boolean>;
  saveNotificationPreferences(actor, {
    topics: Object.fromEntries(TOPICS.map((topic) => [topic, { email: input.topics[topic].email, push: input.topics[topic].push }])) as Record<NotificationTopic, { email: boolean; push: boolean }>,
    quietHours: input.quietHours,
  });
  store.notifChannelPrefs.set(actor.employeeId, { sms: pick("sms"), whatsapp: pick("whatsapp"), digest: input.digest });
  return { ok: true };
}

export function startPhoneVerification(actor: MockActor, number: string) {
  const store = db();
  const current = store.notifPhones.get(actor.employeeId);
  if (current?.verified && current.number === number) throw problem(409, "ALREADY_VERIFIED", "This number is already verified.", { fieldErrors: { phone: "This number is already verified." } });
  const code = String(seededInt(100000, 999999, actor.employeeId, number, Date.now()));
  store.notifPhones.set(actor.employeeId, {
    number: current?.number ?? null,
    verified: current?.verified ?? false,
    verifiedAt: current?.verifiedAt ?? null,
    pending: { number, code, expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(), attemptsLeft: OTP_ATTEMPTS },
  });
  return { ok: true, masked: maskPhone(number) };
}

export function confirmPhoneVerification(actor: MockActor, code: string) {
  const store = db();
  const phone = store.notifPhones.get(actor.employeeId);
  const pending = phone?.pending;
  if (!phone || !pending) throw problem(409, "NO_PENDING_CODE", "Request a code first.", { fieldErrors: { code: "Request a new code first." } });
  if (new Date(pending.expiresAt).getTime() <= Date.now()) {
    phone.pending = null;
    throw problem(410, "CODE_EXPIRED", "The code expired. Request a new one.", { fieldErrors: { code: "The code expired. Request a new one." } });
  }
  if (pending.code !== code) {
    pending.attemptsLeft -= 1;
    if (pending.attemptsLeft <= 0) phone.pending = null;
    throw problem(422, "WRONG_CODE", "That code doesn't match.", { fieldErrors: { code: pending.attemptsLeft > 0 ? `That code doesn't match. ${pending.attemptsLeft} attempts left.` : "Too many attempts. Request a new code." } });
  }
  store.notifPhones.set(actor.employeeId, { number: pending.number, verified: true, verifiedAt: nowInstant(), pending: null });
  return { ok: true };
}

/** Removing the number switches SMS and WhatsApp off everywhere. */
export function removePhone(actor: MockActor) {
  const store = db();
  store.notifPhones.delete(actor.employeeId);
  const extra = store.notifChannelPrefs.get(actor.employeeId);
  if (extra) {
    for (const topic of TOPICS) {
      extra.sms[topic] = false;
      extra.whatsapp[topic] = false;
    }
  }
  return { ok: true };
}
