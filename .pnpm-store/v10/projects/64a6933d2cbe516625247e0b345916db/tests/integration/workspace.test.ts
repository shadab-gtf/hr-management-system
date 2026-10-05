import assert from "node:assert/strict";
import test from "node:test";
import { dataOf, expectProblem, newKey, personas, useTestApi } from "../helpers/api.js";
import { expectContract, frontendContract } from "../helpers/contract.js";
import { todayInOrgZone } from "../../src/utils/date.js";
import { decrypt } from "../../src/core/security/encryption.js";
import { totpCode } from "../../src/core/security/totp.js";
import { issueAccessToken } from "../../src/core/security/tokens.js";
import { createDeliveryRepository } from "../../src/modules/delivery/delivery.repository.js";
import { createNotificationService } from "../../src/modules/notifications/notification.service.js";
import { storedPhoneSchema } from "../../src/modules/notifications/notification.schema.js";
import { loadActor } from "../../src/core/middleware/auth.middleware.js";
import { AppError } from "../../src/core/errors/AppError.js";
const api = useTestApi();

test("workspace reads validate against the real frontend DTOs", async () => {
  const session = await frontendContract("session");
  const employee = await frontendContract("employee");
  const identity = await frontendContract("identity");
  const engage = await frontendContract("engage");
  const config = await frontendContract("hr-config");
  const notifications = await frontendContract("notifications");
  expectContract(session.sessionSchema, dataOf(await api.as("employee", "GET", "/me")));
  expectContract(
    employee.employeeDetailSchema,
    dataOf(await api.as("employee", "GET", `/employees/${personas.employee}`)),
  );
  expectContract(identity.accessOverviewSchema, dataOf(await api.as("hr", "GET", "/identity/access")));
  expectContract(identity.securityOverviewSchema, dataOf(await api.as("employee", "GET", "/me/security")));
  expectContract(config.organizationConfigSchema, dataOf(await api.as("hr", "GET", "/config/organization")));
  expectContract(engage.feedSchema, dataOf(await api.as("employee", "GET", "/engage/feed")));
  expectContract(engage.praiseWallSchema, dataOf(await api.as("employee", "GET", "/engage/praise")));
  expectContract(
    notifications.channelPreferencesSchema,
    dataOf(await api.as("employee", "GET", "/me/notification-preferences/channels")),
  );
  expectProblem(await api.as("employee", "GET", "/identity/access"), 403);
  expectProblem(await api.as(null, "GET", "/engage/feed"), 401);
});

test("private helpdesk tickets enforce ownership and persist replies/close", async () => {
  const key = newKey();
  const input = {
    categoryId: "grievance",
    subject: "Private workplace concern",
    description: "Please help with this confidential workplace request.",
    priority: "normal",
  };
  const created = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/tickets", { body: input, idempotencyKey: key }),
  );
  assert.deepEqual(dataOf(await api.as("employee", "POST", "/tickets", { body: input, idempotencyKey: key })), created);
  const mine = dataOf<{ id: string; reference: string }[]>(await api.as("employee", "GET", "/tickets"));
  const ticket = mine.find((t) => t.reference === created.reference);
  assert.ok(ticket);
  expectProblem(await api.as("manager", "GET", `/tickets/${ticket.id}`), 404);
  dataOf(
    await api.as("hr", "POST", `/tickets/${ticket.id}/messages`, {
      body: { body: "HR is reviewing your concern." },
      idempotencyKey: newKey(),
    }),
  );
  const dto = dataOf<{ state: string; messages: unknown[] }>(await api.as("employee", "GET", `/tickets/${ticket.id}`));
  assert.equal(dto.state, "awaiting_you");
  assert.equal(dto.messages.length, 1);
  dataOf(await api.as("employee", "POST", `/tickets/${ticket.id}/close`, { body: {} }));
  expectProblem(
    await api.as("employee", "POST", `/tickets/${ticket.id}/messages`, { body: { body: "Late reply" } }),
    409,
  );
});

test("poll votes reject foreign options and anonymous polls never reveal names", async () => {
  const { id } = dataOf<{ id: string }>(
    await api.as("employee", "POST", "/engage/polls", {
      body: {
        question: "Which day works for the team?",
        options: ["Monday", "Friday"],
        multiple: false,
        anonymous: true,
        closesOn: todayInOrgZone(),
        department: null,
      },
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(
    await api.as("employee", "POST", `/engage/polls/${id}/ballot`, { body: { optionIds: ["foreign"] } }),
    400,
  );
  dataOf(await api.as("employee", "POST", `/engage/polls/${id}/ballot`, { body: { optionIds: [`${id}_0`] } }));
  const polls = dataOf<{
    polls: { id: string; recentVoters: unknown[]; voterCount: number; resultsVisible: boolean }[];
  }>(await api.as("employee", "GET", "/engage/polls"));
  const poll = polls.polls.find((p) => p.id === id);
  assert.ok(poll);
  assert.equal(poll.voterCount, 1);
  assert.deepEqual(poll.recentVoters, []);
  assert.equal(poll.resultsVisible, true);
});

test("anonymous surveys validate answers, prevent duplicate replies, and suppress small groups", async () => {
  const { id } = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/engage/surveys", {
      body: {
        title: "Quarterly team experience",
        description: "Team feedback",
        department: null,
        opensOn: todayInOrgZone(),
        closesOn: todayInOrgZone(),
        anonymous: true,
      },
      idempotencyKey: newKey(),
    }),
  );
  dataOf(
    await api.as("hr", "POST", `/engage/surveys/${id}/questions`, {
      body: { surveyId: id, kind: "rating", prompt: "How was your experience?", required: true, options: [] },
    }),
  );
  const draft = dataOf<{ questions: { id: string }[] }>(await api.as("hr", "GET", `/engage/surveys/${id}`));
  const question = draft.questions[0];
  assert.ok(question);
  dataOf(await api.as("hr", "POST", `/engage/surveys/${id}/publish`, { body: {} }));
  expectProblem(
    await api.as("employee", "POST", `/engage/surveys/${id}/responses`, { body: { answers: { [question.id]: "99" } } }),
    400,
  );
  dataOf(
    await api.as("employee", "POST", `/engage/surveys/${id}/responses`, {
      body: { answers: { [question.id]: "4" } },
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(
    await api.as("employee", "POST", `/engage/surveys/${id}/responses`, {
      body: { answers: { [question.id]: "4" } },
      idempotencyKey: newKey(),
    }),
    409,
  );
  const results = dataOf<{ suppressed: boolean; questions: unknown[] }>(
    await api.as("hr", "GET", `/engage/surveys/${id}/results`),
  );
  assert.equal(results.suppressed, true);
  assert.deepEqual(results.questions, []);
  expectProblem(await api.as("employee", "GET", `/engage/surveys/${id}/results`), 403);
});

test("MFA privilege gate, enrollment and TOTP replay protection", async () => {
  const token = await issueAccessToken(personas.hr, []);
  const denied = await fetch(`${api.baseUrl}/api/v1/identity/access`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(denied.status, 403);
  const enrollmentKey = newKey();
  const enrolled = dataOf<{ factorId: string; secret: string; qrCode: string }>(
    await api.as("hr", "POST", "/me/security/mfa/enroll", { body: {}, idempotencyKey: enrollmentKey }),
  );
  assert.deepEqual(
    dataOf(await api.as("hr", "POST", "/me/security/mfa/enroll", { body: {}, idempotencyKey: enrollmentKey })),
    enrolled,
  );
  assert.match(enrolled.qrCode, /<svg/);
  const secret = await api.prisma.accountSecurity.findUniqueOrThrow({ where: { employeeId: personas.hr } });
  assert.notEqual(secret.totpSecret, enrolled.secret);
  assert.ok(secret.totpSecret);
  assert.equal(decrypt(secret.totpSecret), enrolled.secret);
  const body = { factorId: enrolled.factorId, code: totpCode(enrolled.secret, Math.floor(Date.now() / 30000)) };
  const proofKey = newKey();
  const verified = dataOf<{ accessToken: string }>(
    await api.as("hr", "POST", "/me/security/mfa/verify", { body, idempotencyKey: proofKey }),
  );
  assert.ok(verified.accessToken);
  expectProblem(await api.as("hr", "POST", "/me/security/mfa/verify", { body, idempotencyKey: proofKey }), 401);
  const protectedRead = await fetch(`${api.baseUrl}/api/v1/me/home`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(protectedRead.status, 403);
});

test("document bytes remain private and unavailable until scanner verification", async () => {
  const file = Buffer.from("%PDF-1.4\nA test document\n%%EOF\n");
  const { documentId } = dataOf<{ documentId: string }>(
    await api.as("employee", "POST", "/documents/uploads", {
      body: { name: "contract.pdf", category: "employment", mime: "application/pdf", sizeBytes: file.length },
      idempotencyKey: newKey(),
    }),
  );
  const body = { contentBase64: file.toString("base64"), mime: "application/pdf" };
  expectProblem(await api.as("manager", "PUT", `/documents/uploads/${documentId}/content`, { body }), 404);
  dataOf(
    await api.as("employee", "PUT", `/documents/uploads/${documentId}/content`, { body, idempotencyKey: newKey() }),
  );
  expectProblem(await api.as("employee", "GET", `/documents/${documentId}/content`), 409);
  const row = await api.prisma.workspaceRecord.findUniqueOrThrow({ where: { id: documentId } });
  await createDeliveryRepository(api.prisma).completeScan(documentId, row.version, true);
  const downloaded = await api.as("employee", "GET", `/documents/${documentId}/content`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.body, file.toString());
  expectProblem(await api.as("hr", "GET", `/documents/${documentId}/content`), 404);
});

test("photo uploads validate bytes and serve authenticated binary reads", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2T7sAAAAASUVORK5CYII=",
    "base64",
  );
  expectProblem(
    await api.as("employee", "PUT", "/me/photo", {
      body: { mime: "image/png", contentBase64: Buffer.from("not an image").toString("base64") },
    }),
    400,
  );
  const updated = dataOf<{ photoUrl: string }>(
    await api.as("employee", "PUT", "/me/photo", {
      body: { mime: "image/png", contentBase64: png.toString("base64") },
    }),
  );
  assert.ok(updated.photoUrl);
  const downloaded = await api.as("manager", "GET", `/employees/${personas.employee}/photo`);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get("content-type") ?? "", /image\/png/);
  dataOf(await api.as("employee", "DELETE", "/me/photo"));
  expectProblem(await api.as("employee", "GET", `/employees/${personas.employee}/photo`), 404);
});

test("profile verification encrypts bank numbers and updates payroll atomically", async () => {
  const accountNumber = "87654321012345";
  const requested = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/me/profile/change-requests", {
      body: { field: "bankAccount", value: accountNumber, reason: "Updated salary payment account" },
      idempotencyKey: newKey(),
    }),
  );
  const requests = dataOf<{ id: string; reference: string; proposed: string }[]>(
    await api.as("finance", "GET", "/service-requests"),
  );
  const request = requests.find((r) => r.reference === requested.reference);
  assert.ok(request);
  assert.ok(!request.proposed.includes(accountNumber));
  expectProblem(
    await api.as("employee", "POST", `/service-requests/profile_change/${request.id}/decisions`, {
      body: { decision: "approve", reason: "verified" },
    }),
    403,
  );
  dataOf(
    await api.as("finance", "POST", `/service-requests/profile_change/${request.id}/decisions`, {
      body: { decision: "approve", reason: "Account ownership checked" },
      idempotencyKey: newKey(),
    }),
  );
  const profile = await api.prisma.payProfile.findUniqueOrThrow({ where: { employeeId: personas.employee } });
  assert.notEqual(profile.accountNumber, accountNumber);
  assert.equal(decrypt(profile.accountNumber), accountNumber);
  assert.equal(profile.bankStatus, "pending");
});

test("dashboard contracts use live workforce and approval data", async () => {
  const contract = await frontendContract("dashboard");
  for (const persona of ["employee", "manager", "hr", "finance"] as const)
    expectContract(contract.homeInsightsSchema, dataOf(await api.as(persona, "GET", "/me/home")));
  expectProblem(await api.as("hr", "GET", "/audit", { query: { from: "invalid-date" } }), 400);
});

test("SMS provider failure rolls back delivery, retries the same key, and consumes OTP only once", async () => {
  const actor = await loadActor(api.prisma, personas.employee, { issuedAt: Date.now(), mfaVerified: true });
  const phoneId = `phone:${actor.employeeId}`;
  const number = "9876543210";
  const sent: { number: string; code: string }[] = [];
  let attempts = 0;
  const service = createNotificationService(api.prisma, (recipient, code) => {
    attempts++;
    if (attempts === 1) return Promise.reject(new AppError(503, "SMS_DELIVERY_FAILED", "Injected gateway failure."));
    sent.push({ number: recipient, code });
    return Promise.resolve();
  });
  const key = newKey();
  const context = { key, requestId: newKey(), version: undefined };
  assert.equal(await api.prisma.workspaceRecord.findUnique({ where: { id: phoneId } }), null);
  await assert.rejects(service.requestPhone(actor, number, context), { code: "SMS_DELIVERY_FAILED", status: 503 });
  assert.equal(await api.prisma.workspaceRecord.findUnique({ where: { id: phoneId } }), null);
  assert.equal(
    await api.prisma.idempotencyKey.findUnique({ where: { actorId_key: { actorId: actor.employeeId, key } } }),
    null,
  );
  const success = await service.requestPhone(actor, number, context);
  assert.equal(success.ok, true);
  assert.equal(attempts, 2);
  assert.equal(sent.length, 1);
  assert.deepEqual(await service.requestPhone(actor, number, context), success);
  assert.equal(attempts, 2, "Successful request replay must not send another SMS.");
  const delivered = sent[0];
  assert.ok(delivered);
  assert.equal(delivered.number, number);
  assert.match(delivered.code, /^\d{6}$/);
  const proofKey = newKey();
  const proofContext = { key: proofKey, requestId: newKey(), version: undefined };
  assert.deepEqual(await service.confirmPhone(actor, delivered.code, proofContext), { ok: true });
  await assert.rejects(service.confirmPhone(actor, delivered.code, proofContext), { code: "INVALID_OTP", status: 400 });
  const saved = storedPhoneSchema.parse(
    (await api.prisma.workspaceRecord.findUniqueOrThrow({ where: { id: phoneId } })).data,
  );
  assert.equal(saved.verified, true);
  assert.equal(saved.hash, null);
  assert.equal(saved.expiresAt, null);
  assert.notEqual(saved.number, number);
});

test("concurrent approvals preserve both independently verified profile fields", async () => {
  const changes = [
    { field: "personalEmail", value: "verified.profile@example.com", reason: "Verify my updated personal email" },
    { field: "address", value: "204 Integration Avenue, Pune", reason: "Verify my updated home address" },
  ] as const;
  const created = await Promise.all(
    changes.map(async (body) =>
      dataOf<{ reference: string }>(
        await api.as("employee", "POST", "/me/profile/change-requests", { body, idempotencyKey: newKey() }),
      ),
    ),
  );
  const queue = dataOf<{ id: string; reference: string }[]>(await api.as("hr", "GET", "/service-requests"));
  const ids = created.map((item) => {
    const row = queue.find((request) => request.reference === item.reference);
    assert.ok(row);
    return row.id;
  });
  // Delay the database write so both HTTP decisions overlap. The profile lock must
  // protect the read/merge as well as the write, otherwise one approved field is lost.
  await api.prisma
    .$executeRaw`CREATE FUNCTION workspace_profile_regression_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$`;
  try {
    await api.prisma
      .$executeRaw`CREATE TRIGGER workspace_profile_regression_delay BEFORE UPDATE ON workspace_records FOR EACH ROW WHEN (NEW.id = 'profile:emp_0007') EXECUTE FUNCTION workspace_profile_regression_delay()`;
    try {
      const results = await Promise.all(
        ids.map((id) =>
          api.as("hr", "POST", `/service-requests/profile_change/${id}/decisions`, {
            body: { decision: "approve", reason: "Supporting evidence checked" },
            idempotencyKey: newKey(),
          }),
        ),
      );
      results.forEach((result) => {
        dataOf(result);
      });
    } finally {
      await api.prisma.$executeRaw`DROP TRIGGER workspace_profile_regression_delay ON workspace_records`;
    }
  } finally {
    await api.prisma.$executeRaw`DROP FUNCTION workspace_profile_regression_delay()`;
  }
  const profile = dataOf<{ privateProfile: { personalEmail: string; address: string; bankAccountMasked: string } }>(
    await api.as("employee", "GET", `/employees/${personas.employee}`),
  ).privateProfile;
  assert.equal(profile.personalEmail, changes[0].value);
  assert.equal(profile.address, changes[1].value);
  assert.ok(
    profile.bankAccountMasked.endsWith("2345"),
    "Concurrent approvals must preserve previously verified fields.",
  );
  for (const id of ids)
    assert.equal((await api.prisma.workspaceRecord.findUniqueOrThrow({ where: { id } })).state, "approved");
});

test("new employee invitation is single-use and password recovery revokes existing sessions", async () => {
  const options = dataOf<{ departments: string[]; locations: string[] }>(
    await api.as("hr", "GET", "/employees/form-options"),
  );
  const body = {
    name: "Integration Hire",
    workEmail: `hire-${crypto.randomUUID()}@test.example`,
    designation: "Engineer",
    department: options.departments[0],
    location: options.locations[0],
    managerId: personas.manager,
    joinedOn: todayInOrgZone(),
    type: "full_time",
    probationMonths: 3,
  };
  const key = newKey();
  const hire = dataOf<{ id: string }>(await api.as("hr", "POST", "/employees", { body, idempotencyKey: key }));
  assert.equal(
    dataOf<{ id: string }>(await api.as("hr", "POST", "/employees", { body, idempotencyKey: key })).id,
    hire.id,
  );
  assert.ok(await api.prisma.payProfile.findUnique({ where: { employeeId: hire.id } }));
  const mail = await api.prisma.mailOutbox.findFirstOrThrow({ where: { to: body.workEmail, template: "invite" } });
  const link = new URL(mail.textBody.slice(mail.textBody.indexOf("http")));
  const password = "Integration-hire-password-2026";
  const activation = {
    ref: link.searchParams.get("ref"),
    tokenHash: link.searchParams.get("token_hash"),
    type: "invite",
    password,
  };
  dataOf(await api.as(null, "POST", "/auth/set-password", { body: activation }));
  expectProblem(await api.as(null, "POST", "/auth/set-password", { body: activation }), 400);
  const login = dataOf<{ accessToken: string }>(
    await api.as(null, "POST", "/auth/login", { body: { email: body.workEmail, password } }),
  );
  assert.ok(login.accessToken);
  const valid = await fetch(`${api.baseUrl}/api/v1/me`, { headers: { Authorization: `Bearer ${login.accessToken}` } });
  assert.equal(valid.status, 200);
  dataOf(await api.as(null, "POST", "/auth/recovery", { body: { email: body.workEmail } }));
  const resetMail = await api.prisma.mailOutbox.findFirstOrThrow({
    where: { to: body.workEmail, template: "recovery" },
  });
  const reset = new URL(resetMail.textBody.slice(resetMail.textBody.indexOf("http")));
  dataOf(
    await api.as(null, "POST", "/auth/set-password", {
      body: {
        ref: reset.searchParams.get("ref"),
        tokenHash: reset.searchParams.get("token_hash"),
        type: "recovery",
        password: "New-integration-password-2026",
      },
    }),
  );
  const expired = await fetch(`${api.baseUrl}/api/v1/me`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(expired.status, 401);
});
