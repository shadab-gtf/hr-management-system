/**
 * WebSocket hub end to end: ticket → upgrade → database signals (notifications, audited changes, access changes).
 *
 *   pnpm db:sandbox realtime --reset --migrate --seed -- tsx --test tests/integration/realtime.test.ts
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, before } from "node:test";
import test from "node:test";
import { WebSocket } from "ws";
import { config } from "../../src/config/index.js";
import { attachRealtime, type RealtimeHub } from "../../src/modules/realtime/realtime.hub.js";
import { createTicketStore, TICKET_TTL_MS } from "../../src/modules/realtime/realtime.tickets.js";
import { todayInOrgZone } from "../../src/utils/date.js";
import { dataOf, newKey, personas, useTestApi } from "../helpers/api.js";
import { expectContract, frontendContract } from "../helpers/contract.js";

const api = useTestApi();
const ORIGIN = new URL(config.appBaseUrl).origin;
/** Engineering employees with only employee access (seeded). */
const granted = "emp_0014";
const disabled = "emp_0015";
const roleless = "emp_0016";

/** A WebSocket-only server running the real hub, plus a second hub whose ticket clock the test controls. */
let wsUrl = "";
let clockUrl = "";
let offset = 0;
const clockTickets = createTicketStore(() => Date.now() + offset);
const servers: Server[] = [];
const hubs: RealtimeHub[] = [];

async function startHub(tickets?: ReturnType<typeof createTicketStore>): Promise<string> {
  const server = createServer((_request, response) => {
    response.statusCode = 404;
    response.end();
  });
  const hub = attachRealtime(server, api.prisma, tickets ? { tickets } : {});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  await hub.ready;
  servers.push(server);
  hubs.push(hub);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `ws://127.0.0.1:${address.port}/api/v1/realtime`;
}

before(async () => {
  wsUrl = await startHub();
  clockUrl = await startHub(clockTickets);
});
after(async () => {
  clockTickets.close();
  await Promise.all(hubs.map((hub) => hub.close()));
  for (const server of servers) server.close();
});

interface Ticket {
  ticket: string;
  expiresAt: string;
  url: string;
}

async function ticketFor(employeeId: string): Promise<Ticket> {
  const response = await fetch(`${api.baseUrl}/api/v1/me/realtime/ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await api.token(employeeId)}` },
  });
  assert.equal(response.status, 201);
  return ((await response.json()) as { data: Ticket }).data;
}

interface Connection {
  socket: WebSocket;
  events: unknown[];
  /** Resolves with the first event (already received or future) matching `predicate`. */
  next(predicate: (event: Record<string, unknown>) => boolean, ms?: number): Promise<Record<string, unknown>>;
  closed: Promise<{ code: number }>;
}

/** Opens a socket; rejects with the HTTP status when the upgrade is refused. */
function connect(ticket: string, options: { origin?: string | null; url?: string } = {}): Promise<Connection> {
  const target = `${options.url ?? wsUrl}?ticket=${encodeURIComponent(ticket)}`;
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  const socket = new WebSocket(target, origin === null ? {} : { origin });
  const events: Record<string, unknown>[] = [];
  const waiters = new Set<{
    predicate: (event: Record<string, unknown>) => boolean;
    resolve: (e: Record<string, unknown>) => void;
  }>();
  socket.on("message", (data: Buffer) => {
    const event = JSON.parse(data.toString("utf8")) as Record<string, unknown>;
    events.push(event);
    for (const waiter of [...waiters])
      if (waiter.predicate(event)) {
        waiters.delete(waiter);
        waiter.resolve(event);
      }
  });
  const closed = new Promise<{ code: number }>((resolve) => {
    socket.on("close", (code) => {
      resolve({ code });
    });
  });
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => {
      reject(new Error(`HTTP ${response.statusCode}`));
      socket.terminate();
    });
    socket.once("error", reject);
    socket.once("open", () => {
      resolve({
        socket,
        events,
        closed,
        next(predicate, ms = 2_000) {
          const seen = events.find(predicate);
          if (seen) return Promise.resolve(seen);
          return new Promise((done, fail) => {
            const waiter = { predicate, resolve: done };
            waiters.add(waiter);
            setTimeout(() => {
              if (waiters.delete(waiter))
                fail(new Error(`no matching event within ${ms} ms: ${JSON.stringify(events)}`));
            }, ms).unref();
          });
        },
      });
    });
  });
}

async function open(employeeId: string): Promise<Connection> {
  const connection = await connect((await ticketFor(employeeId)).ticket);
  await connection.next((event) => event.type === "ready");
  return connection;
}

test("ticket issue matches the frontend contract and opens an authenticated socket", async () => {
  const realtime = await frontendContract("realtime");
  const response = await fetch(`${api.baseUrl}/api/v1/me/realtime/ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await api.token(personas.employee)}` },
  });
  assert.equal(response.status, 201);
  const ticket = ((await response.json()) as { data: Ticket }).data;
  expectContract(realtime.realtimeTicketSchema, ticket);
  assert.equal(ticket.url, config.realtime.publicUrl);
  assert.ok(Date.parse(ticket.expiresAt) - Date.now() <= TICKET_TTL_MS);

  const connection = await connect(ticket.ticket);
  const ready = await connection.next((event) => event.type === "ready");
  expectContract(realtime.realtimeEventSchema, ready);
  // Application ping is answered; any other client message is ignored.
  connection.socket.send("hello");
  connection.socket.send("ping");
  expectContract(realtime.realtimeEventSchema, await connection.next((event) => event.type === "pong"));
  connection.socket.close();
  await connection.closed;

  // Unauthenticated callers cannot get a ticket.
  const anonymous = await fetch(`${api.baseUrl}/api/v1/me/realtime/ticket`, { method: "POST" });
  assert.equal(anonymous.status, 401);
});

test("an account with no roles can still open a socket (signals carry no data)", async () => {
  const saved = await api.prisma.roleAssignment.findMany({ where: { employeeId: roleless } });
  await api.prisma.roleAssignment.deleteMany({ where: { employeeId: roleless } });
  try {
    const connection = await open(roleless);
    connection.socket.close();
    await connection.closed;
  } finally {
    await api.prisma.roleAssignment.createMany({ data: saved });
  }
});

test("reused, expired, malformed and missing tickets are refused", async () => {
  const { ticket } = await ticketFor(personas.employee);
  const first = await connect(ticket);
  await assert.rejects(connect(ticket), /HTTP 401/);
  first.socket.close();

  await assert.rejects(connect("not-a-ticket"), /HTTP 401/);
  await assert.rejects(connect(""), /HTTP 401/);
  await assert.rejects(connect("A".repeat(43)), /HTTP 401/);

  const fresh = clockTickets.issue({
    employeeId: personas.employee,
    claims: { issuedAt: Date.now(), mfaVerified: true },
    sessionExpiresAt: Date.now() + 15 * 60_000,
  });
  offset = TICKET_TTL_MS + 1_000;
  try {
    await assert.rejects(connect(fresh.ticket, { url: clockUrl }), /HTTP 401/);
  } finally {
    offset = 0;
  }
  // A valid ticket on the controllable store still works (the refusal above was the clock).
  const valid = clockTickets.issue({
    employeeId: personas.employee,
    claims: { issuedAt: Date.now(), mfaVerified: true },
    sessionExpiresAt: Date.now() + 15 * 60_000,
  });
  const connection = await connect(valid.ticket, { url: clockUrl });
  connection.socket.close();
});

test("foreign or missing Origin is refused", async () => {
  await assert.rejects(
    connect((await ticketFor(personas.employee)).ticket, { origin: "https://evil.example" }),
    /HTTP 403/,
  );
  await assert.rejects(connect((await ticketFor(personas.employee)).ticket, { origin: null }), /HTTP 403/);
});

test("a notification created by a real API command is delivered within 2 s", async () => {
  const connection = await open(granted);
  const started = Date.now();
  dataOf(
    await api.as("superAdmin", "POST", `/identity/accounts/${granted}/roles/grant`, {
      body: { role: "manager", reason: "Integration test grant of manager", departmentIds: [] },
      idempotencyKey: newKey(),
    }),
  );
  const event = await connection.next((e) => e.type === "notification", 2_000);
  assert.ok(Date.now() - started < 2_000);
  const stored = await api.prisma.notification.findFirst({
    where: { employeeId: granted },
    orderBy: { createdAt: "desc" },
  });
  assert.deepEqual(event, { type: "notification", id: stored?.id });
  // The grant also reached the grantee as an access change; nobody else's socket hears either.
  assert.deepEqual(await connection.next((e) => e.type === "access"), { type: "access" });
  connection.socket.close();
});

test("a role revoke via the identity API produces {type:'access'} for that person only", async () => {
  const target = await open(granted);
  const bystander = await open(personas.employee);
  dataOf(
    await api.as("superAdmin", "POST", `/identity/accounts/${granted}/roles/revoke`, {
      body: { role: "manager", reason: "Integration test revoke of manager", departmentIds: [] },
      idempotencyKey: newKey(),
    }),
  );
  assert.deepEqual(await target.next((e) => e.type === "access"), { type: "access" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(!bystander.events.some((e) => (e as { type: string }).type === "access"));
  assert.ok(!bystander.events.some((e) => (e as { type: string }).type === "notification"));
  target.socket.close();
  bystander.socket.close();
});

test("an audited write broadcasts {type:'changed', area} with no ids or content", async () => {
  const realtime = await frontendContract("realtime");
  const watcher = await open(personas.manager);
  dataOf(
    await api.as("employee", "POST", "/engage/polls", {
      body: {
        question: "Realtime test: which day works?",
        options: ["Monday", "Friday"],
        multiple: false,
        anonymous: false,
        closesOn: todayInOrgZone(),
        department: null,
      },
      idempotencyKey: newKey(),
    }),
  );
  const event = await watcher.next((e) => e.type === "changed" && e.area === "engage");
  assert.deepEqual(event, { type: "changed", area: "engage" });
  expectContract(realtime.realtimeEventSchema, event);
  watcher.socket.close();
});

test("disabling the account closes its sockets with 4401; enabling lets it reconnect", async () => {
  const connection = await open(disabled);
  dataOf(
    await api.as("superAdmin", "POST", `/identity/accounts/${disabled}/disable`, {
      body: { reason: "Integration test account change" },
      idempotencyKey: newKey(),
    }),
  );
  const { code } = await Promise.race([
    connection.closed,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("socket stayed open")), 3_000).unref()),
  ]);
  assert.equal(code, 4401);
  // A disabled account cannot obtain a ticket either.
  const refused = await fetch(`${api.baseUrl}/api/v1/me/realtime/ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await api.token(disabled)}` },
  });
  assert.equal(refused.status, 401);
  dataOf(
    await api.as("superAdmin", "POST", `/identity/accounts/${disabled}/enable`, {
      body: { reason: "Integration test account change" },
      idempotencyKey: newKey(),
    }),
  );
  const again = await open(disabled);
  again.socket.close();
});

test("the per-person socket cap refuses the eleventh concurrent socket", async () => {
  const sockets: Connection[] = [];
  for (let i = 0; i < 10; i += 1) sockets.push(await open(personas.finance));
  await assert.rejects(connect((await ticketFor(personas.finance)).ticket), /HTTP 429/);
  for (const connection of sockets) connection.socket.close();
  await Promise.all(sockets.map((connection) => connection.closed));
});
