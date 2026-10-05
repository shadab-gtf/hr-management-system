/**
 * Exports the synthetic mock store as JSON for the backend's development seed, so the backend never imports
 * frontend code. Dates are relative to `today` in the export; the backend seed shifts them to the current day.
 *
 *   node --experimental-strip-types scripts/export-mock-seed.mts ../gtfhrbackend/prisma/seed-data/mock-store.json
 */
import { createJiti } from "jiti";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] ?? "../gtfhrbackend/prisma/seed-data/mock-store.json");
const jiti = createJiti(import.meta.url, {
  // Mirrors tsconfig.json "paths" (most specific first).
  alias: {
    "@/components/": resolve(frontend, "frontend/components") + "/",
    "@/hooks/": resolve(frontend, "frontend/hooks") + "/",
    "@/lib/api/": resolve(frontend, "services/api") + "/",
    "@/": frontend,
    "server-only": resolve(frontend, "scripts/server-only-stub.mjs"),
  },
});

const { db } = (await jiti.import("@/lib/mocks/store")) as { db: () => Record<string, unknown> };
const store = db();
const { organization } = (await jiti.import("@/lib/mocks/seed/organization")) as { organization: unknown };
const { personas } = (await jiti.import("@/lib/mocks/seed/people")) as { personas: unknown };

function plain(_key: string, value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  if (value instanceof Uint8Array) return undefined;
  return value;
}

const { idempotency: _idempotency, photos: _photos, counter: _counter, version: _version, ...data } = store;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ organization, personas, ...data }, plain, 1));
console.info(`Exported ${Object.keys(data).length} mock collections (today ${String(store.today)}) to ${output}`);
