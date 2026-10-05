import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* HR administration on the mock backend: configuration, lifecycle and queues. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");
const nextYear = () => String(new Date().getFullYear() + 1);

test("HR adds a holiday and employees see it on their calendar", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto(`/admin/holidays?year=${nextYear()}`);
  const name = `Foundation Day ${Date.now() % 10000}`;
  await page.getByRole("button", { name: "Add holiday" }).click();
  await sheet(page).getByLabel("Name").fill(name);
  await sheet(page).getByLabel("Date").fill(`${nextYear()}-02-${String(2 + (Date.now() % 20)).padStart(2, "0")}`);
  await sheet(page).getByRole("button", { name: "Add holiday" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("rowheader", { name })).toBeVisible();

  await signIn(page, "Employee");
  await page.goto("/leave/holidays");
  await expect(page.getByText(name).first()).toBeVisible();
});

test("holiday validation keeps values and rejects a clashing date", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto(`/admin/holidays?year=${nextYear()}`);
  await page.getByRole("button", { name: "Add holiday" }).click();
  await sheet(page).getByLabel("Name").fill("Clash test");
  await sheet(page).getByLabel("Date").fill(`${nextYear()}-01-26`);
  await sheet(page).getByRole("button", { name: "Add holiday" }).click();
  await expect(sheet(page).getByText("Another holiday already uses this date.")).toBeVisible();
  await expect(sheet(page).getByLabel("Name")).toHaveValue("Clash test");
});

test("leave policy: per-type balances, WFH type and a new version on edit", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/leave-policy");
  const version = await page.getByText(/Current version LV-2026\.\d+/).textContent();
  const row = page.getByRole("row", { name: /Work from home/ });
  await expect(row).toContainText("Working day");
  await page.getByRole("row", { name: /^Sick leave/ }).getByRole("button", { name: "Edit" }).click();
  await sheet(page).getByLabel("Days per year").fill("9");
  await sheet(page).getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("row", { name: /^Sick leave/ })).toContainText("9");
  await expect(page.getByText(/Current version LV-2026\.\d+/)).not.toHaveText(version ?? "");

  await signIn(page, "Employee");
  await page.goto("/leave?new=1");
  await expect(page.getByRole("dialog").getByRole("option", { name: "Work from home" })).toBeAttached();
});

test("HR adds an employee with custom probation; onboarding opens", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/employees");
  const name = `Test Joiner ${String.fromCharCode(65 + (Date.now() % 26))}${String.fromCharCode(65 + ((Date.now() / 26) % 26))}`;
  await page.getByRole("button", { name: "Add employee" }).click();
  const form = sheet(page);
  await form.getByLabel("Full name").fill(name);
  await form.getByLabel("Work email / login ID").fill(`${name.toLowerCase().replaceAll(" ", ".")}@example.com`);
  await form.getByLabel("Designation").fill("Junior Designer");
  await form.getByLabel("Department").selectOption("Design");
  await form.getByLabel("Location").selectOption("Noida HQ");
  await form.getByLabel("Reporting manager").selectOption({ label: "Rohan Verma · Design Lead" });
  await form.getByLabel("Probation").selectOption("3");
  await form.getByRole("button", { name: "Add employee" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto(`/employees?q=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByText(/3 months · ends/)).toBeVisible();

  await page.goto("/admin/onboarding");
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("HR edits job details and starts an exit; offboarding tracks it", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/employees?q=Harsh");
  await page.getByRole("link", { name: "Harsh Vardhan" }).first().click();
  await page.getByRole("button", { name: "Edit job details" }).click();
  await sheet(page).getByLabel("Designation").fill("Senior Frontend Engineer");
  await sheet(page).getByLabel("Reason").fill("Annual promotion cycle");
  await sheet(page).getByRole("button", { name: "Save change" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("link", { name: "Employment" }).click();
  await expect(page.getByText("Now Senior Frontend Engineer")).toBeVisible();

  await page.getByRole("button", { name: "Start exit" }).click();
  const future = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await sheet(page).getByLabel("Last working day").fill(future);
  await sheet(page).getByRole("button", { name: "Start exit" }).click();
  await expect(page.getByText("Exit in progress")).toBeVisible();

  await page.goto("/admin/offboarding");
  await expect(page.getByRole("heading", { name: "Harsh Vardhan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete exit" }).first()).toBeDisabled();
});

test("service queue: HR verifies a profile change; Finance owns bank changes", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/requests");
  const address = page.locator(".card", { hasText: "Address change" }).filter({ hasText: "Dev Malhotra" });
  await expect(page.getByText("Bank account change")).toHaveCount(0);
  await address.getByRole("button", { name: "Verify & apply" }).click();
  await expect(address).toHaveCount(0);
  await page.goto("/admin/requests?view=closed");
  await expect(page.locator(".card", { hasText: "Dev Malhotra" }).first()).toBeVisible();

  await signIn(page, "Finance approver");
  await page.goto("/admin/requests");
  const bank = page.locator(".card", { hasText: "Bank account change" });
  await expect(bank).toBeVisible();
  await bank.getByRole("button", { name: "Reject" }).click();
  await bank.getByRole("button", { name: "Confirm reject" }).click();
  await expect(bank.getByText("A reason is required when rejecting.")).toBeVisible();
});

test("events and scheduled announcements reach the right audience", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/events");
  const title = `Design sprint demo ${Date.now() % 10000}`;
  await page.getByRole("button", { name: "New event" }).click();
  await sheet(page).getByLabel("Title").fill(title);
  await sheet(page).getByLabel("Date").fill(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  await sheet(page).getByLabel("Venue").fill("Noida HQ · Studio");
  await sheet(page).getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/admin/announcements");
  const later = `Scheduled note ${Date.now() % 10000}`;
  await page.getByLabel("Title").fill(later);
  await page.getByLabel("Message").fill("This goes out next week to Engineering only.");
  await page.getByLabel("Audience").selectOption("Engineering");
  await page.getByLabel("Publish at").fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(page.locator(".list-row", { hasText: later }).getByText("Scheduled", { exact: true })).toBeVisible();

  await signIn(page, "Employee");
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText(later)).toHaveCount(0);
});

test("attendance rules: preset shift, department assignment and overtime", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/attendance-rules");
  const minute = String(Date.now() % 60).padStart(2, "0");
  const name = `Late shift ${minute}`;
  await page.getByRole("button", { name: "Add shift" }).click();
  await sheet(page).getByRole("button", { name: "9:30 AM – 7:00 PM" }).click();
  await expect(sheet(page).getByLabel("Starts")).toHaveValue("09:30");
  await expect(sheet(page).getByLabel("Ends")).toHaveValue("19:00");
  await expect(sheet(page).getByText(/Working time: 8 h 30 min/)).toBeVisible();
  // A unique timing per run (duplicate timings are rejected by design).
  await sheet(page).getByLabel("Starts").fill(`08:${minute}`);
  await sheet(page).getByLabel("Shift name").fill(name);
  await sheet(page).getByRole("button", { name: "Add shift" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Track overtime")).toBeChecked();

  await page.getByLabel("Shift for Design").selectOption({ label: `${name} (08:${minute}–19:00)` });
  await expect(page.getByText("Design shift updated")).toBeVisible();

  await signIn(page, "Employee");
  await page.goto("/attendance");
  await expect(page.getByText(`${name} · 08:${minute}–19:00`)).toBeVisible();
});

test("notification preferences save per topic", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/settings");
  await page.getByLabel("Company announcements by email").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Company announcements by email")).toBeChecked();
});

test("employees can't open HR admin configuration", async ({ page }) => {
  await signIn(page, "Employee");
  for (const path of ["/admin/holidays", "/admin/leave-policy", "/admin/requests"]) {
    await page.goto(path);
    await expect(page.getByText(/don.t have access/i).first()).toBeVisible();
  }
});

const adminRoutes = ["/admin/holidays", "/admin/events", "/admin/leave-policy", "/admin/attendance-rules", "/admin/organization", "/admin/offboarding", "/admin/requests", "/admin/onboarding/checklist"];

test("admin routes: axe clean in dark desktop and light 360px, no overflow", async ({ page }) => {
  await signIn(page, "HR operations");
  for (const [width, scheme] of [[1280, "dark"], [360, "light"]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of adminRoutes) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${path} ${width}: ${v.id}`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
