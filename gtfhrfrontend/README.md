# GTF HR frontend

This child project owns the Next.js UI. Run frontend commands from this directory:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

The standalone Node.js + TypeScript + Prisma API project is the sibling directory [`../gtfhrbackend/`](../gtfhrbackend/README.md).

## Backend connection

The frontend now uses the standalone Express/Prisma API through typed HTTP adapters in `services/api`. There are no runtime legacy-backend or Supabase imports. Pages retain server rendering, Suspense and skeletons; server actions validate forms and forward commands. Download route handlers are authenticated backend proxies.

Configure `.env.local` using `.env.example`:

```dotenv
GTF_API_MODE=live
GTF_API_BASE_URL=http://127.0.0.1:4000
```

Start the configured backend, then restart Next.js. Explicit `GTF_API_MODE=mock` serves synthetic fixtures; live requests never fall back to fixtures on failure. Session tokens stay in HTTP-only cookies and are forwarded by server-side adapters.

Run `pnpm check` for lint, generated route types, strict TypeScript and production compilation. The backend's `pnpm audit:api` compares frontend request methods/paths with its registered routes; its integration tests also validate real frontend DTOs.

See [integration status](../completion/API-INTEGRATION.md) and [backend setup](../gtfhrbackend/README.md) for database/bootstrap/provider requirements.
