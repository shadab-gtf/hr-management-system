import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("server renders fixtures, hydrates without errors, and loads local Google Sans", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:"))
      external.push(request.url());
  });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(await response?.text()).toContain("Aanya Sharma");
  await expect(
    page.getByRole("heading", { name: "Good work starts here." }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain("googleSans");
  await expect(page.getByRole("row")).toHaveCount(5);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("theme persists across reload and system preference follows the OS", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Appearance").selectOption("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(16, 20, 28)");
  await page.getByLabel("Appearance").selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(247, 248, 250)");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(16, 20, 28)");
});

test("form validates, preview dialog traps focus, Escape restores focus, Sonner supplements inline feedback", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Preview profile" }).click();
  await expect(page.getByLabel("Full name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Full name").fill("Demo Colleague");
  await page.getByRole("button", { name: "Preview profile" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Demo Colleague" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Done" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Preview profile" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("");
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    "Preview fields cleared",
  );
  await expect(page.locator(".form-notice")).toHaveText(
    "Preview fields cleared.",
  );
});

test("query-backed table filters fixtures and recovers from an empty result", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByLabel("Search sample people");
  await search.fill("Engineering");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(
    page.getByRole("cell", { name: "Engineering", exact: true }),
  ).toBeVisible();
  await search.fill("No matching sample");
  await expect(
    page.getByRole("heading", { name: "No matching people" }),
  ).toBeVisible();
  await search.clear();
  await expect(page.getByRole("row")).toHaveCount(5);
});

for (const width of [360, 768, 1280, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`responsive and accessibility ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/");
      await page.getByLabel("Appearance").selectOption(theme);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      if (width === 1440 || width === 360)
        await page.screenshot({
          path: `completion/evidence/fe1-${width}-${theme}.png`,
          fullPage: true,
        });
    });
  }
}

test("reduced motion disables skeleton movement and keyboard skip link works", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good work starts here." }),
  ).toBeVisible();
  expect(
    await page
      .locator(".loading-example .skeleton")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("unknown routes show a safe 404", async ({ page }) => {
  await page.goto("/not-a-real-page");
  await expect(
    page.getByRole("heading", { name: "Nothing here just yet." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to foundation" }).click();
  await expect(
    page.getByRole("heading", { name: "Good work starts here." }),
  ).toBeVisible();
});

for (const width of [360, 768, 1280, 1440]) {
  test("Boneyard loading geometry at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/loading-preview");
    const bone = page.locator("[data-boneyard-bone]").first();
    await expect(bone).toBeVisible();
    expect(await page.locator("[data-boneyard-bone]").count()).toBeGreaterThan(
      100,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await bone.evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.locator("a.brand").click();
    await expect(
      page.getByRole("heading", { name: "Good work starts here." }),
    ).toBeVisible();
  });
}

for (const reduced of [false, true]) {
  test(
    "sidebar collapses to a rail and expands with keyboard; reduced motion " +
      reduced,
    async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      await page.goto("/");
      await expect(page.locator("#workspace-sidebar")).toHaveCount(1);
      const sidebar = page.getByRole("complementary", { name: "Workspace navigation" });
      await expect
        .poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
        .toBe(242);
      const toggle = page.getByRole("button", { name: "Collapse sidebar" });
      await toggle.click();
      await expect(
        page.getByRole("button", { name: "Expand sidebar" }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect
        .poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
        .toBe(64);
      await expect(
        page.getByRole("link", { name: "Brand & colors", exact: true }),
      ).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
      if (!reduced)
        await page.screenshot({
          path: "completion/evidence/sidebar-collapsed.png",
          fullPage: true,
        });
      await page.getByRole("button", { name: "Expand sidebar" }).focus();
      await page.keyboard.press("Enter");
      await expect
        .poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
        .toBe(242);
      await expect(
        page.getByRole("button", { name: "Collapse sidebar" }),
      ).toBeFocused();
    },
  );
}
test("mobile sidebar collapses without leaving hidden links keyboard-accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator("#workspace-sidebar")).toHaveAttribute("inert", "");
  await expect
    .poll(async () =>
      Math.round(
        (await page.locator("#workspace-sidebar").boundingBox())?.height ?? 0,
      ),
    )
    .toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator("#workspace-sidebar")).not.toHaveAttribute(
    "inert",
    "",
  );
  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
});
