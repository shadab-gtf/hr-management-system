import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  closeTicket,
  createTicket,
  helpdeskCategories,
  listTickets,
  replyToTicket,
  ticketDetail,
} from "@/lib/mocks/handlers/helpdesk";
import { ticketCategorySchema, ticketDetailSchema, ticketSchema, type TicketInput } from "@/types/workplace";

export const getTicketCategories = cache(async () =>
  callApi({
    schema: z.array(ticketCategorySchema),
    live: { path: "/tickets/categories" },
    mock: () => helpdeskCategories(),
  }),
);

export const getTickets = cache(async (scope: "mine" | "queue") =>
  callApi({
    schema: z.array(ticketSchema),
    live: { path: "/tickets", query: { scope }, list: true },
    mock: async () => listTickets(await mockActor(), scope),
  }),
);

export const getTicket = cache(async (id: string) =>
  callApi({
    schema: ticketDetailSchema,
    live: { path: `/tickets/${encodeURIComponent(id)}` },
    mock: async () => ticketDetail(await mockActor(), id),
  }),
);

export async function submitTicket(input: TicketInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), confidential: z.boolean() }),
    live: { method: "POST", path: "/tickets", body: input, idempotencyKey },
    mock: async () => createTicket(await mockActor(), input, idempotencyKey),
  });
}

export async function replyTicket(id: string, body: string, idempotencyKey: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/tickets/${encodeURIComponent(id)}/messages`, body: { body }, idempotencyKey },
    mock: async () => replyToTicket(await mockActor(), id, body, idempotencyKey),
  });
}

export async function closeTicketRequest(id: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/tickets/${encodeURIComponent(id)}/close`, body: {} },
    mock: async () => closeTicket(await mockActor(), id),
  });
}
