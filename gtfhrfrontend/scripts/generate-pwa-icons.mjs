// Generates PWA icons from the original GTF logo (aspect ratio preserved, never
// stretched or recoloured). Run: node scripts/generate-pwa-icons.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

// sharp ships with Next.js; resolve it through Next so no new dependency is added.
const require = createRequire(require_resolve_next());
const sharp = require("sharp");

function require_resolve_next() {
  return createRequire(import.meta.url).resolve("next/package.json");
}

const source = path.resolve("public/brand/gtf-logo.png");
const out = path.resolve("public/icons");
mkdirSync(out, { recursive: true });

// Plain white mounting surface (brand guidance: tested neutral surface behind the logo).
const surface = { r: 255, g: 255, b: 255, alpha: 1 };

async function icon(size, file, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const logo = await sharp(source).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: surface } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, file));
  console.log("wrote", file);
}

await icon(192, "icon-192.png", 0.12);
await icon(512, "icon-512.png", 0.12);
// Maskable icons need the logo inside the 80% safe zone.
await icon(512, "maskable-512.png", 0.22);
await icon(180, "apple-touch-icon.png", 0.14);
await icon(96, "shortcut-96.png", 0.12);
