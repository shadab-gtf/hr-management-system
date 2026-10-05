import { expect, test, type Page } from "@playwright/test";

/* Recruitment on the mock backend: public careers, pipeline, interviews, offers and hire conversion. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");
const letters = () => {
  const n = Date.now();
  return String.fromCharCode(65 + (n % 26)) + String.fromCharCode(97 + (Math.floor(n / 26) % 26)) + String.fromCharCode(97 + (Math.floor(n / 676) % 26));
};
const mobile = () => `9${String(Date.now()).slice(-9)}`;
const isoDate = (offsetDays: number) => {
  const date = new Date(Date.now() + offsetDays * 86_400_000 + 5.5 * 3_600_000);
  return date.toISOString().slice(0, 10);
};
const resume = { name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test resume") };

test("public visitor applies on the careers page without signing in", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/careers");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // CTC bands are internal and never appear publicly.
  await expect(page.getByText(/₹/)).toHaveCount(0);
  await page.getByRole("link", { name: /Senior Frontend Engineer/ }).click();
  await expect(page).toHaveURL(/\/careers\/job_1/);

  const form = page.getByRole("form", { name: /Apply for/ });
  await form.getByRole("button", { name: "Submit application" }).click();
  await expect(form.getByText("Consent is required.")).toBeVisible();

  const name = `Careers Applicant ${letters()}`;
  await form.getByLabel("Full name").fill(name);
  await form.getByLabel("Email").fill(`applicant.${Date.now()}@mail.example`);
  await form.getByLabel("Mobile").fill(mobile());
  await form.getByLabel("Total experience (years)").fill("5");
  await form.getByLabel("Resume").setInputFiles(resume);
  await form.getByRole("checkbox", { name: /I agree/ }).check();
  await form.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Application received")).toBeVisible();

  await signIn(page, "HR operations");
  await page.goto(`/recruitment/candidates?q=${encodeURIComponent(name)}`);
  const row = page.getByRole("table").getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("Applied");
  await expect(row).toContainText("Senior Frontend Engineer");
});

test("HR moves a candidate, schedules an interview, makes an offer and converts to an employee", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/recruitment");
  await expect(page.getByText("Open positions")).toBeVisible();

  const name = `Kiran Hire ${letters()}`;
  const email = `kiran.${Date.now()}@mail.example`;
  await page.goto("/recruitment/candidates");
  await page.getByRole("button", { name: "Add candidate" }).click();
  const add = sheet(page);
  await add.getByLabel("Job opening").selectOption({ label: "Senior Frontend Engineer" });
  await add.getByLabel("Full name").fill(name);
  await add.getByLabel("Email").fill(email);
  await add.getByLabel("Mobile").fill(mobile());
  await add.getByLabel("Experience (years)").fill("6");
  await add.getByRole("checkbox", { name: /candidate agreed/ }).check();
  await add.getByRole("button", { name: "Add candidate" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto(`/recruitment/candidates?q=${encodeURIComponent(email)}`);
  await page.getByRole("table").getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  // Rejection needs a reason; moving to Screening does not.
  await page.getByRole("button", { name: "Move stage" }).click();
  await sheet(page).getByLabel("New stage").selectOption("rejected");
  await sheet(page).getByRole("button", { name: "Reject candidate" }).click();
  await expect(sheet(page).getByText(/rejection reason is required/i)).toBeVisible();
  await sheet(page).getByLabel("New stage").selectOption("screening");
  await sheet(page).getByRole("button", { name: "Move candidate" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Screening").first()).toBeVisible();

  await page.getByRole("button", { name: "Schedule interview" }).click();
  const schedule = sheet(page);
  await schedule.getByLabel("Date").fill(isoDate(5));
  await schedule.getByLabel("Time (IST)").fill(`1${Date.now() % 8}:${String((Date.now() % 11) * 5).padStart(2, "0")}`);
  await schedule.getByLabel("Panelist 1").selectOption({ label: "Priya Iyer · Finance Controller" });
  await schedule.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(/Round 1/).first()).toBeVisible();

  await page.getByRole("button", { name: "Create offer" }).click();
  const offer = sheet(page);
  await offer.getByLabel("Annual CTC (₹)").fill("2600000");
  await offer.getByLabel("Joining date").fill(isoDate(14));
  await offer.getByRole("button", { name: "Create offer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Extended").first()).toBeVisible();

  await page.getByRole("button", { name: "Mark accepted" }).click();
  await sheet(page).getByRole("button", { name: "Mark accepted" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Convert to employee" }).click();
  await sheet(page).getByRole("checkbox", { name: /offer details above are correct/ }).check();
  await sheet(page).getByRole("button", { name: "Create employee" }).click();
  await expect(page.getByText("Hired — linked employee record")).toBeVisible();
  // Double conversion is not offered once linked.
  await expect(page.getByRole("button", { name: "Convert to employee" })).toHaveCount(0);

  await page.goto(`/employees?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("link", { name }).first()).toBeVisible();
});

test("finance panelist submits a scorecard and then sees the other panelist's feedback", async ({ page }) => {
  await signIn(page, "Finance approver");
  await page.goto("/recruitment/interviews");
  const card = page.getByRole("article").filter({ hasText: "Sneha Agarwal" });
  await expect(card.getByText(/hidden until you submit/)).toBeVisible();
  await expect(card.getByText("Knows GST reconciliation well")).toHaveCount(0);

  await card.getByRole("button", { name: "Submit scorecard" }).click();
  const form = sheet(page);
  for (const label of ["Role skills", "Problem solving", "Communication", "Ownership", "Culture add"])
    await form.getByRole("radio", { name: `${label}: 4 of 5` }).check({ force: true });
  await form.getByLabel("Recommendation").selectOption("yes");
  await form.getByLabel("Comments").fill("Strong on reconciliations and GST; ready for the HR round.");
  await form.getByRole("button", { name: "Submit scorecard" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const done = page.getByRole("article").filter({ hasText: "Sneha Agarwal" });
  await expect(done.getByText("Knows GST reconciliation well")).toBeVisible();
});

test("manager raises a requisition and HR approves it into a draft job", async ({ page }) => {
  await signIn(page, "Finance approver");
  const title = `Treasury Analyst ${letters()}`;
  await page.goto("/recruitment");
  await expect(page).toHaveURL(/\/recruitment\/interviews/);
  await page.getByRole("button", { name: "Raise requisition" }).click();
  const form = sheet(page);
  await form.getByLabel("Role").fill(title);
  await form.getByLabel("Department").selectOption("Finance");
  await form.getByLabel("Location").selectOption("Noida HQ");
  await form.getByLabel("Budget CTC from (₹ / year)").fill("800000");
  await form.getByLabel("Budget CTC to (₹ / year)").fill("1100000");
  await form.getByLabel("Business case").fill("Cash-flow forecasting now needs a dedicated analyst.");
  await form.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await signIn(page, "HR operations");
  await page.goto("/recruitment?tab=requisitions");
  const row = page.getByRole("table").getByRole("row", { name: new RegExp(title) });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row.getByRole("link", { name: "Open job" })).toBeVisible();
  await row.getByRole("link", { name: "Open job" }).click();
  await expect(page.getByText("Draft").first()).toBeVisible();
});

test("candidate records are HR-only", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/recruitment/candidates");
  await expect(page.getByRole("heading", { name: /don’t have access/ })).toBeVisible();
});
