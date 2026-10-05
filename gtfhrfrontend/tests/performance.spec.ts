import { expect, test, type Page } from "@playwright/test";

/*
 * Performance management on the mock backend (HR-11). Tests run in order and
 * mutate the shared in-memory store, so run them against a freshly started
 * server: goals → self review → manager review → calibration → release.
 */

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");

async function confirm(page: Page, label: string, confirmLabel: string) {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: confirmLabel }).click();
}

test("employee adds a quarterly goal and submits the sheet for approval", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/performance?cycle=pc_quarter");
  await expect(page.getByText("70%", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Add goal" }).click();
  await sheet(page).getByRole("textbox", { name: "Goal", exact: true }).fill("Accessibility audit of core flows");
  await sheet(page).getByLabel("Measurable target").fill("WCAG 2.2 AA on 5 key flows");
  await sheet(page).getByLabel("Weight (%)").fill("40");
  await sheet(page).getByRole("button", { name: "Add goal" }).click();
  // Over-100% weight is rejected and the values survive.
  await expect(sheet(page).getByText(/Total would be 110%/)).toBeVisible();
  await sheet(page).getByLabel("Weight (%)").fill("30");
  await sheet(page).getByRole("button", { name: "Add goal" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: "Accessibility audit of core flows" })).toBeVisible();
  await confirm(page, "Submit for approval", "Confirm submit");
  await expect(page.getByText("Awaiting approval").first()).toBeVisible();
});

test("employee checks in on a goal and submits the self review", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/performance?cycle=pc_half");
  await page.getByRole("button", { name: "Check in" }).first().click();
  await sheet(page).getByLabel("Progress (%)").fill("91");
  await sheet(page).getByLabel("Update").fill("All 60 components live; Squad C migrated.");
  await sheet(page).getByRole("button", { name: "Save check-in" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText("91%", { exact: true }).first()).toBeVisible();

  const form = page.getByRole("form", { name: "Self review" });
  // Submitting incomplete is rejected with field errors.
  await form.getByRole("button", { name: "Submit self review" }).click();
  await expect(form.getByText("Complete every rating and comment before submitting.")).toBeVisible();
  for (const select of await form.locator("select").all()) await select.selectOption("4");
  for (const comment of await form.getByLabel("Evidence and comments").all()) await comment.fill("Delivered against the target with measurable evidence.");
  await form.getByLabel("Strengths").fill("Built strong design foundations across squads.");
  await form.getByLabel("Areas to improve").fill("Share progress with stakeholders earlier.");
  await expect(form.getByText("4.00", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Submit self review" }).click();
  await expect(page.getByText("Under review")).toBeVisible();
});

test("employee gives public praise and answers a feedback request", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/performance/feedback");
  await page.getByRole("button", { name: "Give feedback" }).click();
  await sheet(page).getByLabel("Colleague").selectOption("emp_0009");
  await sheet(page).getByRole("textbox", { name: "Feedback", exact: true }).fill("Brilliant visual polish on the festive campaign.");
  await sheet(page).getByRole("button", { name: "Send feedback" }).click();
  await expect(sheet(page)).toBeHidden();
  await page.goto("/performance/feedback?tab=given");
  await expect(page.getByText("Brilliant visual polish on the festive campaign.")).toBeVisible();

  await page.goto("/performance/feedback?tab=requests");
  await page.getByRole("button", { name: "Respond" }).first().click();
  await sheet(page).getByRole("textbox", { name: "Feedback", exact: true }).fill("Own one motion system end to end this half.");
  await sheet(page).getByRole("button", { name: "Send feedback" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText("Answered").first()).toBeVisible();
});

async function submitManagerReview(page: Page, name: string) {
  await page.goto("/performance/team?cycle=pc_half");
  await page.getByRole("link", { name: `Open review for ${name}` }).click();
  const form = page.getByRole("form", { name: `Manager review for ${name}` });
  await expect(form.locator('select[name="overallRating"]')).toBeVisible();
  for (const select of await form.locator('select[name^="goalRating"], select[name^="compRating"], select[name="overallRating"]').all()) await select.selectOption("4");
  for (const comment of await form.getByLabel("Evidence and comments").all()) await comment.fill("Consistent delivery with clear evidence.");
  await form.getByRole("textbox", { name: "Strengths", exact: true }).fill("Dependable, high-quality delivery.");
  await form.getByLabel("Areas to improve").fill("Delegate more to grow the team.");
  await form.getByLabel("Summary for the employee").fill("A strong half with measurable, well-evidenced results.");
  await form.getByLabel("Increment recommendation (%)").fill("8.5");
  await expect(form.getByText(/Salary changes need a separate compensation revision/)).toBeVisible();
  await form.getByRole("button", { name: "Submit manager review" }).click();
  await expect(page.getByText("Submitted. Changes now go through HR calibration.")).toBeVisible();
}

test("HR as a manager approves goals and reviews a direct report", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/performance/team");
  await page.getByRole("button", { name: "Approve goals" }).first().click();
  await sheet(page).getByRole("button", { name: "Approve goals" }).click();
  await expect(sheet(page)).toBeHidden();
  await submitManagerReview(page, "Shreya Ghosh");
});

test("HR reassigns a reviewer, advances phases, calibrates and releases", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/performance?cycle=pc_half");
  await page.getByRole("row", { name: /Aanya Sharma/ }).getByRole("button", { name: "Reassign" }).click();
  await sheet(page).getByLabel("New reviewer").selectOption("emp_0005");
  await sheet(page).getByLabel("Reason").fill("Rohan is on leave during the review window.");
  await sheet(page).getByRole("button", { name: "Reassign reviewer" }).click();
  await expect(sheet(page)).toBeHidden();
  await submitManagerReview(page, "Aanya Sharma");

  await page.goto("/admin/performance?cycle=pc_half");
  await confirm(page, "Advance to Manager review", "Confirm: Manager review");
  await confirm(page, "Advance to Calibration", "Confirm: Calibration");
  await expect(page.getByRole("button", { name: "Advance to Released" })).toBeDisabled();

  await page.getByRole("row", { name: /Aanya Sharma/ }).getByRole("button", { name: "Set final rating" }).click();
  await sheet(page).getByLabel("Final rating").selectOption("5");
  await sheet(page).getByRole("button", { name: "Save final rating" }).click();
  await expect(sheet(page).getByText(/at least 10 characters/)).toBeVisible();
  await sheet(page).getByLabel("Reason").fill("Design system impact across all squads, validated by peers.");
  await sheet(page).getByRole("button", { name: "Save final rating" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText(/Final rating for Aanya Sharma set to 5/)).toBeVisible();

  await confirm(page, "Lock calibration", "Confirm lock");
  await confirm(page, "Advance to Released", "Confirm: Released");
  await expect(page.getByText("Results released. Employees can view and acknowledge their ratings.")).toBeVisible();
});

test("employee sees the released rating and acknowledges it", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/performance?cycle=pc_half");
  await expect(page.getByText("Outstanding", { exact: true })).toBeVisible();
  await expect(page.getByText("A strong half with measurable, well-evidenced results.")).toBeVisible();
  await page.getByLabel("Your comment (optional)").fill("Thank you — excited for the lead track.");
  await page.getByRole("button", { name: "Acknowledge review" }).click();
  await expect(page.getByText("Acknowledged", { exact: true })).toBeVisible();
});

test("employees can't open HR or team performance pages", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/performance/team");
  await expect(page.getByRole("heading", { name: /have access to/ })).toBeVisible();
  await page.goto("/admin/performance");
  await expect(page.getByRole("heading", { name: /have access to/ })).toBeVisible();
});
