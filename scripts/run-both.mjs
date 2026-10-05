/**
 * Runs one script ("dev" or "start") in gtfhrbackend and gtfhrfrontend together, with prefixed output.
 * Ctrl+C, or either process exiting, stops both.
 *
 *   npm run dev      → backend :4000 (tsx watch) + frontend :3000 (next dev)
 *   npm run start    → both production builds (run `npm run build` first)
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = process.argv[2] ?? "dev";
const root = fileURLToPath(new URL("../", import.meta.url));
const apps = [
  { name: "backend ", dir: "gtfhrbackend", color: "\x1b[36m" },
  { name: "frontend", dir: "gtfhrfrontend", color: "\x1b[35m" },
];

let stopping = false;
const children = apps.map((app) => {
  const child = spawn("pnpm", ["run", script], {
    cwd: `${root}${app.dir}`,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const prefix = `${app.color}[${app.name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
  child.on("exit", (code) => {
    if (!stopping) {
      process.stdout.write(`${prefix}exited with code ${code ?? "?"}; stopping the other app.\n`);
      stopAll(code ?? 1);
    }
  });
  return child;
});

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    // pnpm and next spawn grandchildren; on Windows only taskkill /T stops the whole tree.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exitCode = code;
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
