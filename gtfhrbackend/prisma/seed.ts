/**
 * Development seed: loads the synthetic data exported from the frontend mock (prisma/seed-data/mock-store.json),
 * with dates shifted so "today" in the data is today. Runs `prisma/seeds/00-core.ts` first, then every other
 * `prisma/seeds/<NN>-<module>.ts` in name order; each exports `default async function seed(ctx: SeedContext)`.
 * Module seeds must be re-runnable (`createMany({ skipDuplicates: true })` or upserts).
 *
 *   pnpm db:seed:dev
 */
import "dotenv/config";
import { readdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createSeedContext, type SeedContext } from "./seeds/context.js";

const prisma = new PrismaClient();
const seedsDir = new URL("./seeds/", import.meta.url);
const only = process.argv.slice(2);

try {
  const ctx = createSeedContext(prisma, new URL("./seed-data/mock-store.json", import.meta.url));
  const files = readdirSync(seedsDir)
    .filter((file) => /^\d{2}-[a-z0-9-]+\.ts$/.test(file))
    .filter((file) => only.length === 0 || file.startsWith("00-") || only.some((name) => file.includes(name)))
    .sort();
  for (const file of files) {
    console.info(`seed ${file}`);
    const module = (await import(new URL(file, seedsDir).href)) as { default: (ctx: SeedContext) => Promise<void> };
    await module.default(ctx);
  }
  console.info("Seed complete.");
} finally {
  await prisma.$disconnect();
}
