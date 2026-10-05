import type { Prisma, PrismaClient } from "@prisma/client";

export type TransactionClient = Prisma.TransactionClient;

/** Runs `work` atomically; a thrown error rolls back every write made through `tx`. */
export function withTransaction<T>(prisma: PrismaClient, work: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(work);
}
