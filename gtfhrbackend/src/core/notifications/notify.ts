import { newId } from "../database/ids.js";
import type { TransactionClient } from "../database/transaction.js";

/** Same kinds as the frontend notification contract. */
export type NotificationKind = "approval" | "leave" | "payroll" | "helpdesk" | "system";

export interface NotificationInput {
  employeeId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path the notification opens, e.g. `/leave`. */
  href?: string | null;
}

/**
 * Queues an in-app notification inside the caller's transaction. A database trigger publishes it to the realtime
 * hub only when the transaction commits, so a rolled-back change never notifies anyone.
 * Keep titles and bodies free of salary, bank, tax or health details (security.md).
 */
export async function notify(tx: TransactionClient, input: NotificationInput): Promise<void> {
  await tx.notification.create({
    data: {
      id: newId("nt"),
      employeeId: input.employeeId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
    },
  });
}

/** Notifies several people with the same message (duplicates removed). */
export async function notifyMany(
  tx: TransactionClient,
  employeeIds: readonly string[],
  message: Omit<NotificationInput, "employeeId">,
): Promise<void> {
  for (const employeeId of new Set(employeeIds)) await notify(tx, { ...message, employeeId });
}
