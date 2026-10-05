import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* Reports, report builder, notification channels and Hindi language (mock backend). */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("hr: standard report downloads as CSV, is audit-logged, salary reports stay hidden", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Workforce analytics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payroll", exact: true })).toHaveCount(0);

  await page.locator("summary", { hasText: "Attendance summary" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Attendance summary" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gtf-attendance-summary-.*\.csv$/);

  const csv = await page.request.get("/api/reports/standard/headcount?format=csv&department=Design");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Aanya Sharma");
  const xls = await page.request.get("/api/reports/standard/leave_balances?format=xls");
  expect(xls.headers()["content-type"]).toContain("application/vnd.ms-excel");
  expect(await xls.text()).toContain("urn:schemas-microsoft-com:office:spreadsheet");
  expect((await page.request.get("/api/reports/standard/salary_register?format=csv")).status()).toBe(403);

  await page.reload();
  const log = page.getByRole("table", { name: "Report export audit log" });
  await expect(log.getByRole("rowheader", { name: "Attendance summary" }).first()).toBeVisible();

  await signIn(page, "Payroll operator");
  const register = await page.request.get("/api/reports/standard/salary_register?format=csv");
  expect(register.status()).toBe(200);
  expect(await register.text()).toContain("Net pay");
});

test("hr: builds, saves and schedules a custom report", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/reports/builder");
  await expect(page.getByLabel("Annual CTC")).toHaveCount(0);
  await page.getByLabel("Dataset").selectOption({ label: "Employees" });
  await page.getByLabel("Gender").check();
  await page.locator("#rb-department").selectOption("Design");
  await page.getByRole("button", { name: "Run preview" }).click();
  await expect(page).toHaveURL(/dataset=employees/);
  const preview = page.getByRole("table", { name: /preview/ });
  await expect(preview.getByText("Aanya Sharma")).toBeVisible();
  await expect(preview.getByRole("columnheader", { name: "Gender" })).toBeVisible();

  const name = `Design roster ${Date.now() % 100000}`;
  await page.getByRole("button", { name: "Save report" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Report name").fill(name);
  await sheet.getByRole("button", { name: "Save report" }).click();
  await expect(page).toHaveURL(/saved=rpt_/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  const item = page.locator(".rpt-saved-item", { hasText: name });
  await item.getByRole("button", { name: "Schedule" }).click();
  const schedule = page.getByRole("dialog");
  await schedule.getByLabel("Frequency").selectOption("weekly");
  await schedule.getByLabel("Day", { exact: true }).selectOption({ label: "Friday" });
  await schedule.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(item.getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(item.getByText(/Every Friday at 09:00 IST/)).toBeVisible();

  await item.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText(/logged as a mock delivery/)).toBeVisible();
  await expect(page.getByRole("table", { name: /delivery log/ }).getByRole("rowheader", { name }).first()).toBeVisible();

  const download = await page.request.get(`/api/reports/custom?dataset=employees&col=code&col=name&col=pan&format=csv`);
  expect(download.status()).toBe(200);
  expect(await download.text()).toMatch(/XXXXX\d{4}[A-Z]/);
});

test("employee: can't open reports; switches the shell to Hindi and back", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/admin/reports");
  await expect(page.getByText(/don.t have access/i).first()).toBeVisible();
  expect((await page.request.get("/api/reports/standard/headcount")).status()).toBe(403);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Switch language to Hindi" }).click();
  const nav = page.getByRole("navigation", { name: "अनुभाग" });
  await expect(nav.getByRole("button", { name: "छुट्टी" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "उपस्थिति" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/सुप्रभात|नमस्कार|शुभ संध्या/);
  await expect(page.locator(".app")).toHaveAttribute("lang", "hi");

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "सेटिंग्स", level: 1 })).toBeVisible();
  await page.getByLabel("English").check({ force: true });
  await page.getByRole("button", { name: "भाषा सहेजें" }).click();
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Leave" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});

test("settings: verify a mobile number and enable WhatsApp alerts", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/settings");
  const whatsapp = page.getByLabel("Approvals waiting for me on WhatsApp");
  if (!(await page.getByText("Verified", { exact: true }).isVisible())) {
    await expect(whatsapp).toBeDisabled();
    await page.getByLabel("Mobile number for SMS and WhatsApp").fill("12345");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText("Enter a 10-digit Indian mobile number starting with 6–9.")).toBeVisible();
    await page.getByLabel("Mobile number for SMS and WhatsApp").fill("98765 43210");
    await page.getByRole("button", { name: "Send code" }).click();
    const code = (await page.locator(".dev-note code").textContent())?.trim() ?? "";
    expect(code).toMatch(/^\d{6}$/);
    await page.getByLabel("Verification code").fill(code === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText(/doesn't match/)).toBeVisible();
    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  }
  await expect(whatsapp).toBeEnabled();
  await whatsapp.check();
  await page.getByLabel("Daily digest").check({ force: true });
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Approvals waiting for me on WhatsApp")).toBeChecked();
  await expect(page.getByLabel("Daily digest")).toBeChecked();
  await expect(page.getByText(/Not connected \(mock\)/)).toBeVisible();
});

test("report pages: axe clean and no overflow at 360px", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/admin/reports", "/admin/reports/builder?saved=rpt_1", "/settings", "/dashboard"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${path}: ${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0);
  }
});
