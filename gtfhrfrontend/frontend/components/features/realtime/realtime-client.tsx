"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  notificationSnapshotAction,
  realtimeTicketAction,
} from "@/lib/actions/realtime";
import {
  realtimeEventSchema,
  REALTIME_CLOSE,
  type RealtimeArea,
} from "@/types/realtime";
import { routeShowsArea } from "./area-routes";

/** Fallback polling while the socket is down. */
const POLL_INTERVAL_MS = 60_000;
/** Bursts of `changed` signals collapse into one soft refresh. */
const CHANGE_DEBOUNCE_MS = 800;
/** Application ping; a missing pong means the connection silently died (sleep, network switch). */
const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_TOASTS = 3;

type Snapshot = Map<string, boolean>;

/**
 * Live updates over WebSocket. The server sends wake-up signals only (no data). This component refetches through
 * server actions and calls `router.refresh()`, which re-renders Server Components while keeping client state, so
 * text already typed into a form is not lost.
 *
 * - `notification`: fetch the inbox snapshot, toast new items, then refresh.
 * - `changed(area)`: refresh after a short debounce, only when the current page shows that area.
 * - `access`: refresh at once so navigation and permissions match the new roles.
 * - Reconnects with exponential backoff, jitter and a fresh ticket each time.
 * - Polls every 60 s while disconnected and pauses while the tab is hidden.
 */
export function RealtimeClient({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    routerRef.current = router;
    pathnameRef.current = pathname;
  }, [router, pathname]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let connecting = false;
    let attempt = 0;
    let connectedBefore = false;
    let previous: Snapshot | null = null;
    let syncing: Promise<void> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let pongTimer: ReturnType<typeof setTimeout> | undefined;

    const visible = () => document.visibilityState === "visible";
    const refreshNow = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = undefined;
      routerRef.current.refresh();
    };
    const refreshSoon = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (!disposed) routerRef.current.refresh();
      }, CHANGE_DEBOUNCE_MS);
    };

    /** Compares the inbox with the last snapshot: toasts new unread items and refreshes when anything moved. */
    function syncNotifications(): Promise<void> {
      syncing ??= (async () => {
        try {
          const snapshot = await notificationSnapshotAction();
          if (disposed || snapshot === null) return;
          const before = previous;
          previous = new Map(snapshot.map((item) => [item.id, item.read]));
          if (before === null) return;
          const fresh = snapshot.filter(
            (item) => !item.read && !before.has(item.id),
          );
          for (const item of fresh.slice(0, MAX_TOASTS))
            toast(item.title, {
              id: item.id,
              action: {
                label: "View",
                onClick: () => {
                  routerRef.current.push("/notifications");
                },
              },
            });
          if (
            snapshot.length !== before.size ||
            snapshot.some((item) => before.get(item.id) !== item.read)
          )
            refreshNow();
        } catch {
          /* Transient; the next signal or poll retries. */
        } finally {
          syncing = null;
        }
      })();
      return syncing;
    }

    function startPolling() {
      if (pollTimer || disposed) return;
      pollTimer = setInterval(() => {
        if (visible()) void syncNotifications();
      }, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
    }
    function stopHeartbeat() {
      if (pingTimer) clearInterval(pingTimer);
      if (pongTimer) clearTimeout(pongTimer);
      pingTimer = undefined;
      pongTimer = undefined;
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimer || !visible()) return;
      const base = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt);
      attempt = Math.min(attempt + 1, 10);
      reconnectTimer = setTimeout(
        () => {
          reconnectTimer = undefined;
          void connect();
        },
        base / 2 + Math.random() * (base / 2),
      );
    }

    function onChanged(area: RealtimeArea) {
      if (routeShowsArea(pathnameRef.current, area)) refreshSoon();
    }

    async function connect() {
      if (disposed || connecting || socket || !visible()) return;
      connecting = true;
      try {
        const result = await realtimeTicketAction();
        if (disposed || !visible()) return;
        if (result.status !== "ok") {
          // Signed out or disabled: a refresh lets the workspace layout send the person to sign-in.
          if (result.status === "unauthorized") refreshNow();
          startPolling();
          scheduleReconnect();
          return;
        }
        open(result.url, result.ticket);
      } catch {
        startPolling();
        scheduleReconnect();
      } finally {
        connecting = false;
      }
    }

    function open(url: string, ticket: string) {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
      } catch {
        startPolling();
        scheduleReconnect();
        return;
      }
      socket = ws;
      let readyOnce = false;
      ws.onmessage = (message: MessageEvent<unknown>) => {
        if (typeof message.data !== "string" || message.data.length > 4_096)
          return;
        let raw: unknown;
        try {
          raw = JSON.parse(message.data);
        } catch {
          return;
        }
        const parsed = realtimeEventSchema.safeParse(raw);
        if (!parsed.success) return;
        const event = parsed.data;
        switch (event.type) {
          case "ready": {
            const reconnected = connectedBefore;
            connectedBefore = true;
            attempt = 0;
            readyOnce = true;
            stopPolling();
            // Catch up on anything missed while disconnected or hidden.
            void syncNotifications().then(() => {
              if (reconnected && !disposed) refreshSoon();
            });
            break;
          }
          case "notification":
            void syncNotifications();
            break;
          case "changed":
            onChanged(event.area);
            break;
          case "access":
            refreshNow();
            toast("Your access was updated", { id: "realtime-access-updated" });
            break;
          case "resync":
            void syncNotifications().then(() => {
              if (!disposed) refreshSoon();
            });
            break;
          case "pong":
            if (pongTimer) clearTimeout(pongTimer);
            pongTimer = undefined;
            break;
        }
      };
      ws.onopen = () => {
        stopHeartbeat();
        pingTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send("ping");
          if (pongTimer) return;
          pongTimer = setTimeout(() => {
            pongTimer = undefined;
            ws.close(4000, "heartbeat timeout");
          }, PONG_TIMEOUT_MS);
        }, PING_INTERVAL_MS);
      };
      ws.onclose = (event: CloseEvent) => {
        if (socket === ws) socket = null;
        stopHeartbeat();
        if (disposed || !visible()) return;
        startPolling();
        // Session ended or token expired: fetch a fresh ticket promptly (unauthorized → sign-in refresh).
        if (event.code === REALTIME_CLOSE.unauthorized && readyOnce)
          attempt = 0;
        scheduleReconnect();
      };
      ws.onerror = () => {
        /* `onclose` follows and handles reconnection. */
      };
    }

    function pause() {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      stopPolling();
      stopHeartbeat();
      const current = socket;
      socket = null;
      current?.close(1000, "tab hidden");
    }

    const onVisibility = () => {
      if (visible()) {
        attempt = 0;
        void connect();
      } else pause();
    };
    const onOnline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      attempt = 0;
      void connect();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    void syncNotifications();
    void connect();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (refreshTimer) clearTimeout(refreshTimer);
      pause();
    };
  }, [enabled]);

  return null;
}
