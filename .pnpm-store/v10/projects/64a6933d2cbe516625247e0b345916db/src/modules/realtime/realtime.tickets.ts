import { createHash, randomBytes } from "node:crypto";

/** What a ticket proves: who asked for it and which session (access token) it came from. */
export interface TicketHolder {
  employeeId: string;
  /** Claims of the access token used to obtain the ticket; re-checked with `loadActor` while the socket lives. */
  claims: { issuedAt: number; mfaVerified: boolean };
  /** When that access token expires (ms); the socket closes then and the client fetches a fresh ticket. */
  sessionExpiresAt: number;
}

export const TICKET_TTL_MS = 60_000;
const MAX_OUTSTANDING_TICKETS = 50_000;

interface Entry extends TicketHolder {
  expiresAt: number;
}

const hash = (ticket: string) => createHash("sha256").update(ticket).digest("hex");

/**
 * Single-use socket tickets kept in this process's memory (only the SHA-256 is stored).
 *
 * Limitation: one API instance. With several instances behind a load balancer, either pin `/api/v1/realtime` and
 * `/api/v1/me/realtime/ticket` to the same instance (sticky sessions) or move this store to a shared table.
 */
export function createTicketStore(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();

  function sweep() {
    const at = now();
    for (const [key, entry] of entries) if (entry.expiresAt <= at) entries.delete(key);
  }
  const sweeper = setInterval(sweep, TICKET_TTL_MS).unref();

  return {
    issue(holder: TicketHolder): { ticket: string; expiresAt: Date } {
      if (entries.size >= MAX_OUTSTANDING_TICKETS) sweep();
      const ticket = randomBytes(32).toString("base64url");
      const expiresAt = Math.min(now() + TICKET_TTL_MS, holder.sessionExpiresAt);
      entries.set(hash(ticket), { ...holder, expiresAt });
      return { ticket, expiresAt: new Date(expiresAt) };
    },
    /** Returns the holder once; a reused, unknown or expired ticket yields null. */
    redeem(ticket: string): TicketHolder | null {
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) return null;
      const key = hash(ticket);
      const entry = entries.get(key);
      entries.delete(key);
      if (!entry || entry.expiresAt <= now()) return null;
      return { employeeId: entry.employeeId, claims: entry.claims, sessionExpiresAt: entry.sessionExpiresAt };
    },
    get size() {
      return entries.size;
    },
    close() {
      clearInterval(sweeper);
      entries.clear();
    },
  };
}

export type TicketStore = ReturnType<typeof createTicketStore>;

/** The process-wide store shared by the ticket route and the socket server. */
export const realtimeTickets: TicketStore = createTicketStore();
