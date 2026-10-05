import { newId } from "../database/ids.js";
import type { TransactionClient } from "../database/transaction.js";

export interface EmailMessage {
  to: string;
  /** Template key for reporting, e.g. `identity.invite`. */
  template: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Queues an email inside the caller's transaction; the mail dispatcher sends it after commit.
 * NEVER put passwords, OTPs that grant access by themselves, salary or bank details in an email (pwd.md):
 * send a single-use link instead.
 */
export async function queueEmail(tx: TransactionClient, message: EmailMessage): Promise<string> {
  const id = newId("mail");
  await tx.mailOutbox.create({
    data: {
      id,
      to: message.to,
      template: message.template,
      subject: message.subject,
      textBody: message.text,
      htmlBody: message.html ?? null,
    },
  });
  return id;
}
