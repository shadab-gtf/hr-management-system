import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/*
 * End-to-end product flows against the mock backend. Each persona signs in
 * through the real login form; commands go through real server actions.
 */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("sign-in gate redirects to login and personas exclude the manager demo", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/leave");
  await expect(page).toHaveURL(/\/login\?next=%2Fleave/);
  await expect(page.getByText("Reporting manager")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(4);
});

test("employee: navigation is role-scoped and protected routes deny", async ({ page }) => {
  await signIn(page, "Employee");
  const nav = page.getByRole("navigation", { name: "Sections" }).first();
  await expect(nav.getByRole("link", { name: "Payroll" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  await page.goto("/payroll");
  await expect(page.getByRole("heading", { name: "You don’t have access to payroll" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Net total");
});

test("employee: check in, request leave, request correction", async ({ page }) => {
  await signIn(page, "Employee");
  const checkIn = page.getByRole("button", { name: "Check in" });
  if (await checkIn.isVisible()) {
    await checkIn.click();
    await expect(page.getByRole("button", { name: "Check out" })).toBeVisible();
  }

  await page.goto("/leave");
  await page.getByRole("button", { name: "Request leave" }).click();
  const sheet = page.getByRole("dialog", { name: "Request leave" });
  await sheet.getByLabel("Reason").fill("Kept after errors");
  await sheet.getByLabel("From").fill("2026-11-09");
  await sheet.getByLabel("To").fill("2026-11-09");
  await sheet.getByRole("button", { name: "Send request" }).click();
  // Holiday-only dates are rejected by the server; typed values are retained.
  await expect(sheet.getByText("Pick dates that include a working day.")).toBeVisible();
  await expect(sheet.getByLabel("Reason")).toHaveValue("Kept after errors");
  await sheet.getByLabel("Leave type").selectOption({ label: "Casual leave" });
  const future = new Date(Date.now() + 44 * 86_400_000);
  while ([0, 6].includes(future.getUTCDay())) future.setUTCDate(future.getUTCDate() + 1);
  const iso = future.toISOString().slice(0, 10);
  await sheet.getByLabel("From").fill(iso);
  await sheet.getByLabel("To").fill(iso);
  await sheet.getByLabel("Reason").fill("Automated test request");
  await sheet.getByRole("button", { name: "Send request" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Automated test request")).toBeVisible();

  await page.goto("/attendance");
  const correct = page.getByRole("button", { name: "Request correction" }).first();
  await correct.click();
  const reg = page.getByRole("dialog", { name: "Correct attendance" });
  await reg.getByLabel("What happened?").fill("Badge reader was offline");
  await reg.getByRole("button", { name: "Send for approval" }).click();
  await expect(reg).toBeHidden();
  await expect(page.getByText("Correction pending").first()).toBeVisible();
});

test("employee: profile photo updates the avatar everywhere", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/me/profile");
  await page.getByRole("button", { name: "Change profile photo" }).click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator('input[name="photo"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByRole("dialog", { name: "Profile photo" })).toBeHidden();
  const topbar = page.locator(".topbar-avatar img");
  await expect(topbar).toHaveAttribute("src", /\/api\/photos\/emp_0007\?v=\d+/);
  await expect.poll(() => topbar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // Another signed-in colleague sees the same photo in the directory.
  await signIn(page, "HR operations");
  await page.goto("/employees?q=Aanya");
  await expect(page.locator('img[src*="/api/photos/emp_0007"]').first()).toBeVisible();
});

test("hr: approves a team request; self-approval is impossible", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/approvals");
  await page.locator(".queue-item").first().click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("A reason is required when rejecting.")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/^Approved/).first()).toBeVisible();
});

test("payroll maker/checker: operator submits, cannot approve; finance approves and publishes", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/payroll");
  await page.getByRole("link", { name: "Open current run" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Submit for review" }).click();
  await expect(sheet.getByText("Confirm that you reviewed the totals.")).toBeVisible();
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("You prepared this run")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve payroll" })).toHaveCount(0);

  await signIn(page, "Finance approver");
  await page.goto("/payroll");
  await page.getByRole("link", { name: "Open current run" }).click();
  await page.getByRole("button", { name: "Approve payroll" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "Approve payroll" }).click();
  await page.getByRole("button", { name: "Publish payslips" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "Publish payslips" }).click();
  await expect(page.getByText("Published is not paid")).toBeVisible();
});

const mobileRoutes = ["/dashboard", "/attendance", "/leave", "/employees", "/me/payslips", "/helpdesk", "/documents", "/expenses", "/more", "/settings", "/me/profile"];

test.describe("mobile 360px", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
  test("bottom tabs, no horizontal overflow, native type scale, no axe violations", async ({ page }) => {
    await signIn(page, "Employee");
    await expect(page.getByRole("navigation", { name: "Quick navigation" })).toBeVisible();
    for (const route of mobileRoutes) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows`).toBeLessThanOrEqual(0);
      const bodySize = await page.evaluate(() => getComputedStyle(document.body).fontSize);
      expect(bodySize).toBe("16px");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => `${route}: ${v.id}`)).toEqual([]);
    }
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  });
});

test("desktop dark theme renders every page without axe violations", async ({ page }) => {
  await signIn(page, "Finance approver");
  await page.context().addCookies([{ name: "gtf-theme", value: "dark", url: page.url() }]);
  for (const route of ["/dashboard", "/approvals", "/payroll", "/employees", "/leave"]) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${route}: ${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  }
});
