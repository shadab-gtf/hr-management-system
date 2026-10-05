import { decodeJwt } from "jose";
import { config } from "../../config/index.js";
import { AuthenticationError } from "../../core/errors/AuthenticationError.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { verifyAccessToken } from "../../core/security/tokens.js";
import type { RealtimeTicket } from "../../contracts/realtime.js";
import { realtimeTickets, type TicketStore } from "./realtime.tickets.js";

export function createRealtimeService(tickets: TicketStore = realtimeTickets) {
  return {
    /**
     * Issues a single-use socket ticket for the authenticated caller. Works for accounts without roles: the socket
     * only ever carries wake-up signals, never data. The ticket is bound to the access token's session so that
     * "sign out everywhere" and token expiry also end the socket.
     */
    async ticket(actor: AuthenticatedActor, bearer: string): Promise<RealtimeTicket> {
      const claims = await verifyAccessToken(bearer);
      if (claims.employeeId !== actor.employeeId)
        throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");
      const { exp } = decodeJwt(bearer);
      if (typeof exp !== "number") throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");
      const issued = tickets.issue({
        employeeId: actor.employeeId,
        claims: { issuedAt: claims.issuedAt, mfaVerified: claims.mfaVerified },
        sessionExpiresAt: exp * 1000,
      });
      return { ticket: issued.ticket, expiresAt: issued.expiresAt.toISOString(), url: config.realtime.publicUrl };
    },
  };
}

export type RealtimeService = ReturnType<typeof createRealtimeService>;
