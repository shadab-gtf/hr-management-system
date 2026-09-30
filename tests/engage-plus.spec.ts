import { expect, test, type Page } from "@playwright/test";

/* Engage on the mock backend: polls, surveys (builder + results) and the praise wall. */

async function signIn(page: Page, persona: "Employee" | "HR operations" | "Payroll operator" | "Finance approver") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const sheet = (page: Page) => page.getByRole("dialog");
const plusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("employee votes on a poll, sees results and can change the vote", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/engage/polls");
  const poll = page.getByRole("article", { name: "Where should we hold the Diwali team offsite?" });
  await expect(poll).toBeVisible();
  if (await poll.getByRole("button", { name: "Change vote" }).count()) await poll.getByRole("button", { name: "Change vote" }).click();
  await poll.getByRole("radio", { name: "Jaipur heritage stay" }).check();
  await poll.getByRole("button", { name: /^(Vote|Update vote)$/ }).click();
  await expect(poll.getByText("Your vote")).toBeVisible();
  await expect(poll.getByRole("list", { name: /^Results:/ })).toContainText("%");
  await expect(poll.getByRole("button", { name: "Change vote" })).toBeVisible();
});

test("employee creates a poll that shows in the feed", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/engage/polls");
  const question = `Best day for the design crit ${Date.now() % 10000}?`;
  await page.getByRole("button", { name: "New poll" }).click();
  await sheet(page).getByLabel("Question").fill(question);
  await sheet(page).getByLabel("Option 1").fill("Tuesday");
  await sheet(page).getByRole("button", { name: "Publish poll" }).click();
  await expect(sheet(page).getByText("Add at least 2 options.")).toBeVisible();
  await sheet(page).getByLabel("Option 2").fill("Thursday");
  await sheet(page).getByLabel("Closes on").fill(plusDays(3));
  await sheet(page).getByRole("button", { name: "Publish poll" }).click();
  await expect(sheet(page)).toBeHidden();
  await page.goto("/engage");
  await expect(page.getByRole("article", { name: question })).toBeVisible();
});

test("employee responds to the pulse survey once", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/engage/polls");
  const surveys = page.getByRole("region", { name: "Surveys for you" });
  const row = surveys.getByRole("listitem").filter({ hasText: "Quarterly pulse check — Q3" });
  await expect(row).toBeVisible();
  test.skip((await row.getByRole("button", { name: "Respond" }).count()) === 0, "Already responded today (store resets daily).");
  await row.getByRole("button", { name: "Respond" }).click();
  const form = sheet(page);
  await form.getByRole("button", { name: "Submit response" }).click();
  await expect(form.getByText("This question needs an answer.").first()).toBeVisible();
  await form.getByRole("group", { name: /Overall, how would you rate/ }).getByRole("radio", { name: "4", exact: true }).check();
  await form.getByRole("group", { name: /recommend GTF/ }).getByRole("radio", { name: "9", exact: true }).check();
  await form.getByRole("group", { name: /workload/ }).getByLabel("Manageable", { exact: true }).check();
  await form.getByRole("group", { name: /supported do you feel/ }).getByRole("radio", { name: "5", exact: true }).check();
  await form.getByLabel(/Anything else you would like leadership to hear/).fill("More learning time, please.");
  await form.getByRole("button", { name: "Submit response" }).click();
  await expect(form).toBeHidden();
  await expect(row.getByText("Response submitted")).toBeVisible();
});

test("employee gives praise that appears on the wall and in the feed", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/engage/praise");
  const message = `Ishita rescued the icon handoff at the last minute ${Date.now() % 10000}.`;
  await page.getByRole("button", { name: "Give praise" }).click();
  await sheet(page).getByLabel("Search colleagues").fill("Ishita");
  await sheet(page).getByRole("checkbox", { name: /Ishita Bose/ }).check();
  await sheet(page).getByRole("radio", { name: "Mentor" }).check();
  await sheet(page).getByLabel("Company value").selectOption("craft_with_care");
  await sheet(page).getByLabel("Message").fill(message);
  await sheet(page).getByRole("button", { name: "Share praise" }).click();
  await expect(sheet(page)).toBeHidden();
  const card = page.locator("article.ep-praise", { hasText: message });
  await expect(card).toBeVisible();
  const like = card.getByRole("button", { name: /^Like/ });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("navigation", { name: "Leaderboard month" })).toBeVisible();

  await page.goto("/engage?group=Wins");
  await expect(page.locator("article.post", { hasText: message })).toBeVisible();
});

test("HR builds, publishes and reads survey results with the anonymity threshold", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/surveys");
  const title = `Manager effectiveness ${Date.now() % 10000}`;
  await page.getByRole("button", { name: "New survey" }).click();
  await sheet(page).getByLabel("Title").fill(title);
  await sheet(page).getByLabel("Closes on").fill(plusDays(10));
  await sheet(page).getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/surveys\/sv_/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByLabel("Question type").selectOption("enps");
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("How likely are you to recommend your manager?");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByText("How likely are you to recommend your manager?")).toBeVisible();

  await page.getByLabel("Question type").selectOption("single");
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("How often do you have 1:1s?");
  await page.getByLabel("Options").fill("Weekly");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByText("Add at least 2 options, one per line.")).toBeVisible();
  await page.getByLabel("Options").fill("Weekly\nFortnightly\nMonthly\nRarely");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByText("How often do you have 1:1s?")).toBeVisible();

  await page.getByRole("button", { name: "Publish survey" }).click();
  await page.getByRole("button", { name: "Confirm publish" }).click();
  await expect(page.getByText(/Results hidden until 5 people respond/)).toBeVisible();

  // The seeded pulse survey has 12 responses: results, eNPS and suppressed departments.
  await page.goto("/admin/surveys");
  await page.getByRole("table", { name: "Surveys" }).getByRole("link", { name: "Quarterly pulse check — Q3" }).click();
  await expect(page.getByRole("heading", { name: /^eNPS [+-]?\d+/ })).toBeVisible();
  const departments = page.getByRole("table", { name: "Responses by department" });
  await expect(departments.getByRole("row", { name: /Engineering/ })).not.toContainText("Hidden");
  await expect(departments.getByRole("row", { name: /^Design/ })).toContainText("Fewer than 5");
  const csv = await page.request.get(page.url().replace(/\/admin\/surveys\/(sv_\w+).*/, "/api/engage/surveys/$1/results.csv"));
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("eNPS");
});

test("employees cannot open the survey admin or export results", async ({ page }) => {
  await signIn(page, "Employee");
  await page.goto("/admin/surveys");
  await expect(page.getByText(/don’t have access/).first()).toBeVisible();
  const csv = await page.request.get("/api/engage/surveys/sv_1/results.csv");
  expect(csv.status()).toBe(403);
});
