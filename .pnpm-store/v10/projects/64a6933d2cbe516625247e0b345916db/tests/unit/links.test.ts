/**
 * Every in-app link the API returns (notification hrefs, request rows, work-queue cards) must open a real page in
 * gtfhrfrontend/app; a stale path renders a 404 for the user. Test-only read of the frontend's route tree.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function frontendRoutes(): RegExp[] {
  const appDir = join(repo, "gtfhrfrontend", "app");
  return files(appDir)
    .filter((file) => file.endsWith(`${sep}page.tsx`))
    .map((file) => {
      const route = relative(appDir, join(file, ".."))
        .split(sep)
        .filter((segment) => segment && !/^\(.*\)$/.test(segment))
        .map((segment) => (/^\[.+\]$/.test(segment) ? "[^/]+" : segment.replace(/[.*+?^${}()|\\]/g, "\\$&")))
        .join("/");
      return new RegExp(`^/${route}/?$`);
    });
}

test("links returned by the API point at existing frontend pages", () => {
  const routes = frontendRoutes();
  assert.ok(routes.length > 50, "frontend route tree not found");
  const literal = /[`"'](\/(?!api\/|v1)[a-z][a-z0-9\-/[\]${}.?=&_]*)[`"']/g;
  const broken: string[] = [];
  for (const file of files(join(repo, "gtfhrbackend", "src")).filter((name) => name.endsWith(".ts"))) {
    // Express route definitions and the app's mount points are API paths, not page links.
    if (file.endsWith("routes.ts") || file.endsWith(`${sep}app.ts`)) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(literal)) {
      const value = match[1] ?? "";
      const path = (value.split("?")[0] ?? "").replace(/\$\{[^}]+\}/g, "x");
      if (!routes.some((route) => route.test(path))) broken.push(`${relative(repo, file)}: ${value}`);
    }
  }
  assert.deepEqual(broken, [], `links to pages that do not exist:\n${broken.join("\n")}`);
});
