import { expect, test, type Page } from "@playwright/test";

/* Timesheets on the mock backend: weekly grid, manager approval, projects and export. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");

test("employee fills the current week, saves a draft and submits", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/timesheets");
  const grid = page.getByRole("region", { name: /^Timesheet grid/ });
  await expect(grid).toBeVisible();
  const cell = grid.getByRole("spinbutton", { name: /^Hours for / }).first();
  await cell.fill("7.5");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await expect(cell).toHaveValue("7.5");

  await page.getByRole("button", { name: /Submit for approval|Resubmit/ }).click();
  await expect(page.getByText("Submitted").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
});

test("the grid rejects more than 16 hours in a day", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/timesheets");
  const grid = page.getByRole("region", { name: /^Timesheet grid/ });
  const cell = grid.getByRole("spinbutton", { name: /^Hours for / }).first();
  test.skip((await cell.count()) === 0, "No editable row for this persona this week.");
  await cell.fill("17");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("manager approves one team timesheet and must comment to send one back", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/timesheets/team");
  const pending = page.getByRole("table", { name: "Timesheets pending approval" });
  await expect(pending).toBeVisible();

  const reviews = pending.getByRole("button", { name: /^Review / });
  const before = await reviews.count();
  expect(before).toBeGreaterThan(0);

  await reviews.first().click();
  await sheet(page).getByRole("button", { name: "Approve" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(pending.getByRole("button", { name: /^Review / })).toHaveCount(before - 1);

  if (before > 1) {
    await pending.getByRole("button", { name: /^Review / }).first().click();
    await sheet(page).getByRole("button", { name: "Send back" }).click();
    await expect(sheet(page).getByText("Tell the employee what to fix (at least 5 characters).")).toBeVisible();
    await sheet(page).getByLabel("Comment").fill("Please split the campus hiring hours by task.");
    await sheet(page).getByRole("button", { name: "Send back" }).click();
    await expect(sheet(page)).toBeHidden();
  }

  const missing = page.getByRole("table", { name: "Missing timesheets" });
  const remind = missing.getByRole("button", { name: /^Remind / }).first();
  if (await remind.count()) {
    await remind.click();
    await expect(page.getByText(/Reminded|Reminder sent/).first()).toBeVisible();
  }
});

test("HR creates a project and exports approved hours", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/timesheets/projects");
  const code = `GTF-QA-${String(Date.now() % 10000).padStart(4, "0")}`;
  await page.getByRole("button", { name: "New project" }).click();
  await sheet(page).getByLabel("Project code").fill(code);
  await sheet(page).getByLabel("Project name").fill("Quality audit sprint");
  await sheet(page).getByLabel("Client", { exact: true }).fill("Internal");
  await sheet(page).getByLabel("Budget (hours)").fill("120");
  const end = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  await sheet(page).getByLabel("End date").fill(end);
  await sheet(page).getByLabel("Tasks").fill("Test plan\nRegression run");
  await sheet(page).getByRole("checkbox", { name: /Manish Pandey/ }).check();
  await sheet(page).getByRole("button", { name: "Create project" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByRole("table", { name: "Projects" }).getByText(code)).toBeVisible();

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const response = await page.request.get(`/api/timesheets/approved.csv?from=${from}&to=${today}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(await response.text()).toContain("week_start");
});

test("employees cannot open team approvals or projects", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/timesheets/team");
  await expect(page.getByText(/don’t have access|don't have access/i).first()).toBeVisible();
  const response = await page.request.get("/api/timesheets/approved.csv?from=2026-01-01&to=2026-01-31");
  expect(response.status()).toBe(403);
});
