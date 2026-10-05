import { z } from "zod";

/** The ticket command takes no input (an empty JSON object, or no body at all). */
export const ticketInput = z.object({}).strict().default({});

/** Upgrade query: `?ticket=<base64url>`. */
export const upgradeQuery = z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) });

/** pg_notify payloads (trusted database triggers, still parsed defensively). */
export const notificationSignal = z.object({ id: z.string().min(1).max(64), employeeId: z.string().min(1).max(32) });
export const accessSignal = z.object({ employeeId: z.string().min(1).max(32) });
