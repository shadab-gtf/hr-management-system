import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

// Uses the same verified Chromium as the browser suite. The app must be running.
const port = 9228;
const browser = await chromium.launch({
  args: [`--remote-debugging-port=${port}`],
});
try {
  const result = await lighthouse("http://127.0.0.1:3000", {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices"],
  });
  if (!result) throw new Error("Lighthouse did not return a report.");
  await writeFile(
    "completion/evidence/lighthouse-mobile.json",
    JSON.stringify(result.lhr, null, 2),
  );
  console.log(
    Object.fromEntries(
      Object.entries(result.lhr.categories).map(([name, category]) => [
        name,
        category.score === null ? null : category.score * 100,
      ]),
    ),
  );
} finally {
  await browser.close();
}
