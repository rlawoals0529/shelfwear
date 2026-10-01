import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const ALL = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("slash focuses Shelf Index search and Escape clears it", async ({ page }) => {
  const search = page.getByLabel("Search games in the whole shelf");
  await expect(search).not.toBeFocused();

  await page.keyboard.press("/");
  await expect(search).toBeFocused();

  await search.fill("never");
  await expect(page.locator(".library-rows .library-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Clear library search" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(page.getByRole("button", { name: "Clear library search" })).toHaveCount(0);
});

test("clear button keeps focus in search for another query", async ({ page }) => {
  const search = page.getByLabel("Search games in the whole shelf");
  await search.fill("hades");
  await page.getByRole("button", { name: "Clear library search" }).click();

  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
});

test("Escape closes an open Shelf Index card when search is not being edited", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  await page.getByRole("button", { name: /Open details for Fixture Alpha/ }).click();

  const drawer = page.getByRole("complementary", { name: /Details for Fixture Alpha/ });
  await expect(drawer).toBeVisible();

  await page.locator(".library-heading").click();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("slash shortcut does not steal focus while typing elsewhere", async ({ page }) => {
  const steam = page.getByLabel("Steam username, profile URL, or SteamID");
  await steam.focus();
  await page.keyboard.type("/");
  await expect(steam).toHaveValue("/");
  await expect(page.getByLabel("Search games in the whole shelf")).not.toBeFocused();
});

test("quick-find controls fit at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const search = page.locator(".library-search");
  await expect(search).toBeVisible();

  await page.getByLabel("Search games in the whole shelf").fill("hades");
  expect(await search.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
