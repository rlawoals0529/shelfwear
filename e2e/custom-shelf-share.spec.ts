import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "My shelves" }).click();
});

test("shares an ordered shelf list without private notes", async ({ page }) => {
  await page.getByRole("button", { name: "Comfort games" }).click();
  await page.getByLabel("Search games to add to active shelf").fill("hades");
  await page.locator(".custom-shelf-suggestions button").first().click();
  await page.getByLabel(/Note for .* on Comfort games/).fill("private rainy-day note");

  await page.getByRole("button", { name: "Share game list" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Comfort games");
  expect(copied).toContain("1. Hades");
  expect(copied).toContain("Made with Shelfwear");
  expect(copied).not.toContain("private rainy-day note");
  expect(copied).not.toContain("appid");
  await expect(page.getByRole("status")).toContainText("without private notes");
});

test("share-list and Shelf Story actions stack cleanly on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Comfort games" }).click();
  await page.getByLabel("Search games to add to active shelf").fill("hades");
  await page.locator(".custom-shelf-suggestions button").first().click();

  const actions = page.locator(".custom-shelf-head-actions");
  await expect(actions).toBeVisible();
  expect(await actions.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
