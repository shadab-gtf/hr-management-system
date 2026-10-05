import type { MailOutbox, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { documentSchema } from "../../contracts/workplace.js";
import { jsonValue } from "../workspace/workspace.repository.js";
export function createDeliveryRepository(prisma: PrismaClient) {
  return {
    async dispatchOne(send: (mail: MailOutbox) => Promise<void>): Promise<boolean> {
      return prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM mail_outbox WHERE status IN ('queued','failed') AND attempts < 5 AND next_attempt_at <= NOW() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
          const id = rows[0]?.id;
          if (!id) return false;
          const mail = await tx.mailOutbox.findUniqueOrThrow({ where: { id } });
          try {
            await send(mail);
            await tx.mailOutbox.update({
              where: { id },
              data: { status: "sent", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
            });
          } catch {
            await tx.mailOutbox.update({
              where: { id },
              data: {
                status: "failed",
                attempts: { increment: 1 },
                nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** mail.attempts),
                lastError: "Delivery provider rejected the message or was unavailable.",
              },
            });
          }
          return true;
        },
        { timeout: 30000 },
      );
    },
    scanning() {
      return prisma.workspaceRecord.findMany({
        where: { kind: { in: ["document", "resume"] }, state: "scanning" },
        orderBy: { createdAt: "asc" },
        take: 10,
      });
    },
    file(id: string) {
      return prisma.privateFile.findUnique({ where: { id } });
    },
    async completeScan(id: string, version: number, clean: boolean) {
      return prisma.$transaction(
        async (tx) => {
          const row = await tx.workspaceRecord.findUnique({ where: { id } });
          if (!row || row.version !== version || row.state !== "scanning") return;
          const document =
            row.kind === "resume"
              ? z
                  .object({ scanState: z.enum(["scanning", "clean", "rejected"]) })
                  .loose()
                  .parse(row.data)
              : documentSchema.parse(row.data);
          await tx.workspaceRecord.update({
            where: { id },
            data: {
              state: clean ? "clean" : "rejected",
              version: { increment: 1 },
              data: jsonValue({ ...document, scanState: clean ? "clean" : "rejected" }),
            },
          });
          if (!clean) await tx.privateFile.deleteMany({ where: { id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    },
  };
}
