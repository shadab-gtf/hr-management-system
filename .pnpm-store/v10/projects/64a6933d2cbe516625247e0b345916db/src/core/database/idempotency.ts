import type { Prisma, PrismaClient } from "@prisma/client";
import { ConflictError } from "../errors/ConflictError.js";
import type { TransactionClient } from "./transaction.js";

interface IdempotentCommand {
  actorId: string;
  /** `Idempotency-Key` header value; when undefined the command simply runs. */
  key: string | undefined;
  /** Stable command name, e.g. `leave.request.create`. A key reused for another command is rejected. */
  command: string;
}

/**
 * Runs `work` in a transaction exactly once per (actor, key). A repeat with the same key returns the stored result
 * without re-running; concurrent repeats wait on an advisory lock instead of racing.
 * The result must be JSON-serializable (it is the response body).
 */
export async function idempotent<T>(
  prisma: PrismaClient,
  { actorId, key, command }: IdempotentCommand,
  work: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  if (!key) return prisma.$transaction(work, { timeout: 30000 });

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actorId}:${key}`}, 0))`;
    const stored = await tx.idempotencyKey.findUnique({ where: { actorId_key: { actorId, key } } });
    if (stored) {
      if (stored.command !== command)
        throw new ConflictError("IDEMPOTENCY_KEY_REUSED", "This request key was already used for a different action.");
      return stored.response as T;
    }
    const result = await work(tx);
    await tx.idempotencyKey.create({
      data: { actorId, key, command, status: 200, response: result as Prisma.InputJsonValue },
    });
    return result;
  }, { timeout: 30000 });
}
