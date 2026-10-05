import pg from "pg";
import { logger } from "../../core/logger/logger.js";

export const REALTIME_CHANNELS = ["gtf_notifications", "gtf_changes", "gtf_access"] as const;
export type RealtimeChannel = (typeof REALTIME_CHANNELS)[number];

export interface ListenerHandlers {
  signal(channel: RealtimeChannel, payload: string): void;
  /** Called after a reconnect (not the first connect): signals sent while disconnected were lost. */
  resumed(): void;
}

/** Prisma-only URL parameters that the `pg` driver does not understand. */
const PRISMA_ONLY_PARAMS = ["schema", "connection_limit", "pool_timeout", "pgbouncer", "statement_cache_size"];

function pgConnectionString(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  for (const name of PRISMA_ONLY_PARAMS) url.searchParams.delete(name);
  return url.toString();
}

/**
 * One dedicated PostgreSQL connection that LISTENs on the realtime channels and reconnects with exponential backoff
 * (1 s → 30 s, jittered). Payload contents are never logged.
 */
export function createRealtimeListener(databaseUrl: string, handlers: ListenerHandlers) {
  const connectionString = pgConnectionString(databaseUrl);
  let client: pg.Client | undefined;
  let stopped = false;
  const isStopped = () => stopped;
  let attempt = 0;
  let connectedOnce = false;
  let retry: NodeJS.Timeout | undefined;
  let ready: Promise<void> | undefined;
  let markReady: (() => void) | undefined;

  function scheduleReconnect() {
    if (stopped || retry) return;
    const base = Math.min(30_000, 1_000 * 2 ** attempt);
    attempt += 1;
    retry = setTimeout(
      () => {
        retry = undefined;
        void connect();
      },
      base / 2 + Math.random() * (base / 2),
    );
    retry.unref();
  }

  async function connect() {
    if (stopped) return;
    const next = new pg.Client({ connectionString, keepAlive: true, application_name: "gtf-hr-realtime" });
    let failed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      if (client === next) client = undefined;
      next.removeAllListeners("notification");
      void next.end().catch(() => undefined);
      if (!stopped) logger.warn("realtime listener disconnected", { code: "REALTIME_LISTENER_DOWN", attempt });
      scheduleReconnect();
    };
    next.on("error", fail);
    next.on("end", fail);
    next.on("notification", (message) => {
      if ((REALTIME_CHANNELS as readonly string[]).includes(message.channel) && message.payload)
        handlers.signal(message.channel as RealtimeChannel, message.payload);
    });
    try {
      await next.connect();
      for (const channel of REALTIME_CHANNELS) await next.query(`LISTEN ${channel}`);
    } catch {
      fail();
      return;
    }
    // `stop()` may have been called while connecting.
    if (isStopped()) {
      await next.end().catch(() => undefined);
      return;
    }
    client = next;
    attempt = 0;
    if (connectedOnce) {
      logger.info("realtime listener reconnected", { code: "REALTIME_LISTENER_UP" });
      handlers.resumed();
    }
    connectedOnce = true;
    markReady?.();
  }

  return {
    /** Starts listening; resolves once the first LISTEN succeeded (keeps retrying in the background otherwise). */
    start(): Promise<void> {
      ready ??= new Promise<void>((resolve) => {
        markReady = resolve;
      });
      void connect();
      return ready;
    },
    async stop() {
      stopped = true;
      if (retry) clearTimeout(retry);
      retry = undefined;
      markReady?.();
      const current = client;
      client = undefined;
      if (current) {
        current.removeAllListeners();
        current.on("error", () => undefined);
        await current.end().catch(() => undefined);
      }
    },
  };
}
