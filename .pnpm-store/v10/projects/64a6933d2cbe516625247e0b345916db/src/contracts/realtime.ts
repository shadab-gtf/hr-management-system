import { z } from "zod";

/*
 * Realtime contract (WebSocket hub). Mirrored byte-for-byte in gtfhrfrontend/types/realtime.ts.
 *
 * Events are wake-up signals only: they never carry names, amounts or record content. A client that receives one
 * refetches through the normal authorized APIs, so access rules stay in exactly one place.
 */

/** Coarse module an audited change belongs to. */
export const realtimeAreaSchema = z.enum([
  "people",
  "time",
  "leave",
  "pay",
  "talent",
  "lifecycle",
  "workplace",
  "engage",
  "access",
  "reports",
]);

/** POST /api/v1/me/realtime/ticket — a single-use, 60-second ticket for opening one socket. */
export const realtimeTicketSchema = z.object({
  /** Opaque; pass as `?ticket=` on the socket URL. Only its hash is stored. */
  ticket: z.string().min(32).max(128),
  expiresAt: z.iso.datetime({ offset: true }),
  /** WebSocket endpoint (ws:// or wss://). */
  url: z.string().regex(/^wss?:\/\//),
});

/** Server → client messages. */
export const realtimeEventSchema = z.discriminatedUnion("type", [
  /** The socket is authenticated and subscribed. */
  z.object({ type: z.literal("ready") }),
  /** A notification was created for this person; fetch the inbox. */
  z.object({ type: z.literal("notification"), id: z.string().min(1).max(64) }),
  /** Something in this area changed for someone; refresh if the current page shows that area. */
  z.object({ type: z.literal("changed"), area: realtimeAreaSchema }),
  /** This person's roles or account changed; refresh the page so navigation and permissions update. */
  z.object({ type: z.literal("access") }),
  /** Events may have been missed (server listener reconnected); refetch everything on screen. */
  z.object({ type: z.literal("resync") }),
  /** Reply to a client `ping`. */
  z.object({ type: z.literal("pong") }),
]);

/** Close codes the server uses (4xxx are application codes). */
export const REALTIME_CLOSE = {
  /** Session ended, account disabled or employee exited: fetch a new ticket (or sign in again). */
  unauthorized: 4401,
  /** Server shutting down or restarting. */
  goingAway: 1001,
} as const;

export type RealtimeArea = z.infer<typeof realtimeAreaSchema>;
export type RealtimeTicket = z.infer<typeof realtimeTicketSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
