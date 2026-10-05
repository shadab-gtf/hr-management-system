import { expect, test, type Page } from "@playwright/test";

/* Employee lifecycle on the mock backend: resignation, assets, policies, letters and F&F. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");

test("employee submits a resignation and withdraws it", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/me/resignation");
  await expect(page.getByText("Full-time, confirmed — 60 days").first()).toBeVisible();
  await page.getByLabel("Primary reason").selectOption("relocation");
  await page.getByLabel("Resignation note").fill("Moving to Pune to be closer to family.");
  await page.getByRole("button", { name: "Submit resignation" }).click();
  await expect(page.getByRole("heading", { name: "Your resignation" })).toBeVisible();
  await expect(page.getByText("With manager").first()).toBeVisible();

  await page.getByRole("button", { name: "Withdraw resignation" }).click();
  await page.getByRole("button", { name: "Confirm withdrawal" }).click();
  await expect(page.getByRole("heading", { name: "Submit resignation" })).toBeVisible();
  await expect(page.getByText("Withdrawn").first()).toBeVisible();
});

test("early release needs a reason", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/me/resignation");
  const lastDay = page.getByLabel("Last working day");
  const policyDay = await lastDay.inputValue();
  const earlier = new Date(`${policyDay}T00:00:00Z`);
  earlier.setUTCDate(earlier.getUTCDate() - 20);
  await lastDay.fill(earlier.toISOString().slice(0, 10));
  await page.getByLabel("Resignation note").fill("Testing the early release rule.");
  await page.getByRole("button", { name: "Submit resignation" }).click();
  await expect(page.getByText("Explain the early release (at least 10 characters).")).toBeVisible();
});

test("employee acknowledges an assigned asset and requests one", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/me/assets");
  await expect(page.getByRole("heading", { name: /MacBook Pro 14/ })).toBeVisible();
  const ack = page.getByRole("button", { name: "Acknowledge MON-0201" });
  if (await ack.isVisible()) {
    await ack.click();
    await expect(ack).toBeHidden();
  }
  await page.getByRole("button", { name: "Request asset" }).click();
  await sheet(page).getByLabel("What do you need?").selectOption("phone");
  await sheet(page).getByLabel("Why do you need it?").fill("Test device for mobile prototype reviews.");
  await sheet(page).getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(/Phone · AR-/).first()).toBeVisible();
});

test("employee acknowledges a pending policy in the Document center", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/documents?tab=policies");
  const card = page.getByRole("region", { name: /Information security & acceptable use policy v2\.0/ });
  if (await card.isVisible()) {
    await card.getByRole("button", { name: "I have read and acknowledge" }).click();
    await expect(card).toBeHidden();
  }
  await expect(page.getByRole("region", { name: "Acknowledged" }).getByText("Information security & acceptable use policy v2.0")).toBeVisible();
});

test("HR accepts a resignation, then prepares the F&F settlement", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/offboarding");
  const row = page.getByRole("listitem").filter({ hasText: "Omkar Patil" }).filter({ has: page.getByRole("button", { name: "Decide" }) });
  if (await row.count()) {
    await row.getByRole("button", { name: "Decide" }).click();
    await sheet(page).getByRole("button", { name: "Accept resignation" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  await expect(page.getByRole("heading", { name: "Omkar Patil" })).toBeVisible();

  await page.goto("/admin/settlements");
  const picker = page.getByLabel("Employee with an open exit");
  if (await picker.isVisible()) {
    const option = picker.getByRole("option", { name: /Omkar Patil/ });
    if (await option.count()) {
      await picker.selectOption({ label: (await option.textContent()) ?? "" });
      await page.getByRole("button", { name: "Prepare settlement" }).click();
      await expect(page.getByText(/Settlement FNF-\d+ prepared/)).toBeVisible();
    }
  }
  await page.getByRole("link", { name: "Omkar Patil" }).first().click();
  await expect(page.getByRole("heading", { name: /Omkar Patil · FNF-/ })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Salary for/ })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Unreturned asset recovery/ })).toBeVisible();
  const submit = page.getByRole("button", { name: "Submit for approval" });
  if (await submit.isVisible()) {
    await submit.click();
    await expect(page.getByText("Awaiting approval").first()).toBeVisible();
  }
});

test("HR assigns an in-stock asset", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/assets?status=in_stock");
  const row = page.getByRole("row", { name: /MON-0204/ });
  await row.getByRole("button", { name: "Assign" }).click();
  await sheet(page).getByLabel("Employee").selectOption({ label: "Kabir Mehta" });
  await sheet(page).getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("MON-0204 assigned to Kabir Mehta")).toBeVisible();
  await page.goto("/admin/assets?status=assigned&q=MON-0204");
  await expect(page.getByRole("row", { name: /MON-0204/ })).toContainText("Kabir Mehta");
});

test("HR previews and generates a letter from a template", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/letters?template=tpl_confirmation&employee=emp_0009");
  const preview = page.getByRole("article", { name: "Letter preview" });
  await expect(preview).toContainText("Ishita Bose");
  await expect(preview).toContainText("Confirmation of employment");
  await page.getByRole("button", { name: "Generate & issue letter" }).click();
  await expect(page.getByText(/Letter LTR-\d+ issued/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Issued letters" }).getByText("Ishita Bose").first()).toBeVisible();
});

test("letter templates reject unknown placeholders", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/letters");
  await page.getByRole("button", { name: "New template" }).click();
  await sheet(page).getByLabel("Name").fill("NOC for passport");
  await sheet(page).getByLabel("Subject").fill("No objection certificate");
  await sheet(page).getByLabel("Body").fill("This is to certify that {{employee.fullname}} has no objection from the company for a passport.");
  await sheet(page).getByRole("button", { name: "Create template" }).click();
  await expect(sheet(page).getByText(/Unknown: \{\{employee\.fullname\}\}/)).toBeVisible();
});

test("Finance approves the prepared F&F (maker ≠ checker) and records payment", async ({ page }) => {
  await signIn(page, "Finance approver");
  await page.goto("/admin/settlements/st_1");
  await expect(page.getByRole("heading", { name: /Neha Gupta · FNF-/ })).toBeVisible();
  const review = page.getByRole("button", { name: "Review & decide" });
  if (await review.isVisible()) {
    await review.click();
    await sheet(page).getByRole("button", { name: "Approve settlement" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  const pay = page.getByRole("button", { name: "Mark paid" });
  if (await pay.isVisible()) {
    await pay.click();
    await sheet(page).getByLabel("UTR / bank reference").fill(`HDFCN${Date.now()}`.slice(0, 18));
    await sheet(page).getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  await expect(page.getByText(/UTR [A-Z0-9]+ ·/).first()).toBeVisible();
  await page.getByRole("link", { name: "Statement" }).click();
  await expect(page.getByRole("heading", { name: "Full & final settlement statement" })).toBeVisible();
});

test("payroll operator can prepare but not approve settlements", async ({ page }) => {
  await signIn(page, "Payroll operator");
  await page.goto("/admin/settlements/st_1");
  await expect(page.getByRole("heading", { name: /Neha Gupta · FNF-/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review & decide" })).toHaveCount(0);
});

test("HR sees policy completion and sends a reminder", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/policies");
  const card = page.getByRole("region", { name: /Information security & acceptable use policy v2\.0/ });
  await expect(card.getByText(/\d+% · \d+\/\d+/)).toBeVisible();
  const remind = card.getByRole("button", { name: /Remind \d+ pending/ });
  await remind.click();
  await expect(page.getByText(/Reminder sent to \d+ people|A reminder went out within the last hour/)).toBeVisible();
});
