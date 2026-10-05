import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { config } from "../../config/index.js";
import { notificationTopicSchema } from "../../contracts/hr-config.js";
import { channelPreferencesSchema } from "../../contracts/notifications.js";
import { AppError, NotFoundError, ValidationError } from "../../core/errors/index.js";
import { decrypt, encrypt } from "../../core/security/encryption.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { createWorkspaceRepository, workspaceCommand } from "../workspace/workspace.repository.js";
import type { CommandContext } from "../workspace/workspace.schema.js";
import { storedPhoneSchema, type preferencesInput, type channelsInput } from "./notification.schema.js";
const hash = (value: string) => createHmac("sha256", config.jwt.secret).update(value).digest("hex");
const mask = (phone: string) => `+91 ${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`;
async function deliverVerificationCode(number: string, code: string): Promise<void> {
  if (!config.sms.url)
    throw new AppError(503, "SMS_NOT_CONFIGURED", "Phone verification requires a configured SMS gateway.");
  const response = await fetch(config.sms.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.sms.token ? { Authorization: `Bearer ${config.sms.token}` } : {}),
    },
    body: JSON.stringify({
      to: `+91${number}`,
      message: `Your GTF HR verification code is ${code}. It expires in five minutes.`,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!response?.ok)
    throw new AppError(503, "SMS_DELIVERY_FAILED", "The verification message could not be delivered. Try again later.");
}
export function createNotificationService(prisma: PrismaClient, sendVerificationCode = deliverVerificationCode) {
  const repo = createWorkspaceRepository(prisma);
  const command = <T>(
    actor: AuthenticatedActor,
    action: string,
    context: CommandContext,
    work: Parameters<typeof workspaceCommand<T>>[6],
  ) => workspaceCommand(prisma, actor, action, actor.employeeId, context.key, context.requestId, work);
  const service = {
    async list(actor: AuthenticatedActor) {
      return (await repo.notifications(actor.employeeId)).map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        read: Boolean(n.readAt),
      }));
    },
    async unread(actor: AuthenticatedActor) {
      return { unread: (await repo.notifications(actor.employeeId)).filter((n) => !n.readAt).length };
    },
    read(actor: AuthenticatedActor, id: string | undefined, context: CommandContext) {
      return command(actor, "notification.read", context, async (r) => {
        const updated = await r.readNotifications(actor.employeeId, id);
        if (id && updated.count === 0) throw new NotFoundError();
        return { ok: true };
      });
    },
    async channels(actor: AuthenticatedActor) {
      const [saved, rawPhone] = await Promise.all([
        repo.get(`preferences:${actor.employeeId}`),
        repo.get(`phone:${actor.employeeId}`),
      ]);
      const phone = rawPhone ? storedPhoneSchema.parse(rawPhone.data) : null;
      const base = channelPreferencesSchema.pick({ topics: true, quietHours: true, digest: true }).parse(
        saved?.data ?? {
          topics: notificationTopicSchema.options.map((topic) => ({
            topic,
            email: true,
            push: false,
            sms: false,
            whatsapp: false,
          })),
          quietHours: { enabled: false, from: "22:00", to: "08:00" },
          digest: { mode: "instant", time: "09:00" },
        },
      );
      return channelPreferencesSchema.parse({
        ...(typeof base === "object" ? base : {}),
        phone: {
          masked: phone?.verified ? mask(decrypt(phone.number)) : null,
          verified: phone?.verified ?? false,
          verifiedAt: phone?.verifiedAt ?? null,
          pending:
            phone?.hash && phone.expiresAt && phone.expiresAt > new Date().toISOString()
              ? {
                  masked: mask(decrypt(phone.number)),
                  expiresAt: phone.expiresAt,
                  attemptsLeft: Math.max(0, 5 - phone.attempts),
                }
              : null,
          devCode: null,
        },
        deliveryAvailable: Boolean(config.mail.smtpUrl || config.sms.url),
      });
    },
    async preferences(actor: AuthenticatedActor) {
      const data = await service.channels(actor);
      return {
        topics: data.topics.map((t) => ({ topic: t.topic, email: t.email, push: t.push })),
        quietHours: data.quietHours,
        deliveryAvailable: data.deliveryAvailable,
      };
    },
    async save(
      actor: AuthenticatedActor,
      input: z.infer<typeof preferencesInput> | z.infer<typeof channelsInput>,
      context: CommandContext,
    ) {
      const current = await service.channels(actor);
      return command(actor, "notification.preferences", context, async (r) => {
        const topics = notificationTopicSchema.options.map((topic) => ({
          ...current.topics.find((t) => t.topic === topic),
          topic,
          ...input.topics[topic],
        }));
        await r.upsert(`preferences:${actor.employeeId}`, "preferences", actor.employeeId, {
          topics,
          quietHours: input.quietHours,
          digest: "digest" in input ? input.digest : current.digest,
        });
        return { ok: true };
      });
    },
    async requestPhone(actor: AuthenticatedActor, number: string, context: CommandContext) {
      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      return command(actor, "notification.phone.request", context, async (r) => {
        const raw = await r.get(`phone:${actor.employeeId}`);
        const prior = raw ? storedPhoneSchema.parse(raw.data) : null;
        if (prior && new Date(prior.sentAt).getTime() > Date.now() - 60000)
          throw new AppError(429, "OTP_RATE_LIMIT", "Wait a minute before requesting another code.");
        await r.upsert(`phone:${actor.employeeId}`, "phone", actor.employeeId, {
          number: encrypt(number),
          verified: false,
          verifiedAt: null,
          hash: hash(`${actor.employeeId}:${number}:${code}`),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          attempts: 0,
          sentAt: new Date().toISOString(),
        });
        await sendVerificationCode(number, code);
        return { ok: true, masked: mask(number) };
      });
    },
    async confirmPhone(actor: AuthenticatedActor, code: string, context: CommandContext) {
      const valid = await command(actor, "notification.phone.verify", { ...context, key: undefined }, async (r) => {
        const raw = await r.get(`phone:${actor.employeeId}`);
        if (!raw) return false;
        const phone = storedPhoneSchema.parse(raw.data);
        if (!phone.hash || !phone.expiresAt || phone.expiresAt <= new Date().toISOString() || phone.attempts >= 5)
          return false;
        const matches = timingSafeEqual(
          Buffer.from(phone.hash),
          Buffer.from(hash(`${actor.employeeId}:${decrypt(phone.number)}:${code}`)),
        );
        await r.update(
          raw.id,
          {
            ...phone,
            attempts: phone.attempts + 1,
            ...(matches ? { verified: true, verifiedAt: new Date().toISOString(), hash: null, expiresAt: null } : {}),
          },
          raw.version,
        );
        return matches;
      });
      if (!valid) throw new ValidationError("INVALID_OTP", "The code is invalid or expired.");
      return { ok: true };
    },
    deletePhone(actor: AuthenticatedActor, context: CommandContext) {
      return command(actor, "notification.phone.delete", context, async (r) => {
        await r.remove(`phone:${actor.employeeId}`);
        return { ok: true };
      });
    },
  };
  return service;
}
