import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const ALL = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

/** A headline figure, found by its label rather than by its value. */
const metric = (page: import("@playwright/test").Page, label: string) =>
  page.locator(".metric").filter({ hasText: label }).locator("b");

/** A row in the full list, which is where a game's own name is the exact text. */
const row = (page: import("@playwright/test").Page, name: string) =>
  page.locator(".row").filter({ has: page.locator(".name", { hasText: name }) });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows a real library before you have given it anything", async ({ page }) => {
  // A page whose first paint is an empty drop zone teaches nothing. The sample has to be
  // labelled as a sample, though, or it reads as the visitor's own data.
  await expect(page.getByRole("heading", { name: "shelfwear" })).toBeVisible();
  await expect(page.getByText("Reading the sample library.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The shelf" })).toBeVisible();
  await expect(page.getByText("nothing is fetched")).toBeVisible();
});

test("reads dropped Steam files, tabs and inconsistent capitalisation included", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);

  await expect(page.getByText("3 files")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything (3)" })).toBeVisible();

  // The fixture writes "Apps" and both "playTime" and "playtime". Steam does all three,
  // and a reader that only handles one reports an empty library on half the machines.
  await expect(row(page, "Fixture Alpha")).toBeVisible();
  await expect(row(page, "Fixture Never Launched")).toBeVisible();

  // 6000 + 30 minutes = 100.5 hours. Reading the label rather than hunting for the
  // number means this cannot pass by matching some other figure that happens to agree.
  await expect(metric(page, "hours played")).toHaveText("100.5");
  await expect(metric(page, "games here")).toHaveText("3");
});

test("a game with no manifest is a row, not a hole", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  // App 800 has playtime and no manifest: played, then uninstalled. It still happened.
  const uninstalled = page.locator(".row").filter({ hasText: "app 800" });
  await expect(uninstalled).toBeVisible();
  await expect(uninstalled).toContainText("not installed");
  await expect(uninstalled).toContainText("0.5h");
});

test("never launched is counted, and its disk is counted separately", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  // 900 is installed at 50 GB and has never been launched. Separating that from the
  // 60 GB total is the number the whole page exists to show.
  await expect(metric(page, "never launched")).toHaveText("1");
  // One decimal, because the headline figures count up to their value and hold their
  // width while they do it. Same numbers, written the way the page writes them.
  await expect(metric(page, "installed")).toHaveText("60.0 GB");
  await expect(metric(page, "held by unplayed")).toHaveText("50.0 GB");
});

test("a file that is not a manifest is reported, not silently dropped", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles([...ALL, F("notes.txt")]);
  await expect(page.getByText("1 file skipped: not a manifest.")).toBeVisible();
  // And the real files still loaded.
  await expect(page.getByRole("heading", { name: "Everything (3)" })).toBeVisible();
});

test("files with nothing in them say so instead of rendering an empty library", async ({ page }) => {
  // Zero games drawn as a result looks exactly like a true answer.
  await page.locator('input[type="file"]').setInputFiles(F("notes.txt"));
  await expect(page.locator(".err")).toContainText("No games in those files");
  await expect(page.getByRole("heading", { name: "Everything (3)" })).toBeHidden();
});

test("you can get back to the sample after loading your own", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  await expect(page.getByText("3 files")).toBeVisible();
  await page.getByRole("button", { name: "Back to the sample" }).click();
  await expect(page.getByText("Reading the sample library.")).toBeVisible();
});

test("the counts are described as a floor, because they are", async ({ page }) => {
  // localconfig only knows apps this client has touched. Presenting that as "your library"
  // would be the single most misleading thing this page could do.
  await expect(page.getByText(/treat every count here as a floor/)).toBeVisible();
  await expect(page.getByText(/not the same as everything you own/)).toBeVisible();
});
