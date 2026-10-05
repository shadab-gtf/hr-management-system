/**
 * Department-wise permissions (BE-003) for engage: survey administration and moderation are organization-level;
 * a department-scoped HR operator (emp_0013, Engineering) manages only polls aimed at Engineering. Employee feed,
 * polls, praise and survey answers are unchanged.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { dataOf, expectProblem, newKey, useTestApi } from "../helpers/api.js";
import { todayInOrgZone } from "../../src/utils/date.js";

const api = useTestApi();

const surveyBody = (title: string) => ({
  title,
  description: "Scope test",
  department: null,
  opensOn: todayInOrgZone(),
  closesOn: todayInOrgZone(),
  anonymous: true,
});

test("survey administration needs an organization-wide grant", async () => {
  const id = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/engage/surveys", { body: surveyBody("Org pulse"), idempotencyKey: newKey() }),
  ).id;
  dataOf(await api.as("superAdmin", "GET", "/engage/surveys"));
  dataOf(await api.as("superAdmin", "GET", `/engage/surveys/${id}`));

  expectProblem(await api.as("scopedHr", "GET", "/engage/surveys"), 403, "ORG_WIDE_ACCESS_REQUIRED");
  expectProblem(await api.as("scopedHr", "GET", `/engage/surveys/${id}`), 403, "ORG_WIDE_ACCESS_REQUIRED");
  expectProblem(await api.as("scopedHr", "GET", `/engage/surveys/${id}/results`), 403, "ORG_WIDE_ACCESS_REQUIRED");
  expectProblem(
    await api.as("scopedHr", "GET", `/engage/surveys/${id}/results/export`),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  expectProblem(
    await api.as("scopedHr", "POST", "/engage/surveys", {
      body: surveyBody("Engineering pulse"),
      idempotencyKey: newKey(),
    }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/engage/surveys/${id}/questions`, {
      body: { surveyId: id, kind: "rating", prompt: "How are things?", required: true, options: [] },
    }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  expectProblem(await api.as("scopedHr", "POST", `/engage/surveys/${id}/publish`, { body: {} }), 403);

  dataOf(
    await api.as("superAdmin", "POST", `/engage/surveys/${id}/questions`, {
      body: { surveyId: id, kind: "rating", prompt: "How are things?", required: true, options: [] },
    }),
  );
  dataOf(await api.as("hr", "POST", `/engage/surveys/${id}/publish`, { body: {} }));
  dataOf(await api.as("hr", "GET", `/engage/surveys/${id}/results`));

  // Employees: no admin access, self-service unchanged.
  expectProblem(await api.as("employee", "GET", "/engage/surveys"), 403);
  expectProblem(await api.as("employee", "GET", `/engage/surveys/${id}/results`), 403);
  const mine = dataOf<{ id: string }[]>(await api.as("employee", "GET", "/me/surveys"));
  assert.ok(mine.some((survey) => survey.id === id));
  dataOf(await api.as("scopedHr", "GET", "/me/surveys"));
});

test("moderating other people's posts is organization-level", async () => {
  const { id } = dataOf<{ id: string }>(
    await api.as("employee", "POST", "/engage/posts", {
      body: { group: "General", body: "Hello from Design" },
      idempotencyKey: newKey(),
    }),
  );
  type Feed = { posts: { id: string; canDelete: boolean }[] };
  const scopedFeed = dataOf<Feed>(await api.as("scopedHr", "GET", "/engage/feed"));
  assert.equal(scopedFeed.posts.find((post) => post.id === id)?.canDelete, false);
  const hrFeed = dataOf<Feed>(await api.as("hr", "GET", "/engage/feed"));
  assert.equal(hrFeed.posts.find((post) => post.id === id)?.canDelete, true);
  expectProblem(
    await api.as("scopedHr", "POST", `/engage/posts/${id}/archive`, { body: {} }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  expectProblem(await api.as("manager", "POST", `/engage/posts/${id}/archive`, { body: {} }), 403);
  dataOf(await api.as("superAdmin", "POST", `/engage/posts/${id}/archive`, { body: {} }));

  const own = dataOf<{ id: string }>(
    await api.as("employee", "POST", "/engage/posts", {
      body: { group: "General", body: "Mine" },
      idempotencyKey: newKey(),
    }),
  ).id;
  dataOf(await api.as("employee", "POST", `/engage/posts/${own}/archive`, { body: {} }));
});

test("department polls are managed by HR operators whose scope covers that department", async () => {
  const poll = async (persona: "employee" | "hr", department: string) =>
    dataOf<{ id: string }>(
      await api.as(persona, "POST", "/engage/polls", {
        body: {
          question: `Lunch plan for ${department}?`,
          options: ["Pizza", "Salad"],
          multiple: false,
          anonymous: false,
          closesOn: todayInOrgZone(),
          department,
        },
        idempotencyKey: newKey(),
      }),
    ).id;
  const designPoll = await poll("employee", "Design");
  const engineeringPoll = await poll("hr", "Engineering");
  type Polls = { polls: { id: string; canClose: boolean }[] };

  const scoped = dataOf<Polls>(await api.as("scopedHr", "GET", "/engage/polls"));
  assert.equal(
    scoped.polls.some((p) => p.id === designPoll),
    false,
  );
  assert.equal(scoped.polls.find((p) => p.id === engineeringPoll)?.canClose, true);
  expectProblem(await api.as("scopedHr", "POST", `/engage/polls/${designPoll}/close`, { body: {} }), 404);
  dataOf(await api.as("scopedHr", "POST", `/engage/polls/${engineeringPoll}/close`, { body: {} }));

  const orgWide = dataOf<Polls>(await api.as("hr", "GET", "/engage/polls"));
  assert.equal(orgWide.polls.find((p) => p.id === designPoll)?.canClose, true);
  const admin = dataOf<Polls>(await api.as("superAdmin", "GET", "/engage/polls"));
  assert.ok(admin.polls.some((p) => p.id === designPoll));

  // The Design author still votes and sees the poll; other employees outside Design are not affected.
  dataOf(
    await api.as("employee", "POST", `/engage/polls/${designPoll}/ballot`, {
      body: { optionIds: [`${designPoll}_0`] },
    }),
  );
  expectProblem(await api.as("manager", "POST", `/engage/polls/${engineeringPoll}/close`, { body: {} }), 404);
  dataOf(await api.as("hr", "POST", `/engage/polls/${designPoll}/close`, { body: {} }));
});

test("employee feed and praise stay self-service", async () => {
  dataOf(await api.as("employee", "GET", "/engage/feed"));
  dataOf(await api.as("employee", "GET", "/engage/praise"));
  dataOf(await api.as("scopedHr", "GET", "/engage/praise"));
});
