"use server";

import { refresh } from "next/cache";
import { closeTicketRequest, replyTicket, submitTicket } from "@/lib/api/helpdesk/helpdesk.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { ticketInputSchema, ticketReplySchema } from "@/types/workplace";
import type { ActionResult } from "@/types/action";

export async function createTicketAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = ticketInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await submitTicket(parsed.data, key.data);
    refresh();
    return success(result.confidential ? "Sent confidentially to HR" : "Request raised", result.reference);
  } catch (error) {
    return failure(error);
  }
}

/* Conversation ------------------------------------------------------------- */

export async function replyTicketAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = ticketReplySchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await replyTicket(parsed.data.ticketId, parsed.data.body, key.data);
    refresh();
    return success("Reply sent");
  } catch (error) {
    return failure(error);
  }
}

export async function closeTicketAction(id: string): Promise<ActionResult> {
  try {
    await closeTicketRequest(id);
    refresh();
    return success("Request closed");
  } catch (error) {
    return failure(error);
  }
}
