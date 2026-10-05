import "server-only";
import { callApi } from "@/lib/api/core/transport";
import { problem } from "@/lib/api/core/problem";
import { realtimeTicketSchema, type RealtimeTicket } from "@/types/realtime";

/**
 * A single-use, 60-second WebSocket ticket for the signed-in person (POST /me/realtime/ticket).
 * The bearer token stays on the server; only the opaque ticket reaches the browser.
 */
export async function getRealtimeTicket(): Promise<RealtimeTicket> {
  return callApi({
    schema: realtimeTicketSchema,
    live: { method: "POST", path: "/me/realtime/ticket", body: {} },
    mock: () => {
      throw problem(
        404,
        "REALTIME_UNAVAILABLE",
        "Realtime updates are not available in demo mode.",
      );
    },
  });
}
