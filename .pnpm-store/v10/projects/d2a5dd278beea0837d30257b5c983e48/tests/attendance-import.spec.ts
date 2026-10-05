import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/* Face-device attendance import: staged preview → commit → duplicate-safe re-run. */

async function signIn(page: Page, persona: "Employee" | "HR operations") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("radio", { name: new RegExp(`^${persona}`) }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * A weekday 8+ days ago (IST), as DD-MM-YYYY and ISO. Recent days are left
 * alone: other specs use the seeded "missing check-out" days near today.
 */
function pastWeekday() {
  const date = new Date(Date.now() + 330 * 60_000 - 8 * 86_400_000);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() - 1);
  const iso = date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-");
  return { iso, dmy: `${d}-${m}-${y}`, month: iso.slice(0, 7) };
}

async function upload(page: Page, name: string, buffer: Buffer, mimeType = "text/csv") {
  await page.goto("/admin/attendance-import");
  await page.getByLabel("Attendance file").setInputFiles({ name, mimeType, buffer });
  await page.getByRole("button", { name: "Upload & check" }).click();
  await expect(page).toHaveURL(/batch=/);
}

test("CSV: rows are validated, committed once, and re-uploads are skipped", async ({ page }) => {
  const day = pastWeekday();
  // Unique per run, so earlier runs' imports don't turn these into duplicates.
  const mm = String(10 + (Date.now() % 49)).padStart(2, "0");
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10).split("-").reverse().join("-");
  const csv = [
    "Emp Code,Employee Name,Attendance Date,Check In,Check Out",
    `GTF-1007,Aanya Sharma,${day.dmy},09:${mm},19:40`,
    `1009,Ishita Bose,${day.dmy},10:${mm},`,
    `9999,Unknown Person,${day.dmy},09:00,18:00`,
    `GTF-1007,Aanya Sharma,${day.dmy},09:10,18:00`,
    `GTF-1010,Kabir Mehta,${future},09:00,18:00`,
    `GTF-1012,Dev Malhotra,${day.dmy},18:00,09:00`,
  ].join("\r\n");

  await signIn(page, "HR operations");
  await upload(page, "face-device.csv", Buffer.from(csv));
  await expect(page.getByText("Daily in/out layout", { exact: false })).toBeVisible();
  const stat = (label: string) => page.locator(".stat", { hasText: label }).locator(".stat-value");
  await expect(stat("Ready to import")).toHaveText("2");
  await expect(stat("Errors")).toHaveText("3");
  await expect(stat("Skipped")).toHaveText("1");
  await expect(page.getByText("Unknown employee code — quarantined, not imported", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/No check-out — will need review/).first()).toBeVisible();

  await page.getByRole("button", { name: "Import 2 days" }).click();
  await expect(page.getByText("Imported 2 attendance days")).toBeVisible();
  await expect(page.getByText(/Attendance, late marks and overtime now use these punches/)).toBeVisible();

  // Same file again: nothing new to import.
  await upload(page, "face-device.csv", Buffer.from(csv));
  await expect(stat("Ready to import")).toHaveText("0");
  await expect(page.getByRole("button", { name: "Import 0 days" })).toBeDisabled();

  await signIn(page, "Employee");
  await page.goto(`/attendance?month=${day.month}`);
  await expect(page.locator(`[aria-label*="in 09:${mm}, out 19:40"]`)).toBeVisible();
});

test("Excel punch log: first in / last out per day, serial dates, unknown codes quarantined", async ({ page }) => {
  await signIn(page, "HR operations");
  const file = path.join(__dirname, "fixtures", "face-device-punch-log.xlsx");
  await page.goto("/admin/attendance-import");
  await page.getByLabel("Attendance file").setInputFiles(file);
  await page.getByRole("button", { name: "Upload & check" }).click();
  await expect(page).toHaveURL(/batch=/);
  await expect(page.getByText(/Punch-log layout/)).toBeVisible();
  const aditya = page.getByRole("row", { name: /Aditya Joshi/ });
  await expect(aditya).toContainText("09:12");
  await expect(aditya).toContainText("19:48");
  await expect(page.getByRole("row", { name: /Riya Desai/ })).toContainText("09:30");
  await expect(page.getByRole("row", { name: /Riya Desai/ })).toContainText("18:30");
  await expect(page.getByText("Unknown employee code — quarantined, not imported", { exact: true }).first()).toBeVisible();
});

test("wrong file types and header-less files get a clear error", async ({ page }) => {
  await signIn(page, "HR operations");
  await page.goto("/admin/attendance-import");
  await page.getByLabel("Attendance file").setInputFiles({ name: "notes.csv", mimeType: "text/csv", buffer: Buffer.from("hello,world\r\n1,2") });
  await page.getByRole("button", { name: "Upload & check" }).click();
  await expect(page.getByText(/Couldn't find the header row/)).toBeVisible();
  await page.getByLabel("Attendance file").setInputFiles({ name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") });
  await page.getByRole("button", { name: "Upload & check" }).click();
  await expect(page.getByText(/Old .xls files aren't supported/)).toBeVisible();

  await signIn(page, "Employee");
  await page.goto("/admin/attendance-import");
  await expect(page.getByText(/don.t have access/i).first()).toBeVisible();
});
