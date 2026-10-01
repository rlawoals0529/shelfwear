import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("summarizes active Shelf Index state and resets search/filter/sort together", async ({ page }) => {
  await page.getByRole("button", { name: "Compact" }).click();
  await page.getByRole("button", { name: "A–Z" }).click();
  await page.getByRole("button", { name: "100h+" }).click();
  await page.getByLabel("Search games in the whole shelf").fill("a");

  const summary = page.locator(".library-view-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("a");
  await expect(summary).toContainText("100h+");
  await expect(summary).toContainText("A–Z");

  await summary.getByRole("button", { name: "Reset view" }).click();

  await expect(page.getByLabel("Search games in the whole shelf")).toHaveValue("");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Most played" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
  await expect(summary).toHaveCount(0);

  const storedSort = await page.evaluate(() => localStorage.getItem("shelfwear:library-sort"));
  expect(storedSort).toBe("most-played");
});

test("does not show a reset strip for the default Shelf Index view", async ({ page }) => {
  await expect(page.locator(".library-view-summary")).toHaveCount(0);
});

test("active-view summary and reset action fit on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Least played" }).click();

  const summary = page.locator(".library-view-summary");
  await expect(summary).toBeVisible();
  expect(await summary.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(summary.getByRole("button", { name: "Reset view" })).toBeVisible();
});
