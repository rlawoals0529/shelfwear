import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("random result draws only from the current Shelf Index search results", async ({ page }) => {
  const search = page.getByLabel("Search games in the whole shelf");
  await search.fill("hades");
  await expect(page.locator(".library-rows .library-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Open one random current Shelf Index result" }).click();

  await expect(page.getByRole("complementary", { name: /Details for Hades/ })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Randomly opened 1 of 1 current Shelf Index result");
});

test("random result respects factual filters instead of the full library", async ({ page }) => {
  await page.getByRole("button", { name: "100h+" }).click();
  const countText = await page.locator(".library-result-count").innerText();
  const match = countText.match(/showing\s+(\d+)/i);
  expect(match).not.toBeNull();
  const eligible = Number(match![1]);
  expect(eligible).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Open one random current Shelf Index result" }).click();
  const drawer = page.locator(".library-catalog-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".library-catalog-facts")).toContainText(/\d+(?:\.\d+)?h/);

  const openedHours = await drawer.locator(".library-catalog-facts span").first().locator("b").innerText();
  expect(Number(openedHours.replace("h", ""))).toBeGreaterThanOrEqual(100);
  await expect(page.getByRole("status")).toContainText(`1 of ${eligible} current Shelf Index`);
});

test("random-result action fits with export controls on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const heading = page.locator(".library-heading");
  await expect(page.getByRole("button", { name: "Open one random current Shelf Index result" })).toBeVisible();

  expect(await heading.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
