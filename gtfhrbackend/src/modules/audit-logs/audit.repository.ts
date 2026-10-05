import type { Prisma } from "@prisma/client";
import type { TransactionClient } from "../../core/database/transaction.js";

export interface AuditEvent {
  actorEmployeeId: string | null;
  action: string;
  entity: string;
  entityId: string;
  requestId?: string;
  details: Prisma.InputJsonValue;
}

/** Appends an audit row inside the caller's transaction so it commits or rolls back with the change. */
export function recordAuditEvent(tx: TransactionClient, event: AuditEvent) {
  return tx.auditLog.create({
    data: {
      actorEmployeeId: event.actorEmployeeId,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      requestId: event.requestId ?? null,
      details: event.details,
    },
  });
}
