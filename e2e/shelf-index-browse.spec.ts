import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const ALL = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ALL);
});

test("Shelf Index cards browse the current result sequence without returning to the rows", async ({ page }) => {
  await page.getByRole("button", { name: "Open details for Fixture Alpha" }).click();

  let drawer = page.getByRole("complementary", { name: "Details for Fixture Alpha" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toBeFocused();
  await expect(drawer.locator(".library-catalog-meta")).toContainText("1 of 3 in current view");
  await expect(page.locator('.library-row[data-appid="700"]')).toHaveClass(/selected/);

  await drawer.getByRole("button", { name: "Next game in current Shelf Index results" }).click();
  drawer = page.getByRole("complementary", { name: "Details for app 800" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toBeFocused();
  await expect(drawer.locator(".library-catalog-meta")).toContainText("2 of 3 in current view");
  await expect(page.locator('.library-row[data-appid="800"]')).toHaveClass(/selected/);

  await drawer.getByRole("button", { name: "Next game in current Shelf Index results" }).click();
  drawer = page.getByRole("complementary", { name: "Details for Fixture Never Launched" });
  await expect(drawer.locator(".library-catalog-meta")).toContainText("3 of 3 in current view");
  await expect(drawer.getByRole("button", { name: "Next game in current Shelf Index results" })).toBeDisabled();

  await drawer.getByRole("button", { name: "Previous game in current Shelf Index results" }).click();
  await expect(page.getByRole("complementary", { name: "Details for app 800" })).toBeVisible();
});

test("J and K browse an open Shelf Index card but never steal typing", async ({ page }) => {
  await page.getByRole("button", { name: "Open details for Fixture Alpha" }).click();
  await page.keyboard.press("j");
  await expect(page.getByRole("complementary", { name: "Details for app 800" })).toBeVisible();

  await page.keyboard.press("k");
  await expect(page.getByRole("complementary", { name: "Details for Fixture Alpha" })).toBeVisible();

  const steamInput = page.getByLabel("Steam username, profile URL, or SteamID");
  await steamInput.fill("");
  await steamInput.focus();
  await page.keyboard.type("jk");
  await page.keyboard.press("ArrowDown");
  await expect(steamInput).toHaveValue("jk");
  await expect(page.getByRole("complementary", { name: "Details for Fixture Alpha" })).toBeVisible();
});

test("arrow, page, and edge keys make long Shelf Index result sets faster to traverse", async ({ page }) => {
  await page.getByRole("button", { name: "Open details for Fixture Alpha" }).click();

  let drawer = page.getByRole("complementary", { name: "Details for Fixture Alpha" });
  await expect(drawer).toHaveAttribute(
    "aria-keyshortcuts",
    "ArrowUp ArrowDown K J PageUp PageDown Home End",
  );

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("complementary", { name: "Details for app 800" })).toBeVisible();

  await page.keyboard.press("PageDown");
  await expect(page.getByRole("complementary", { name: "Details for Fixture Never Launched" })).toBeVisible();

  await page.keyboard.press("Home");
  await expect(page.getByRole("complementary", { name: "Details for Fixture Alpha" })).toBeVisible();

  await page.keyboard.press("End");
  await expect(page.getByRole("complementary", { name: "Details for Fixture Never Launched" })).toBeVisible();

  await page.keyboard.press("PageUp");
  drawer = page.getByRole("complementary", { name: "Details for Fixture Alpha" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".library-catalog-meta")).toContainText("1 of 3 in current view");
});

test("browse position follows the active factual filter rather than the full library", async ({ page }) => {
  await page.getByRole("button", { name: "Played", exact: true }).click();
  await page.getByRole("button", { name: "Open details for Fixture Alpha" }).click();

  const drawer = page.getByRole("complementary", { name: "Details for Fixture Alpha" });
  await expect(drawer.locator(".library-catalog-meta")).toContainText("1 of 2 in current view");

  await drawer.getByRole("button", { name: "Next game in current Shelf Index results" }).click();
  const next = page.getByRole("complementary", { name: "Details for app 800" });
  await expect(next.locator(".library-catalog-meta")).toContainText("2 of 2 in current view");
  await expect(page.getByRole("complementary", { name: "Details for Fixture Never Launched" })).toHaveCount(0);
});

test("changing the current view closes a card that no longer belongs to the result set", async ({ page }) => {
  await page.getByRole("button", { name: "Open details for Fixture Never Launched" }).click();
  await expect(page.getByRole("complementary", { name: "Details for Fixture Never Launched" })).toBeVisible();

  await page.getByRole("button", { name: "Played", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Details for Fixture Never Launched" })).toHaveCount(0);
  await expect(page.locator(".library-row.selected")).toHaveCount(0);
});

test("closing a catalog record returns focus and scroll position to its source row", async ({ page }) => {
  await page.getByRole("button", { name: "Open details for app 800" }).click();

  const drawer = page.getByRole("complementary", { name: "Details for app 800" });
  await expect(drawer).toBeFocused();
  await drawer.getByRole("button", { name: "Close game details" }).click();

  const sourceButton = page.getByRole("button", { name: "Open details for app 800" });
  await expect(sourceButton).toBeFocused();
  const position = await sourceButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: window.innerHeight };
  });
  expect(position.bottom).toBeGreaterThan(0);
  expect(position.top).toBeLessThan(position.height);

  await sourceButton.click();
  await expect(page.getByRole("complementary", { name: "Details for app 800" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sourceButton).toBeFocused();
});

test("Shelf Index browse controls fit cleanly on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open details for Fixture Alpha" }).click();

  const drawer = page.getByRole("complementary", { name: "Details for Fixture Alpha" });
  await expect(drawer.getByRole("button", { name: "Next game in current Shelf Index results" })).toBeVisible();
  expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
