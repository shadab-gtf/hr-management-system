import assert from "node:assert/strict";
import { test } from "node:test";
import { dataOf, expectProblem, personas, useTestApi } from "../helpers/api.js";

const api = useTestApi();

test("health endpoint reports liveness", async () => {
  const result = await api.as(null, "GET", "/health");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: "ok", service: "gtf-hr-api" });
});

test("readiness reports the database connection", async () => {
  const result = await api.as(null, "GET", "/ready");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: "ready", database: "connected" });
});

test("protected routes require a bearer token", async () => {
  expectProblem(await api.as(null, "GET", "/employees"), 401, "UNAUTHORIZED");
});

test("a forged bearer token is rejected", async () => {
  expectProblem(
    await api.as(null, "GET", "/employees", { headers: { Authorization: "Bearer not.a.jwt" } }),
    401,
    "INVALID_TOKEN",
  );
});

test("a valid token for an unknown employee is rejected", async () => {
  const token = await api.token("emp_9999");
  expectProblem(
    await api.as(null, "GET", "/employees", { headers: { Authorization: `Bearer ${token}` } }),
    401,
    "INVALID_TOKEN",
  );
});

test("capabilities are enforced (employee cannot create employees)", async () => {
  expectProblem(await api.as("employee", "POST", "/employees", { body: {} }), 403, "FORBIDDEN");
});

test("disabled accounts and exited employees cannot reuse access tokens", async () => {
  const employee = await api.prisma.employee.findUniqueOrThrow({ where: { id: personas.employee } });
  const account = await api.prisma.userAccount.findUniqueOrThrow({ where: { employeeId: personas.employee } });
  const headers = { Authorization: `Bearer ${await api.token(personas.employee)}` };
  try {
    await api.prisma.userAccount.update({ where: { employeeId: personas.employee }, data: { disabledAt: new Date() } });
    expectProblem(await api.as(null, "GET", "/me", { headers }), 401, "INVALID_TOKEN");
    await api.prisma.userAccount.update({
      where: { employeeId: personas.employee },
      data: { disabledAt: account.disabledAt },
    });
    await api.prisma.employee.update({ where: { id: personas.employee }, data: { status: "exited" } });
    expectProblem(await api.as(null, "GET", "/me", { headers }), 401, "INVALID_TOKEN");
  } finally {
    await api.prisma.userAccount.update({
      where: { employeeId: personas.employee },
      data: { disabledAt: account.disabledAt },
    });
    await api.prisma.employee.update({ where: { id: personas.employee }, data: { status: employee.status } });
  }
});

test("server-side revocation invalidates an otherwise valid signed token", async () => {
  const headers = { Authorization: `Bearer ${await api.token(personas.employee)}` };
  const previous = await api.prisma.accountSecurity.findUnique({ where: { employeeId: personas.employee } });
  try {
    const revokedBefore = new Date(Date.now() + 1000);
    await api.prisma.accountSecurity.upsert({
      where: { employeeId: personas.employee },
      create: { employeeId: personas.employee, revokedBefore },
      update: { revokedBefore },
    });
    expectProblem(await api.as(null, "GET", "/me", { headers }), 401, "INVALID_TOKEN");
  } finally {
    await api.prisma.accountSecurity.update({
      where: { employeeId: personas.employee },
      data: { revokedBefore: previous?.revokedBefore ?? null },
    });
  }
});

test("unknown routes return a JSON problem with the request id", async () => {
  const result = await api.as(null, "GET", "/nope", { headers: { "X-Request-Id": "req-404" } });
  expectProblem(result, 404, "NOT_FOUND");
  assert.equal((result.body as { requestId: string }).requestId, "req-404");
});

test("malformed JSON is rejected", async () => {
  const response = await fetch(`${api.baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { code: string }).code, "INVALID_JSON");
});

test("login rejects malformed credentials", async () => {
  expectProblem(
    await api.as(null, "POST", "/auth/login", { body: { email: "not-an-email", password: "short" } }),
    400,
    "VALIDATION_ERROR",
  );
});

test("a seeded persona signs in with the development password", { skip: !process.env.DEV_SEED_PASSWORD }, async () => {
  const result = await api.as(null, "POST", "/auth/login", {
    body: { email: "aanya.sharma@gtf-hr.example", password: process.env.DEV_SEED_PASSWORD },
  });
  const data = dataOf<{ accessToken: string; employee: { id: string } }>(result);
  assert.equal(data.employee.id, "emp_0007");
  assert.equal(data.accessToken.split(".").length, 3);
});
