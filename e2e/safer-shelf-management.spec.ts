import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My shelves" }).click();
  await page.getByRole("button", { name: "Comfort games" }).click();
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Comfort games");
});

test("duplicates a shelf with its games and notes intact", async ({ page }) => {
  await page.getByLabel("Search games to add to active shelf").fill("hades");
  await page.locator(".custom-shelf-suggestions button").first().click();
  const note = page.getByLabel(/Note for .* on Comfort games/);
  await note.fill("rainy day");

  await page.getByRole("button", { name: "Duplicate Comfort games" }).click();

  await expect(page.getByRole("status")).toContainText("Duplicated");
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Comfort games copy");
  await expect(page.locator(".custom-shelf-game")).toHaveCount(1);
  await expect(page.locator(".custom-shelf-game")).toContainText("Hades");
  await expect(page.getByLabel(/Note for .* on Comfort games copy/)).toHaveValue("rainy day");

  await page.reload();
  await page.getByRole("button", { name: "My shelves" }).click();
  await expect(page.locator(".custom-shelf-tabs button")).toHaveCount(2);
});

test("requires confirmation before deleting a shelf", async ({ page }) => {
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Your Steam library is not affected");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Delete Comfort games" }).click();
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Comfort games");

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete Comfort games" }).click();
  await expect(page.getByText("Your personal stacks are empty.")).toBeVisible();
});

test("duplicate and delete controls fit on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const actions = page.locator(".custom-shelf-sheet-actions");
  await expect(actions).toBeVisible();
  expect(await actions.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
