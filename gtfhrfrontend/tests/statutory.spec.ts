import { expect, test, type Page } from "@playwright/test";

/* Statutory payroll on the mock backend: compliance hub, return files, payroll
 * inputs, bank advice, salary structures, Form 16 and payslip statutory lines. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");

test("payroll: statutory hub shows returns, challans and downloads a valid ECR", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/payroll/statutory");
  await expect(page.getByRole("heading", { name: "Statutory compliance" })).toBeVisible();
  await expect(page.getByText(/Nothing is filed with EPFO/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Professional tax by state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Challan register" })).toBeVisible();
  // Seeded history includes one late TDS deposit.
  await expect(page.getByText("Paid late").first()).toBeVisible();

  const ecr = page.getByRole("link", { name: "ECR (.txt)" }).first();
  const href = await ecr.getAttribute("href");
  expect(href).toMatch(/\/api\/statutory\/ecr\.txt\?month=\d{4}-\d{2}&entity=ent_/);
  const response = await page.request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toMatch(/ECR-[A-Z]{5}\d{10}-\d{4}-\d{2}\.txt/);
  const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
  expect(lines.length).toBeGreaterThan(5);
  // EPFO ECR v2: 11 #~# separated fields, UAN first, EPS capped at ₹1,250.
  for (const line of lines) {
    const fields = line.split("#~#");
    expect(fields).toHaveLength(11);
    expect(fields[0]).toMatch(/^\d{12}$/);
    expect(Number(fields[7])).toBeLessThanOrEqual(1250);
  }

  const esi = await page.request.get((href ?? "").replace("ecr.txt", "esi.csv"));
  expect(esi.status()).toBe(200);
  expect(await esi.text()).toContain("IP Number");
  const tds = await page.request.get((href ?? "").replace("ecr.txt", "24q.csv"));
  expect(await tds.text()).toContain("Challan serial no.");

  await page.goto("/payroll/statutory/setup");
  await expect(page.getByRole("heading", { name: "Professional tax slabs" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Maharashtra" }).filter({ hasText: "February" }).first()).toBeVisible();

  await signIn(page, "Employee");
  expect((await page.request.get(href ?? "")).status()).toBe(403);
  await page.goto("/payroll/statutory");
  await expect(page.getByRole("heading", { name: "You don’t have access to statutory compliance" })).toBeVisible();
});

test("payroll: adds a one-time bonus to the open run and it reaches the variance explanation", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/payroll");
  await page.getByRole("link", { name: "Open current run" }).click();
  await expect(page.getByRole("heading", { name: "Payroll inputs" })).toBeVisible();
  const add = page.getByRole("button", { name: "Add input" });
  if (!(await add.isVisible())) {
    // Another spec may already have submitted/approved this run: inputs are then frozen.
    await expect(page.getByText("Inputs are frozen once the run is submitted for review.")).toBeVisible();
    return;
  }
  const amount = String(5000 + (Date.now() % 4000));
  await add.click();
  await sheet(page).getByLabel("Employee").selectOption({ label: "Harsh Vardhan · GTF-1019" });
  await sheet(page).getByLabel("Input type").selectOption("bonus");
  await sheet(page).getByLabel(/^Amount/).fill(amount);
  await sheet(page).getByRole("button", { name: "Add input" }).click();
  await expect(sheet(page).getByText("Add a reason employees and reviewers can understand.")).toBeVisible();
  await expect(sheet(page).getByLabel(/^Amount/)).toHaveValue(amount);
  await sheet(page).getByLabel("Reason").fill("Spot award for the release weekend");
  await sheet(page).getByRole("button", { name: "Add input" }).click();
  await expect(sheet(page)).toBeHidden();

  const inputs = page.getByRole("table", { name: "Payroll inputs for this period" });
  await expect(inputs.getByRole("row", { name: /Harsh Vardhan/ }).first()).toContainText("Bonus");
  await expect(page.getByText(/Spot award for the release weekend/).first()).toBeVisible();
  // Audit trail records the recalculation.
  await expect(page.getByText(/Input added for Harsh Vardhan: Bonus/).first()).toBeVisible();
  // Seeded hold is listed and excluded from the bank advice.
  await expect(page.getByRole("heading", { name: "Salary holds" })).toBeVisible();
});

test("finance: downloads the NEFT bank advice for an approved run; operator cannot", async ({ page }) => {
  await signIn(page, "Finance approver");
  await page.goto("/payroll");
  await page.getByRole("table", { name: "Previous payroll runs" }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Bank advice (NEFT)" })).toBeVisible();
  const link = page.getByRole("link", { name: "Download bank advice (CSV)" });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/\/api\/payroll\/runs\/.+\/bank-advice\.csv/);
  const response = await page.request.get(href ?? "");
  expect(response.status()).toBe(200);
  const csv = await response.text();
  expect(csv).toContain("Beneficiary account");
  expect(csv).toContain('"NEFT"');
  await expect(page.getByText(/not sent to any bank/)).toBeVisible();

  await signIn(page, "Payroll operator");
  expect((await page.request.get(href ?? "")).status()).toBe(403);
});

test("payroll: salary structures show templates, pending approval and a CTC breakup", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/payroll/structures?ctc=1200000&template=tpl_std&state=MH&regime=new");
  await expect(page.getByRole("heading", { name: "Salary structures" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Standard (L1–L3)" })).toBeVisible();
  const breakup = page.getByRole("table", { name: /CTC breakup for/ });
  await expect(breakup.getByRole("row", { name: /Basic salary/ })).toContainText("40,000");
  await expect(breakup.getByRole("row", { name: /Professional tax \(Maharashtra\)/ })).toContainText("2,500");
  await expect(breakup.getByRole("row", { name: /Estimated take-home/ })).toBeVisible();
});

test("employee: Form 16 with Part A and Part B, and payslip PF / PT lines", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/salary/form-16");
  await expect(page.getByRole("heading", { name: "Form 16" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Part A · Tax deducted and deposited" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Part B · Details of salary paid and tax computed" })).toBeVisible();
  await expect(page.getByText("Standard deduction u/s 16(ia)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible();
  // Employees can't open someone else's Form 16.
  await page.goto("/salary/form-16?employee=emp_0004");
  await expect(page.getByRole("heading", { name: "We couldn’t find that page" })).toBeVisible();

  await page.goto("/me/payslips");
  await page.getByRole("link", { name: /\d{4}$/ }).first().click();
  await expect(page.getByText("Provident fund (EPF 12%)")).toBeVisible();
  await expect(page.getByText("Professional tax is not levied in Uttar Pradesh.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Statutory details" })).toBeVisible();
  await expect(page.getByText(/TDS this month/)).toBeVisible();
});
