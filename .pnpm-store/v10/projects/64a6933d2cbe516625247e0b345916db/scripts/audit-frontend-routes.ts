/** Read-only audit of frontend HTTP method/path contracts against registered Express routes. */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "../src/modules/auth/auth.routes.js";
import { employeeRoutes } from "../src/modules/employees/employee.routes.js";
import { identityRoutes } from "../src/modules/identity/identity.routes.js";
import { workspaceRoutes } from "../src/modules/workspace/workspace.routes.js";
import { engageRoutes } from "../src/modules/engage/engage.routes.js";
import { talentLifecycleRoutes } from "../src/modules/talent-lifecycle.routes.js";
import { payrollReportRoutes } from "../src/modules/payroll-report.routes.js";
import { timeRoutes } from "../src/modules/time.routes.js";
import { attendanceLogRoutes } from "../src/modules/attendance-log/attendance-log.routes.js";

type Route = { method: string; path: string };
type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: Layer[] } };
type Contract = Route & { file: string; line: number };
const prisma = new PrismaClient();
const registered: Route[] = [];
function collect(layers: Layer[], prefix: string): void {
  for (const layer of layers) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods))
        registered.push({
          method: method.toUpperCase(),
          path: `${prefix}${layer.route.path}`.replace(/\/$/, "") || "/",
        });
    } else if (layer.handle?.stack) collect(layer.handle.stack, prefix);
  }
}
for (const [prefix, router] of [
  ["/auth", authRoutes(prisma)],
  ["/employees", employeeRoutes(prisma)],
  ["", identityRoutes(prisma)],
  ["", workspaceRoutes(prisma)],
  ["", engageRoutes(prisma)],
  ["", talentLifecycleRoutes(prisma)],
  ["", payrollReportRoutes(prisma)],
  ["", timeRoutes(prisma)],
  ["", attendanceLogRoutes(prisma)],
] as const)
  collect((router as unknown as { stack: Layer[] }).stack, prefix);

const frontend = resolve("../gtfhrfrontend");
async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) =>
        entry.isDirectory() ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)],
      ),
    )
  )
    .flat()
    .filter((file) => /\.tsx?$/.test(file));
}
let helpers = new Map<string, ts.Expression>();
function evaluate(node: ts.Expression, choices: Map<string, boolean>): string {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, choices);
  if (ts.isConditionalExpression(node))
    return evaluate(choices.get(node.condition.getText()) ? node.whenTrue : node.whenFalse, choices);
  if (ts.isTemplateExpression(node))
    return (
      node.head.text + node.templateSpans.map((span) => evaluate(span.expression, choices) + span.literal.text).join("")
    );
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const body = helpers.get(node.expression.text);
    if (body) return evaluate(body, choices);
  }
  return ":value";
}
const contracts: Contract[] = [];
const unresolved: { file: string; line: number; expression: string }[] = [];
for (const file of await files(resolve(frontend, "services/api"))) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  helpers = new Map();
  function findHelpers(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isArrowFunction(node.initializer) &&
      !ts.isBlock(node.initializer.body)
    )
      helpers.set(node.name.text, node.initializer.body);
    ts.forEachChild(node, findHelpers);
  }
  findHelpers(source);
  function parseLive(node: ts.Expression, choices: Map<string, boolean>): void {
    if (ts.isConditionalExpression(node)) {
      for (const value of [false, true])
        parseLive(value ? node.whenTrue : node.whenFalse, new Map([...choices, [node.condition.getText(), value]]));
      return;
    }
    if (!ts.isObjectLiteralExpression(node)) {
      unresolved.push({
        file: relative(frontend, file),
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        expression: node.getText(),
      });
      return;
    }
    const properties = node.properties.filter(ts.isPropertyAssignment);
    const path = properties.find((p) => p.name.getText() === "path")?.initializer;
    const method = properties.find((p) => p.name.getText() === "method")?.initializer;
    if (!path) return;
    const conditions = new Set<string>();
    function findConditions(n: ts.Node): void {
      if (ts.isConditionalExpression(n) && !choices.has(n.condition.getText())) conditions.add(n.condition.getText());
      ts.forEachChild(n, findConditions);
    }
    findConditions(path);
    if (method) findConditions(method);
    const combinations = [...conditions];
    for (let mask = 0; mask < 2 ** combinations.length; mask++) {
      const context = new Map(choices);
      combinations.forEach((condition, i) => context.set(condition, Boolean(mask & (1 << i))));
      const pattern = evaluate(path, context).split("?")[0] ?? "";
      const item = {
        method: method ? evaluate(method, context) : "GET",
        path: pattern.replace(/\/$/, ""),
        file: relative(frontend, file),
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      };
      if (item.path.startsWith("/")) contracts.push(item);
      else unresolved.push({ file: item.file, line: item.line, expression: path.getText() });
    }
  }
  function visit(node: ts.Node): void {
    if (ts.isPropertyAssignment(node) && node.name.getText() === "live") parseLive(node.initializer, new Map());
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "liveRequest" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    )
      parseLive(node.arguments[0], new Map());
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "fetch" &&
      node.arguments[0] &&
      ts.isTemplateExpression(node.arguments[0])
    ) {
      const url = evaluate(node.arguments[0], new Map());
      const path = url.split("/api/v1")[1];
      if (path)
        contracts.push({
          method: "GET",
          path,
          file: relative(frontend, file),
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function matches(contract: Route, route: Route): boolean {
  if (contract.method !== route.method) return false;
  const left = contract.path.split("/");
  const right = route.path.split("/");
  return (
    left.length === right.length &&
    left.every((part, i) => part.startsWith(":") || right[i]?.startsWith(":") || part === right[i])
  );
}
const missing = contracts.filter((contract) => !registered.some((route) => matches(contract, route)));
const report = {
  scope:
    "HTTP method/path coverage. Query, body, response validation and authorization require integration tests. Dynamic identifiers are normalized as :value; health routes outside /api/v1 are excluded.",
  registeredCount: registered.length,
  frontendOperationCount: contracts.length,
  missing,
  unresolved,
  contracts,
  registered,
};
await mkdir(".runtime", { recursive: true });
await writeFile(".runtime/frontend-route-audit.json", JSON.stringify(report, null, 2));
await mkdir("docs/api", { recursive: true });
await writeFile("docs/api/endpoints.json", JSON.stringify(report, null, 2) + "\n");
const inventory = [...registered].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const markdown = [
  "# API route coverage",
  "",
  "Generated by `pnpm audit:api`. This command constructs the registered Express module routers without making database requests and compares them with frontend service requests.",
  "",
  `- Registered API operations: ${registered.length}`,
  `- Frontend request variants: ${contracts.length}`,
  `- Missing method/path matches: ${missing.length}`,
  `- Unresolved request expressions: ${unresolved.length}`,
  "",
  "Paths below are relative to `/api/v1`. `:value` in the JSON mapping represents a dynamic frontend identifier. Query, payload, response shape, workflow behavior and permissions are verified separately by integration tests; path coverage alone does not prove those behaviors.",
  "",
  "| Method | Path | Frontend service references |",
  "| --- | --- | --- |",
  ...inventory.map(
    (route) =>
      `| ${route.method} | \`${route.path}\` | ${[...new Set(contracts.filter((contract) => matches(contract, route)).map((contract) => `\`${contract.file.replaceAll("\\", "/")}:${contract.line}\``))].join("<br>") || "Backend / operational API"} |`,
  ),
  "",
];
await writeFile("docs/api/endpoints.md", markdown.join("\n"));
console.info(
  JSON.stringify(
    {
      registeredCount: report.registeredCount,
      frontendOperationCount: report.frontendOperationCount,
      missing,
      unresolved,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
if (missing.length || unresolved.length) process.exitCode = 1;
