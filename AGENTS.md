<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GTF HR architecture

- Server-only Next.js pages own reads via lib/api. Sections compose layout; UI is typed and presentational. Client feature controllers own interaction. Never put use client in page.tsx.
- Strict TypeScript; no explicit any. Keep API/fixtures server-only.
- TanStack Query handles hydrated async-data cache; React hooks handle local interaction. No component HTTP requests, duplicated initial fetches, private persistent cache or browser auth tokens.
- Use Google Sans locally, Iconsax, Sonner, Framer Motion with reduced motion, and Boneyard-generated skeletons.
- Add route/global loading and error states, Suspense, layout-matched skeletons, semantic accessible markup and next/image with dimensions.
- Run pnpm check and relevant browser checks. Keep completion/FE1.md current and distinguish mock behavior from real HR/security behavior.
