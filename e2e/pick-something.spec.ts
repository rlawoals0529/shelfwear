import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const ALL = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Pick Something explains the pool and only unlocks local install state from real files", async ({ page }) => {
  const picker = page.getByRole("region", { name: "Pick something" });
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("It is not a taste recommendation");
  await expect(picker.getByRole("option", { name: "Installed on this PC" })).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles(ALL);

  await expect(picker.getByRole("option", { name: "Installed on this PC" })).toHaveCount(1);
  await expect(picker).toContainText("1 game with 0h recorded");

  await picker.getByRole("button", { name: "Draw from this drawer" }).click();
  await expect(picker.getByRole("heading", { name: "Fixture Never Launched" })).toBeVisible();
  await expect(picker).toContainText("Drawn from 1 game with 0h recorded.");

  await picker.getByRole("button", { name: "Exclude this game for this session" }).click();
  await expect(picker).toContainText("Nothing is eligible in this drawer right now.");
  await expect(picker).toContainText("1 excluded for this session");
  await expect(picker.getByRole("button", { name: "Reset 1 session exclusion" })).toBeVisible();
});

test("Pick Something can draw from a literal under-two-hours pool", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  const picker = page.getByRole("region", { name: "Pick something" });

  await picker.getByLabel("Pick Something drawer").selectOption("under-two");
  await expect(picker).toContainText("1 played game with more than 0h and under 2h recorded");

  await picker.getByRole("button", { name: "Draw from this drawer" }).click();
  await expect(picker.getByRole("heading", { name: "app 800" })).toBeVisible();
  await expect(picker).toContainText("0.5h recorded");
});

test("Pick Something stays inside a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const picker = page.getByRole("region", { name: "Pick something" });
  await expect(picker).toBeVisible();

  const overflow = await picker.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
