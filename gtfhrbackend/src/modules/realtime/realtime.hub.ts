import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { config } from "../../config/index.js";
import { databaseConfig } from "../../config/database.js";
import { REALTIME_CLOSE, realtimeAreaSchema, type RealtimeArea, type RealtimeEvent } from "../../contracts/realtime.js";
import { loadActor } from "../../core/middleware/auth.middleware.js";
import { logger } from "../../core/logger/logger.js";
import { API_PREFIX } from "../../utils/constants.js";
import { createRealtimeListener, type RealtimeChannel } from "./realtime.listener.js";
import { accessSignal, notificationSignal, upgradeQuery } from "./realtime.schema.js";
import { realtimeTickets, type TicketHolder, type TicketStore } from "./realtime.tickets.js";

export const REALTIME_PATH = `${API_PREFIX}/realtime`;
export const MAX_SOCKETS_PER_EMPLOYEE = 10;
const MAX_PAYLOAD_BYTES = 4 * 1024;
const HEARTBEAT_MS = 30_000;
/** Bursts of audited writes in one area collapse into one broadcast per window. */
const CHANGE_COALESCE_MS = 400;
/** A role grant touches several rows (assignment, scopes, notification); re-validate once. */
const ACCESS_COALESCE_MS = 150;

interface Client {
  socket: WebSocket;
  holder: TicketHolder;
  alive: boolean;
  expiry: NodeJS.Timeout;
}

export interface RealtimeHubOptions {
  tickets?: TicketStore;
  databaseUrl?: string;
  allowedOrigins?: readonly string[];
}

export interface RealtimeHub {
  /** Resolves once the database listener is subscribed. */
  ready: Promise<void>;
  /** Number of open sockets (all employees). */
  readonly connections: number;
  close(): Promise<void>;
}

function reject(socket: Duplex, status: number, reason: string) {
  if (!socket.writable) return socket.destroy();
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n`,
  );
}

/**
 * The WebSocket hub: authenticates upgrades with single-use tickets, fans database signals out to sockets and
 * re-validates accounts when their access changes. Events are ids/areas only; clients refetch through the API.
 * State is per process (see realtime.tickets.ts for the multi-instance note).
 */
export function attachRealtime(server: Server, prisma: PrismaClient, options: RealtimeHubOptions = {}): RealtimeHub {
  const tickets = options.tickets ?? realtimeTickets;
  const allowedOrigins = new Set(options.allowedOrigins ?? config.realtime.allowedOrigins);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES, perMessageDeflate: false });
  const byEmployee = new Map<string, Set<Client>>();
  const pendingUpgrades = new Map<string, number>();
  const changeTimers = new Map<RealtimeArea, NodeJS.Timeout>();
  const accessTimers = new Map<string, NodeJS.Timeout>();
  let closing = false;
  const isClosing = () => closing;

  const send = (client: Client, event: RealtimeEvent) => {
    if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(event));
  };
  const broadcast = (event: RealtimeEvent) => {
    for (const clients of byEmployee.values()) for (const client of clients) send(client, event);
  };
  const remove = (client: Client) => {
    clearTimeout(client.expiry);
    const set = byEmployee.get(client.holder.employeeId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) byEmployee.delete(client.holder.employeeId);
  };
  const closeClient = (client: Client, code: number, reason: string) => {
    remove(client);
    if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING)
      client.socket.close(code, reason);
  };

  /** Re-reads the account (and session revocation) for every socket of this person; closes the ones now invalid. */
  async function revalidate(employeeId: string, notify: boolean) {
    const clients = [...(byEmployee.get(employeeId) ?? [])];
    await Promise.all(
      clients.map(async (client) => {
        try {
          await loadActor(prisma, employeeId, client.holder.claims);
          if (notify) send(client, { type: "access" });
        } catch {
          closeClient(client, REALTIME_CLOSE.unauthorized, "session ended");
        }
      }),
    );
  }

  function onSignal(channel: RealtimeChannel, payload: string) {
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }
    if (channel === "gtf_notifications") {
      const parsed = notificationSignal.safeParse(data);
      if (!parsed.success) return;
      for (const client of byEmployee.get(parsed.data.employeeId) ?? [])
        send(client, { type: "notification", id: parsed.data.id });
    } else if (channel === "gtf_changes") {
      const parsed = realtimeAreaSchema.safeParse((data as { area?: unknown } | null)?.area);
      if (!parsed.success || changeTimers.has(parsed.data)) return;
      const area = parsed.data;
      changeTimers.set(
        area,
        setTimeout(() => {
          changeTimers.delete(area);
          broadcast({ type: "changed", area });
        }, CHANGE_COALESCE_MS),
      );
    } else {
      const parsed = accessSignal.safeParse(data);
      if (!parsed.success || !byEmployee.has(parsed.data.employeeId) || accessTimers.has(parsed.data.employeeId))
        return;
      const { employeeId } = parsed.data;
      accessTimers.set(
        employeeId,
        setTimeout(() => {
          accessTimers.delete(employeeId);
          void revalidate(employeeId, true);
        }, ACCESS_COALESCE_MS),
      );
    }
  }

  const listener = createRealtimeListener(options.databaseUrl ?? databaseConfig.url, {
    signal: onSignal,
    resumed() {
      // Signals were lost while the listener was down: re-check every account, then ask clients to refetch.
      void Promise.all([...byEmployee.keys()].map((employeeId) => revalidate(employeeId, false))).then(() => {
        broadcast({ type: "resync" });
      });
    },
  });
  const ready = listener.start();

  const heartbeat = setInterval(() => {
    for (const clients of byEmployee.values())
      for (const client of clients) {
        if (!client.alive) {
          remove(client);
          client.socket.terminate();
          continue;
        }
        client.alive = false;
        client.socket.ping();
      }
  }, HEARTBEAT_MS).unref();

  function accept(socket: WebSocket, holder: TicketHolder) {
    const client: Client = {
      socket,
      holder,
      alive: true,
      // The socket lives no longer than the session it was opened with; the client then fetches a new ticket.
      expiry: setTimeout(
        () => {
          closeClient(client, REALTIME_CLOSE.unauthorized, "session expired");
        },
        Math.max(0, holder.sessionExpiresAt - Date.now()),
      ),
    };
    client.expiry.unref();
    let set = byEmployee.get(holder.employeeId);
    if (!set) byEmployee.set(holder.employeeId, (set = new Set()));
    set.add(client);
    socket.on("pong", () => {
      client.alive = true;
    });
    socket.on("message", (data: RawData, isBinary: boolean) => {
      client.alive = true;
      // Clients have nothing to say except an application-level ping; everything else is ignored.
      if (isBinary) return;
      const text = (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)).toString("utf8");
      if (text === "ping" || text === '{"type":"ping"}') send(client, { type: "pong" });
    });
    socket.on("close", () => {
      remove(client);
    });
    socket.on("error", () => {
      remove(client);
      socket.terminate();
    });
    send(client, { type: "ready" });
  }

  async function onUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on("error", () => socket.destroy());
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://realtime.invalid");
    } catch {
      return reject(socket, 400, "Bad Request");
    }
    if (url.pathname !== REALTIME_PATH) return reject(socket, 404, "Not Found");
    if (closing) return reject(socket, 503, "Service Unavailable");
    // Browsers always send Origin on WebSocket handshakes; a missing or foreign one is refused (cross-site hijack).
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) return reject(socket, 403, "Forbidden");
    const query = upgradeQuery.safeParse({ ticket: url.searchParams.get("ticket") ?? "" });
    // Redeem before any await: a ticket can never be used twice, even concurrently.
    const holder = query.success ? tickets.redeem(query.data.ticket) : null;
    if (!holder) return reject(socket, 401, "Unauthorized");
    const { employeeId } = holder;
    const pending = pendingUpgrades.get(employeeId) ?? 0;
    if ((byEmployee.get(employeeId)?.size ?? 0) + pending >= MAX_SOCKETS_PER_EMPLOYEE)
      return reject(socket, 429, "Too Many Requests");
    pendingUpgrades.set(employeeId, pending + 1);
    try {
      await loadActor(prisma, employeeId, holder.claims);
    } catch {
      return reject(socket, 401, "Unauthorized");
    } finally {
      const left = (pendingUpgrades.get(employeeId) ?? 1) - 1;
      if (left > 0) pendingUpgrades.set(employeeId, left);
      else pendingUpgrades.delete(employeeId);
    }
    // `closing` may have flipped while the account was being checked.
    if (isClosing() || socket.destroyed) return reject(socket, 503, "Service Unavailable");
    wss.handleUpgrade(request, socket, head, (ws) => {
      accept(ws, holder);
    });
  }

  const upgradeListener = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    onUpgrade(request, socket, head).catch(() => {
      logger.error("realtime upgrade failed", { code: "REALTIME_UPGRADE_FAILED" });
      reject(socket, 500, "Internal Server Error");
    });
  };
  server.on("upgrade", upgradeListener);

  return {
    ready,
    get connections() {
      let total = 0;
      for (const set of byEmployee.values()) total += set.size;
      return total;
    },
    async close() {
      if (closing) return;
      closing = true;
      server.off("upgrade", upgradeListener);
      clearInterval(heartbeat);
      for (const timer of [...changeTimers.values(), ...accessTimers.values()]) clearTimeout(timer);
      changeTimers.clear();
      accessTimers.clear();
      for (const clients of [...byEmployee.values()])
        for (const client of [...clients]) closeClient(client, REALTIME_CLOSE.goingAway, "server restarting");
      // Sockets that do not finish the closing handshake promptly are dropped.
      const stragglers = [...wss.clients];
      await new Promise<void>((resolve) => {
        const deadline = setTimeout(() => {
          for (const socket of stragglers) socket.terminate();
          resolve();
        }, 1_000);
        deadline.unref();
        if (stragglers.every((socket) => socket.readyState === WebSocket.CLOSED)) {
          clearTimeout(deadline);
          resolve();
        } else
          void Promise.all(
            stragglers.map(
              (socket) =>
                new Promise<void>((done) => {
                  if (socket.readyState === WebSocket.CLOSED) done();
                  else
                    socket.once("close", () => {
                      done();
                    });
                }),
            ),
          ).then(() => {
            clearTimeout(deadline);
            resolve();
          });
      });
      await new Promise<void>((resolve) => {
        wss.close(() => {
          resolve();
        });
      });
      await listener.stop();
    },
  };
}
