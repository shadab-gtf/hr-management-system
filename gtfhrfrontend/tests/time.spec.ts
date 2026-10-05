import { expect, test, type Page } from "@playwright/test";

/* Leave & time depth on the mock backend: comp-off, encashment, ledger, roster, year-end. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");

/** Monday of next week in IST, as YYYY-MM-DD. */
function nextMonday() {
  const date = new Date(Date.now() + 330 * 60_000);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + ((8 - day) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

test("employee: claim comp-off for a worked week-off and request encashment", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/leave/comp-off");
  await expect(page.getByRole("heading", { name: "Comp-off & encashment", level: 1 })).toBeVisible();
  await expect(page.getByRole("table", { name: "My comp-off claims" })).toContainText("Lapsed");

  await page.getByRole("button", { name: "Claim comp-off" }).click();
  await sheet(page).getByLabel("What did you work on?").fill("Weekend launch support for the festive campaign");
  await sheet(page).getByRole("button", { name: "Send claim" }).click();
  // Fresh store: success. Re-run on the same store: the day is already claimed.
  await expect(page.getByText(/Comp-off claim sent to your manager|Already claimed./).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Request encashment" }).click();
  await sheet(page).getByLabel("Days to encash").fill("1");
  await expect(sheet(page).getByText("Per day (basic ÷ 26)")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Send to HR" }).click();
  await expect(page.getByText(/Encashment request sent to HR|already have an encashment request/).first()).toBeVisible();
});

test("employee: policy rules are enforced when applying leave", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/leave?new=1");
  const form = page.getByRole("dialog", { name: "Request leave" });
  await form.getByLabel("Leave type").selectOption({ label: "Casual leave" });
  const start = new Date(Date.now() + 60 * 86_400_000);
  while (start.getUTCDay() !== 1) start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start.getTime() + 4 * 86_400_000);
  await form.getByLabel("From").fill(start.toISOString().slice(0, 10));
  await form.getByLabel("To").fill(end.toISOString().slice(0, 10));
  await form.getByLabel("Reason").fill("Too long for casual leave");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText("At most 3 consecutive days.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/leave?ledger=lt_el");
  await expect(page.getByRole("table", { name: "Earned leave ledger" })).toContainText("Carry forward");
});

test("employee: sees their shift roster by week and month", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/attendance/roster");
  await expect(page.getByRole("heading", { name: "Shift roster", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "My roster this week" }).getByRole("listitem")).toHaveCount(7);
  await expect(page.getByText("Week off").first()).toBeVisible();
  await page.getByRole("link", { name: "My month" }).click();
  await expect(page.getByRole("grid", { name: /Roster for/ })).toBeVisible();
  // Employees never get the planner.
  await expect(page.getByRole("link", { name: "Team planner" })).toHaveCount(0);

  await page.goto("/attendance");
  await expect(page.getByRole("heading", { name: "Monthly summary" })).toBeVisible();
  await expect(page.getByText("Late/early deductions")).toBeVisible();
});

test("hr: approves a team comp-off claim", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/leave/comp-off");
  const team = page.getByRole("table", { name: "Team comp-off claims" });
  await expect(team).toContainText("Shreya Ghosh");
  const approve = team.getByRole("button", { name: /^Approve Shreya Ghosh/ });
  if ((await approve.count()) > 0) {
    await approve.first().click();
    await sheet(page).getByRole("button", { name: "Confirm approve" }).click();
    await expect(page.getByText("Comp-off approved and credited")).toBeVisible();
  }
  await expect(team.getByRole("row", { name: /Shreya Ghosh/ })).toContainText("Credit live");
  await expect(page.getByRole("table", { name: "Encashment approvals" })).toBeVisible();
});

test("hr: publishes the Engineering draft roster", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto(`/attendance/roster?view=plan&department=Engineering&week=${nextMonday()}`);
  await expect(page.getByRole("heading", { name: "Engineering roster" })).toBeVisible();
  const publish = page.getByRole("button", { name: "Publish roster" });
  if (await publish.isVisible()) {
    await expect(page.getByText("Draft — not visible to employees")).toBeVisible();
    await publish.click();
    await expect(page.getByText("Roster published — employees can see it now")).toBeVisible();
  }
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
});

test("hr: year-end preview shows carry forward, encashment and lapse", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/leave-policy");
  await expect(page.getByRole("heading", { name: /Year-end processing \d{4}/ })).toBeVisible();
  const table = page.getByRole("table", { name: /Year-end \d{4} per employee and leave type/ });
  await expect(table.getByRole("row").nth(1)).toBeVisible();
  await expect(page.getByText(/Last run/)).toBeVisible();
  const commit = page.getByRole("button", { name: /Commit year-end/ });
  if (await commit.isVisible()) await expect(commit).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Employee balances & adjustments" })).toBeVisible();
});
