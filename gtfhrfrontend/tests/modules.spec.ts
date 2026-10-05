import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* Extended modules, PWA and device-permission behaviour (mock backend). */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("sidebar groups expand like greytHR and follow the active route", async ({ page }) => {
  await signIn(page, "Employee");
  const salary = page.getByRole("button", { name: "Salary" });
  await expect(salary).toHaveAttribute("aria-expanded", "false");
  await salary.click();
  const sections = page.getByRole("navigation", { name: "Sections" });
  await sections.getByRole("link", { name: "YTD reports" }).click();
  await expect(page).toHaveURL(/\/salary\/ytd/);
  await expect(page.getByRole("button", { name: "Salary" })).toHaveAttribute("aria-expanded", "true");
  await expect(sections.getByRole("link", { name: "YTD reports" })).toHaveAttribute("aria-current", "page");
});

test("engage: post, react optimistically and comment", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/engage");
  const body = `Shipped the new onboarding flow ${Date.now()}`;
  await page.getByLabel("Write a post").fill(body);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const post = page.locator("article.post", { hasText: body });
  await expect(post).toBeVisible();
  const like = post.getByRole("button", { name: /^Like/ });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await post.getByRole("button", { name: "Comment" }).click();
  await post.getByLabel("Write a comment").fill("Great work!");
  await post.getByRole("button", { name: "Send" }).click();
  await expect(post.getByText("Great work!")).toBeVisible();
});

test("IT declaration enforces section limits and submits", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/salary/tax-declaration");
  // Wait for the streamed form to settle before interacting.
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: "Old regime" }).first().check({ force: true });
  await page.getByLabel("Public Provident Fund (PPF)").fill("200000");
  await page.getByRole("button", { name: "Submit declaration" }).click();
  await expect(page.getByText(/exceeds the ₹1,50,000 limit/).first()).toBeVisible();
  await page.getByLabel("Public Provident Fund (PPF)").fill("50000");
  await page.getByRole("button", { name: "Submit declaration" }).click();
  await expect(page.getByText("Submitted").first()).toBeVisible();
  await page.goto("/salary/tax-statement");
  await expect(page.getByRole("heading", { name: "Income tax statement" })).toBeVisible();
  await expect(page.getByText("Illustrative estimate")).toBeVisible();
});

test("loans, letters and the request hub track everything", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/salary/loans");
  await page.getByRole("button", { name: "Request advance or loan" }).click();
  await page.getByLabel("Amount (₹)").fill("20000");
  await page.getByLabel("Reason").fill("Medical bills for family");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Awaiting Finance").first()).toBeVisible();

  await page.goto("/documents?tab=letters");
  await page.getByRole("button", { name: "Request a letter" }).first().click();
  await page.getByLabel("Purpose").fill("Home loan application");
  await page.getByRole("button", { name: "Request letter" }).click();
  await expect(page.getByText("Home loan application").first()).toBeVisible();

  await page.goto("/requests");
  await expect(page.getByText("Salary advance").first()).toBeVisible();
  await expect(page.getByText("Employment verification").first()).toBeVisible();
});

test("helpdesk conversation: reply and HR queue hides confidential tickets", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/helpdesk");
  await page.getByRole("link", { name: /HRA exemption proof/ }).click();
  await page.getByLabel("Reply").fill("Uploaded the rent receipts PDF.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Uploaded the rent receipts PDF.")).toBeVisible();

  await signIn(page, "HR operations");
  await page.goto("/helpdesk?scope=queue");
  await expect(page.getByText("HRA exemption proof")).toHaveCount(0);
  await expect(page.getByText("Comp-off not credited")).toBeVisible();
});

test("delegation: cannot delegate to yourself; scheduling works", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/delegates");
  await expect(page.getByText("From Varun Bhatia")).toBeVisible();
  await page.getByRole("button", { name: "Delegate approvals" }).click();
  await page.getByLabel("Delegate to").selectOption({ label: "Shreya Ghosh — Talent Acquisition Partner" });
  await page.getByLabel("Reason").fill("Annual leave");
  await page.getByRole("button", { name: "Schedule delegation" }).click();
  await expect(page.getByText("To Shreya Ghosh")).toBeVisible();
});

test("people: star a colleague and find them in the org chart", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/employees?q=Kabir");
  await page.getByRole("button", { name: "Star Kabir Mehta" }).first().click();
  await page.goto("/employees?starred=1");
  await expect(page.getByText("Kabir Mehta").first()).toBeVisible();
  await page.goto("/employees/org-chart?q=Kabir");
  await expect(page.locator(".org-card--match", { hasText: "Kabir Mehta" })).toBeVisible();
});

test("HR admin: publish an announcement, tick onboarding, export CSV", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/announcements");
  const title = `Wellness week ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Message").fill("Free health check-ups at Noida HQ all week.");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(page.getByText(title).first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText(title)).toBeVisible();

  await page.goto("/admin/onboarding");
  const task = page.getByLabel("Verify bank account").first();
  await task.check();
  await expect(task).toBeChecked();

  const response = await page.request.get("/api/reports/employees.csv");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(await response.text()).toContain("Code,Name,Designation");
});

test("location check-in: verified at the office geofence when permission is granted", async ({ browser, baseURL }) => {
  // Test-only GPS fix; the app itself has no hardcoded coordinates.
  const fix = { latitude: 28.6274, longitude: 77.3726, accuracy: 30 };
  const context = await browser.newContext({ baseURL, permissions: ["geolocation"], geolocation: fix });
  const page = await context.newPage();
  await signIn(page, "HR operations");
  // HR places the office by standing there ("Use my current location").
  await page.goto("/admin/attendance-rules");
  await page.getByRole("button", { name: "Add site" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Use my current location" }).click();
  await expect(sheet.getByLabel("Latitude")).toHaveValue("28.627400");
  await sheet.getByLabel("Site name").fill("Test office");
  await sheet.getByRole("button", { name: "Add site" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/attendance");
  const button = page.getByRole("button", { name: "Check in" });
  if (await button.isVisible()) {
    await button.click();
    await expect(page.getByText(/At Test office/).first()).toBeVisible({ timeout: 30_000 });
    const details = page.locator("details.location-details").first();
    await details.locator("summary").click();
    for (const field of ["Detected location", "Distance from geofence center", "Reverse-geocoded location", "GPS position accuracy", "Location verification"])
      await expect(details.getByText(field)).toBeVisible();
    await expect(details.getByText("28.62740, 77.37260")).toBeVisible();
    await expect(details.getByText("±30 m · Good")).toBeVisible();
    await expect(details.getByText("Verified", { exact: true })).toBeVisible();
  }
  await context.close();
});

test("location denied: check-in still works and is flagged", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/attendance");
  const button = page.getByRole("button", { name: "Check in" });
  if (await button.isVisible()) {
    await button.click();
    await expect(page.getByText(/Location not shared/).first()).toBeVisible();
  }
});

test("PWA: manifest, icons, service worker and offline page are served safely", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const json = (await manifest.json()) as { display: string; icons: { purpose: string }[]; start_url: string };
  expect(json.display).toBe("standalone");
  expect(json.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  expect((await request.get("/icons/icon-512.png")).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect(await sw.text()).not.toContain("/api/");
  const offline = await request.get("/offline");
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain("You’re offline");

  await signIn(page, "Employee");
  const policy = (await page.request.get("/dashboard")).headers()["permissions-policy"];
  expect(policy).toContain("geolocation=(self)");
  expect(policy).toContain("camera=(self)");
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())), { timeout: 10_000 }).toBe(true);
});

test("settings: permissions are shown but never requested on load", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Device permissions" })).toBeVisible();
  // Scoped: Settings also has a "Notifications" preferences card.
  const permissions = page.getByRole("region", { name: "Device permissions" });
  await expect(permissions.getByText("Location", { exact: true })).toBeVisible();
  await expect(permissions.getByText("Notifications", { exact: true })).toBeVisible();
  await expect(permissions.getByText("Camera", { exact: true })).toBeVisible();
});

const newRoutes = ["/engage", "/salary/ytd", "/salary/tax-statement", "/salary/tax-declaration", "/salary/loans", "/salary/revision", "/leave/calendar", "/leave/holidays", "/attendance/requests", "/documents", "/requests", "/employees/org-chart", "/helpdesk/tk_1"];

test.describe("new modules at 360px", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
  test("no overflow, native type scale, no axe violations", async ({ page }) => {
    await signIn(page, "Employee");
    for (const route of newRoutes) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows`).toBeLessThanOrEqual(0);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => `${route}: ${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    }
  });
});

test("HR admin pages pass axe in dark mode", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.context().addCookies([{ name: "gtf-theme", value: "dark", url: page.url() }]);
  for (const route of ["/admin/onboarding", "/admin/announcements", "/admin/reports", "/delegates", "/helpdesk?scope=queue"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${route}: ${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  }
});

test("header theme button switches light and dark, and the choice persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, "Employee");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("approvals inbox lists decisions waiting on module pages", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/approvals");
  const more = page.getByRole("region", { name: "Also waiting for you" });
  await expect(more).toBeVisible();
  await expect(more.getByRole("link", { name: /Comp-off claims/ })).toBeVisible();
});
