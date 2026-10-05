# GTF HR frontend

This child project owns the Next.js UI. Run frontend commands from this directory:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

The standalone Node.js + TypeScript + Prisma API project is the sibling directory [`../gtfhrbackend/`](../gtfhrbackend/README.md).

## Deploy to Vercel

Import the repository into Vercel and set the project **Root Directory** to `gtfhrfrontend`. The included `vercel.json` selects the Next.js framework and uses the frozen pnpm lockfile for installation. Keep the Node.js runtime on 22.x; `package.json` declares the supported Node and pnpm versions.

Set these server-side environment variables for the **Production** environment before deploying:

```dotenv
GTF_API_MODE=live
GTF_API_BASE_URL=https://your-public-hr-api.example.com
```

`GTF_API_BASE_URL` is the public HTTPS origin of the backend, without `/api/v1` (the frontend adds that prefix). Production builds fail early if the API URL is missing or not HTTPS, or if mock mode is selected. Optional settings such as `GTF_API_TIMEOUT_MS` and `GTF_SESSION_COOKIE` use the defaults in `.env.example`.

The backend must also be deployed and reachable from Vercel. Configure its production `APP_BASE_URL` and `CORS_ORIGIN` for the frontend's stable HTTPS domain, and provision its production database, secrets and organization data independently. Do not expose backend credentials through `NEXT_PUBLIC_*` variables. Configure Preview with a separate non-production backend if preview deployments need to sign in; do not point previews at production HR data by default.

Vercel's Node.js runtime is required: this app uses Server Components, Server Actions and a session proxy, so do not enable static export. After deployment, verify login, a server-side API request, and the PWA install/HTTPS permissions on the production domain.

**Upload limit:** Vercel Functions cap request bodies at 4.5 MB, while current document and receipt forms accept files up to 10 MiB through Server Actions. Uploads above the Vercel limit will be rejected before the app can handle them. Keep files below the platform limit until uploads use a direct-to-storage or equivalent flow; preserving the full 10 MiB limit on Vercel requires that follow-up.

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
