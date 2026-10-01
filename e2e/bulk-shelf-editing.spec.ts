import { expect, test, type Page } from "@playwright/test";

async function seedBulkShelf(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("shelfwear:custom-shelves:v1", JSON.stringify([{
      id: "bulk-shelf",
      name: "Big Shelf",
      createdAt: 1,
      updatedAt: 1,
      games: [
        { appid: "1", name: "Game 1", note: "one" },
        { appid: "2", name: "Game 2", note: "two" },
        { appid: "3", name: "Game 3", note: "three" },
        { appid: "4", name: "Game 4", note: "four" },
        { appid: "5", name: "Game 5", note: "five" },
      ],
    }]));
  });
  await page.reload();
  await page.getByRole("button", { name: "My shelves" }).click();
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Big Shelf");
}

async function shelfOrder(page: Page) {
  return page.locator(".custom-shelf-game-copy > b").allTextContents();
}

test("bulk edit moves selected games as a stable block without losing notes", async ({ page }) => {
  await seedBulkShelf(page);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" }).check();
  await page.getByRole("checkbox", { name: "Select Game 4 for bulk editing" }).check();

  await expect(page.locator(".custom-shelf-bulk-count")).toContainText("2 selected");
  await page.getByRole("button", { name: "Move to top" }).click();

  expect(await shelfOrder(page)).toEqual(["Game 2", "Game 4", "Game 1", "Game 3", "Game 5"]);
  await expect(page.locator(".custom-shelf-bulk-status")).toContainText("preserving their relative order");
  await expect(page.getByLabel("Note for Game 2 on Big Shelf")).toHaveValue("two");
  await expect(page.getByLabel("Note for Game 4 on Big Shelf")).toHaveValue("four");

  await page.getByRole("button", { name: "Move to bottom" }).click();
  expect(await shelfOrder(page)).toEqual(["Game 1", "Game 3", "Game 5", "Game 2", "Game 4"]);

  await expect.poll(async () => page.evaluate(() => {
    const shelves = JSON.parse(localStorage.getItem("shelfwear:custom-shelves:v1") ?? "[]");
    return shelves[0]?.games?.map((game: { appid: string }) => game.appid);
  })).toEqual(["1", "3", "5", "2", "4"]);
});

test("bulk removal requires confirmation and only removes selected shelf entries", async ({ page }) => {
  await seedBulkShelf(page);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" }).check();
  await page.getByRole("checkbox", { name: "Select Game 4 for bulk editing" }).check();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Private notes on those shelf entries will also be removed");
    expect(dialog.message()).toContain("Your Steam library is not affected");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Remove selected" }).click();
  await expect(page.locator(".custom-shelf-game")).toHaveCount(5);

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Remove selected" }).click();

  await expect(page.locator(".custom-shelf-game")).toHaveCount(3);
  expect(await shelfOrder(page)).toEqual(["Game 1", "Game 3", "Game 5"]);
  await expect(page.locator(".custom-shelf-bulk-status")).toContainText("Removed 2 selected games");

  await expect.poll(async () => page.evaluate(() => {
    const shelves = JSON.parse(localStorage.getItem("shelfwear:custom-shelves:v1") ?? "[]");
    return shelves[0]?.games;
  })).toEqual([
    { appid: "1", name: "Game 1", note: "one" },
    { appid: "3", name: "Game 3", note: "three" },
    { appid: "5", name: "Game 5", note: "five" },
  ]);
});

test("bulk selection is keyboard-accessible and fits on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedBulkShelf(page);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  const checkbox = page.getByRole("checkbox", { name: "Select Game 3 for bulk editing" });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();

  const toolbar = page.locator(".custom-shelf-bulk-toolbar");
  await expect(toolbar).toBeVisible();
  expect(await toolbar.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Move to top" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove selected" })).toBeVisible();
});
