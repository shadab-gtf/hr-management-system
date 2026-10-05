<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GTF HR architecture

- This package is the frontend only. The HR API, authorization rules, database access, password/auth administration, and email sending belong in the sibling `../gtfhrbackend/` Node.js + TypeScript + Express + Prisma service.
- Frontend reads and writes must use typed HTTP clients targeting the configured backend API. Do not add database clients, Prisma, Supabase admin clients, backend business rules, Next.js API routes, or secret-bearing server integrations here.
- Server Components may render data returned by the external API; they must not query databases or import backend code. Client feature controllers own interaction. Never put `use client` in `page.tsx`.
- Strict TypeScript; no explicit `any`. Keep API DTOs typed and validate untrusted responses.
- TanStack Query handles hydrated API cache; React hooks handle local interaction. Do not duplicate initial fetches, add private persistent caches, or store bearer tokens in browser storage.
- Use Google Sans locally, Iconsax, Sonner, Framer Motion with reduced motion, and Boneyard-generated skeletons.
- Add route/global loading and error states, Suspense, layout-matched skeletons, semantic accessible markup and next/image with dimensions.
- Run pnpm check and relevant browser checks. Keep completion/FE1.md current and distinguish mock behavior from real HR/security behavior.

## API modes

`GTF_API_MODE=live` (the default) sends every operation to the backend at `GTF_API_BASE_URL`. `GTF_API_MODE=mock` serves the synthetic in-process fixtures and exists only for demos and Playwright runs; never add behaviour that works only in mock mode. The legacy Supabase adapters were removed on 2026-10-05.
