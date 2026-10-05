# Realtime (WebSocket)

Pushes wake-up signals to open browser tabs so new notifications, changed records and access changes appear without
a manual refresh. Contract: `src/contracts/realtime.ts` (mirrored in `gtfhrfrontend/types/realtime.ts`).

**Events never carry data.** They hold a notification id, a coarse area name, or nothing. The client then refetches
through the normal authorized endpoints, so every access rule stays in one place.

## 1. Get a ticket

`POST /api/v1/me/realtime/ticket` (bearer token; no body; works for accounts without roles)

```json
201 { "data": { "ticket": "<43 chars base64url>", "expiresAt": "2026-10-05T10:01:00Z", "url": "ws://127.0.0.1:4000/api/v1/realtime" } }
```

- 32 random bytes. Only its SHA-256 is stored, together with the employee id and the access token's session claims.
- Single use. Valid for 60 s, and never longer than the access token it was issued from.
- Rate limited to 30 per minute per person (`429 RATE_LIMITED`).
- `url` comes from `REALTIME_PUBLIC_URL` (default `ws://127.0.0.1:4000/api/v1/realtime`; use `wss://` behind TLS).
- The frontend fetches the ticket from a server action, using the httpOnly session cookie. The browser never sees the
  access token.

## 2. Open the socket

`GET /api/v1/realtime?ticket=<ticket>` (HTTP upgrade, same port as the API)

The upgrade is refused with a plain HTTP status:

| Status | When                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 403    | `Origin` is missing or not in the allowlist (`CORS_ORIGIN`, `APP_BASE_URL`)                              |
| 401    | Ticket unknown, malformed, expired or already used; account disabled, employee exited or session revoked |
| 429    | The person already has 10 open sockets                                                                   |
| 404    | Any other upgrade path                                                                                   |
| 503    | Server shutting down                                                                                     |

After the socket opens:

- Limits: 4 KB maximum frame size, no compression.
- Client messages are ignored. The one exception is `ping` (or `{"type":"ping"}`), which the server answers with
  `{"type":"pong"}`.
- The server sends a protocol ping every 30 s and drops a socket that missed the previous one.
- The socket closes with **4401** in three cases: the access token it came from expires, the account is disabled or
  exited, or the person used "sign out everywhere". The client should then fetch a new ticket. If that fails, it
  should refresh the page so the session check redirects to sign-in.
- The socket closes with **1001** when the server is shutting down.

## Events (server → client)

| Event                                 | Sent to                 | Meaning                                                                     |
| ------------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `{"type":"ready"}`                    | the new socket          | Authenticated and subscribed                                                |
| `{"type":"notification","id":"nt_…"}` | the recipient's sockets | A notification was committed for this person                                |
| `{"type":"changed","area":"leave"}`   | every socket            | An audited write happened in this area                                      |
| `{"type":"access"}`                   | that person's sockets   | Roles, scopes or account changed. The socket was re-validated first         |
| `{"type":"resync"}`                   | every socket            | The server's database listener reconnected, so signals may have been missed |
| `{"type":"pong"}`                     | the sender              | Reply to a client ping                                                      |

The areas are `people`, `time`, `leave`, `pay`, `talent`, `lifecycle`, `workplace`, `engage`, `access` and `reports`.
Changes in the same area are combined into one broadcast every 400 ms.

## How signals are produced

One dedicated PostgreSQL connection runs `LISTEN` on three channels. It reconnects with jittered backoff from 1 s up
to 30 s. Triggers are defined in `prisma/sql/90-realtime.sql` and migration `20261005130000_realtime_channels`:

- `gtf_notifications`: `AFTER INSERT ON notifications` (already existed). Payload: `{id, employeeId}`.
- `gtf_changes`: `AFTER INSERT ON audit_log`. Payload: `{area}`. `realtime_area(action, entity)` maps the first
  segment of the audit action, then of the entity, to an area. Anything unmatched maps to `workplace`.
- `gtf_access`: fires on:
  - `role_assignments` and `role_scopes`: insert, update or delete
  - `user_accounts`: insert, delete, or a change to `disabled_at`
  - `account_security`: a change to `revoked_before`
  - `employees`: a change to `status`

  Payload: `{employeeId}`.

`pg_notify` is transactional, so a signal is delivered only after commit. Identical payloads within one transaction are
merged, so a bulk import produces one signal per area. Payload content is never logged.

## Operations

- The hub runs whether or not `BACKGROUND_JOBS_ENABLED` is set. On SIGINT or SIGTERM it closes the sockets (1001) and
  the listener before the HTTP server stops.
- **Single instance.** Tickets and socket registries live in process memory. With several API instances, either route
  `/api/v1/me/realtime/ticket` and `/api/v1/realtime` to the same instance with sticky sessions, or move tickets to a
  shared store. Every instance listens to PostgreSQL itself, so fan-out across instances already works.
- A reverse proxy must forward `Upgrade` and `Connection` headers, and its idle timeout must be longer than 30 s.
