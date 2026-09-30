import { expect, test, type Page } from "@playwright/test";

/* Salary sheet import (maker/checker) and monthly report downloads. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

test("salary sheet: dry run, maker submits, independent approver applies", async ({ page }) => {
  const [y, m] = istToday().split("-");
  const firstOfMonth = `01-${m}-${y}`;
  const csv = [
    "Emp Code,Employee Name,W.E.F,Annual CTC,Basic,HRA,Special Allowance,Remarks",
    `GTF-1007,Aanya Sharma,${firstOfMonth},"19,80,000",990000,396000,594000,Annual review`,
    `GTF-1009,Ishita Bose,${firstOfMonth},12 L,,,,Promotion`,
    `7777,Nobody,${firstOfMonth},900000,,,,`,
    `GTF-1015,Aditya Joshi,${firstOfMonth},1000000,2000000,,,Typo`,
  ].join("\r\n");

  await signIn(page, "Payroll operator");
  await page.goto("/payroll/compensation");
  await page.getByLabel("Salary sheet", { exact: true }).setInputFiles({ name: "salary-oct.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Upload & check" }).click();
  await expect(page).toHaveURL(/batch=/);
  const stat = (label: string) => page.locator(".stat").filter({ has: page.locator(".stat-label", { hasText: new RegExp(`^${label}$`) }) }).locator(".stat-value");
  await expect(stat("Changes")).toHaveText("2");
  await expect(stat("Errors")).toHaveText("2");
  await expect(page.getByText("Basic + HRA + special allowance exceed the CTC", { exact: true }).first()).toBeVisible();
  const aanya = page.getByRole("row", { name: /Aanya Sharma/ });
  await expect(aanya).toContainText("₹19,80,000");
  await expect(aanya).toContainText("10.0%");

  await page.getByRole("button", { name: "Submit 2 changes for approval" }).click();
  await expect(page.getByText("Waiting for an independent approver")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve & apply" })).toHaveCount(0);
  const url = page.url();

  await signIn(page, "HR operations");
  await page.goto("/payroll/compensation");
  await expect(page.getByText(/don.t have access/i).first()).toBeVisible();

  await signIn(page, "Finance approver");
  await page.goto(url);
  await page.getByRole("button", { name: "Approve & apply" }).click();
  await expect(page.getByText("Approved — salary revisions applied")).toBeVisible();

  await signIn(page, "Employee");
  await page.goto("/salary/revision");
  await expect(page.getByText("₹19,80,000").first()).toBeVisible();
});

test("PDF salary letters are refused with guidance", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/payroll/compensation");
  await page.getByLabel("Salary sheet", { exact: true }).setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await page.getByRole("button", { name: "Upload & check" }).click();
  await expect(page.getByText(/PDFs and Word files can't be read reliably/)).toBeVisible();
});

test("monthly downloads: payroll register for payroll roles, attendance for HR", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/payroll");
  const link = page.getByRole("link", { name: /payroll register \(CSV\)/ }).first();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/\/api\/payroll\/runs\/.+\/register\.csv/);
  const register = await page.request.get(href ?? "");
  expect(register.status()).toBe(200);
  expect(register.headers()["content-disposition"]).toContain("gtf-payroll-register-");
  const text = await register.text();
  expect(text).toContain("Net pay");
  expect(text).toContain("TOTAL");

  await signIn(page, "HR operations");
  expect((await page.request.get(href ?? "")).status()).toBe(403);
  const month = istToday().slice(0, 7);
  const attendance = await page.request.get(`/api/reports/attendance.csv?month=${month}`);
  expect(attendance.status()).toBe(200);
  expect(await attendance.text()).toContain("Overtime hours");

  await signIn(page, "Employee");
  expect((await page.request.get(`/api/reports/attendance.csv?month=${month}`)).status()).toBe(403);
});
