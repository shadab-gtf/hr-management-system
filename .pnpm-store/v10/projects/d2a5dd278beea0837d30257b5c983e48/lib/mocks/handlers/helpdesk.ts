import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant } from "@/lib/mocks/store";
import { notify } from "@/lib/mocks/handlers/notifications";
import { can, idempotent, me, ref, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import type { Ticket, TicketCategory, TicketInput } from "@/types/workplace";

const ticketCategories: TicketCategory[] = [
  { id: "tc_it", name: "IT & access", confidential: false, description: "Laptops, accounts, software seats." },
  { id: "tc_leave", name: "Leave & attendance", confidential: false, description: "Balances, comp-off, corrections." },
  { id: "tc_payroll", name: "Payroll & tax", confidential: true, description: "Salary, deductions, tax proofs." },
  { id: "tc_policy", name: "Policies", confidential: false, description: "Handbook and policy questions." },
  { id: "tc_facilities", name: "Workplace & facilities", confidential: false, description: "Seating, access cards, travel desk." },
  { id: "tc_grievance", name: "Confidential concern", confidential: true, description: "Routed only to the designated HR partner." },
];

export function helpdeskCategories(): TicketCategory[] {
  return ticketCategories;
}

function toTicket(ticket: (ReturnType<typeof db>)["tickets"][number]): Ticket {
  const category = ticketCategories.find((item) => item.id === ticket.categoryId);
  return {
    id: ticket.id,
    reference: ticket.reference,
    subject: ticket.subject,
    category: category?.name ?? "General",
    confidential: category?.confidential ?? false,
    state: ticket.state,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    assignee: ticket.assignee,
    lastMessage: ticket.lastMessage,
  };
}

export function listTickets(actor: MockActor, scope: "mine" | "queue"): Ticket[] {
  if (scope === "queue") requireCapability(actor, "helpdesk.queue");
  else requireCapability(actor, "helpdesk.request.self");
  return db()
    .tickets.filter((ticket) => {
      if (scope === "mine") return ticket.employeeId === actor.employeeId;
      const confidential = ticketCategories.find((item) => item.id === ticket.categoryId)?.confidential ?? false;
      return ticket.employeeId !== actor.employeeId && !confidential;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toTicket);
}

export function createTicket(actor: MockActor, input: TicketInput, key: string | undefined) {
  requireCapability(actor, "helpdesk.request.self");
  return idempotent(key, () => {
    const category = ticketCategories.find((item) => item.id === input.categoryId);
    if (!category) throw problem(422, "UNKNOWN_CATEGORY", "Choose a category.", { fieldErrors: { categoryId: "Choose a category." } });
    const store = db();
    const reference = nextReference("HD");
    const now = nowInstant();
    store.tickets.push({
      id: `tk_${store.counter}`,
      reference,
      employeeId: actor.employeeId,
      categoryId: category.id,
      subject: input.subject,
      description: input.description,
      state: "open",
      priority: input.priority,
      createdAt: now,
      updatedAt: now,
      assignee: category.confidential ? "Designated HR partner" : null,
      lastMessage: "Request received. We'll reply here.",
    });
    return { reference, confidential: category.confidential };
  });
}

/* Conversation ------------------------------------------------------------- */

function ticketInScope(actor: MockActor, id: string) {
  const ticket = db().tickets.find((item) => item.id === id);
  const own = ticket?.employeeId === actor.employeeId;
  const queue = can(actor, "helpdesk.queue");
  // Confidential categories never appear in the shared queue.
  const confidential = ticketCategories.find((item) => item.id === ticket?.categoryId)?.confidential ?? false;
  if (!ticket || (!own && !(queue && !confidential)))
    throw problem(404, "NOT_FOUND", "We couldn't find that request.");
  return { ticket, own };
}

export function ticketDetail(actor: MockActor, id: string) {
  const { ticket, own } = ticketInScope(actor, id);
  const store = db();
  const requester = employeeById(ticket.employeeId);
  const messages = store.ticketMessages.get(id) ?? [
    { id: `${id}_m0`, author: requester?.name ?? "Employee", fromHr: false, body: ticket.description, at: ticket.createdAt },
  ];
  return {
    ...toTicket(ticket),
    description: ticket.description,
    requester: requester ? ref(requester) : null,
    messages,
    canReply: ticket.state !== "closed",
    canClose: own && ticket.state !== "closed",
    viewerIsHr: !own,
  };
}

export function replyToTicket(actor: MockActor, id: string, body: string, key: string | undefined) {
  return idempotent(key, () => {
    const { ticket, own } = ticketInScope(actor, id);
    if (ticket.state === "closed") throw problem(409, "TICKET_CLOSED", "This request is closed. Raise a new one if you still need help.");
    const store = db();
    const author = me(actor).name;
    const thread = store.ticketMessages.get(id) ?? [
      { id: `${id}_m0`, author: employeeById(ticket.employeeId)?.name ?? "Employee", fromHr: false, body: ticket.description, at: ticket.createdAt },
    ];
    store.counter += 1;
    thread.push({ id: `tm_${store.counter}`, author, fromHr: !own, body, at: nowInstant() });
    store.ticketMessages.set(id, thread);
    ticket.lastMessage = body;
    ticket.updatedAt = nowInstant();
    ticket.state = own ? "in_progress" : "awaiting_you";
    if (!own) {
      ticket.assignee ??= author;
      notify(ticket.employeeId, "helpdesk", "HR replied to your request", ticket.subject, `/helpdesk/${ticket.id}`);
    }
    return { ok: true };
  });
}

export function closeTicket(actor: MockActor, id: string) {
  const { ticket, own } = ticketInScope(actor, id);
  if (!own) throw problem(403, "FORBIDDEN", "Only the requester can close this request.");
  ticket.state = "closed";
  ticket.updatedAt = nowInstant();
  return { ok: true };
}
