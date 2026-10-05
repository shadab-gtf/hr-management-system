# Standalone backend rules

- This project is Node.js + TypeScript + Express + Prisma + PostgreSQL. Do not add Next.js runtime dependencies,
  `server-only`, browser/UI code, or aliases into `gtfhrfrontend/`.
- Follow the layout in `docs/architecture/README.md`: a feature is `src/modules/<name>/` with routes, controller,
  service, repository and schema files; register it in `src/routes/index.ts`. Inside `src/`, only repositories call
  Prisma (the `/ready` probe excepted), only `core/middleware/error.middleware.ts` writes error responses, and only
  `src/config/env.ts` reads `process.env`.
- Validate external input with `validate()` at the route, authenticate bearer tokens, authorize roles before database
  access, parameterize queries through Prisma, and write audit events in the same transaction as sensitive mutations.
- Throw `AppError` subclasses for expected failures; never return ad-hoc error JSON.
- Never log access tokens, passwords, secrets, or HR payloads. Keep secrets in this folder's ignored `.env`, not in
  frontend environment files.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` from this directory.
