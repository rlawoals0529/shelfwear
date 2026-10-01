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

async function seedLongBulkShelf(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const games = Array.from({ length: 50 }, (_, index) => ({
      appid: String(index + 1),
      name: `Game ${index + 1}`,
      note: `note ${index + 1}`,
    }));
    localStorage.setItem("shelfwear:custom-shelves:v1", JSON.stringify([
      {
        id: "bulk-shelf",
        name: "Big Shelf",
        createdAt: 1,
        updatedAt: 1,
        games,
      },
      {
        id: "target-shelf",
        name: "Later Shelf",
        createdAt: 2,
        updatedAt: 2,
        games: [],
      },
    ]));
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

  await expect(page.locator(".custom-shelf-bulk-count")).toContainText("2 of 5 selected");
  await expect(page.locator(".custom-shelf-bulk-count")).toContainText("Game 2 · Game 4");
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

test("bulk edit docket stays reachable while working through a 50-game shelf", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedLongBulkShelf(page);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  const lastGame = page.getByRole("checkbox", { name: "Select Game 50 for bulk editing" });
  await lastGame.scrollIntoViewIfNeeded();
  await lastGame.check();

  const docket = page.locator(".custom-shelf-bulk-docket");
  await expect(docket).toHaveCSS("position", "sticky");
  await expect(docket.locator(".custom-shelf-bulk-count")).toContainText("1 of 50 selected");
  await expect(docket.getByLabel("Destination shelf for selected games")).toBeVisible();
  await expect(docket).toContainText("1 can be added");

  const box = await docket.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThanOrEqual(16);

  await docket.getByRole("button", { name: "Move to top" }).click();
  await expect(docket.getByRole("button", { name: "Undo" })).toBeVisible();
  expect((await shelfOrder(page))[0]).toBe("Game 50");

  await docket.getByRole("button", { name: "Undo" }).click();
  const restored = await shelfOrder(page);
  expect(restored[0]).toBe("Game 1");
  expect(restored[49]).toBe("Game 50");
});

test("bulk selection is keyboard-accessible and fits on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedBulkShelf(page);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  const checkbox = page.getByRole("checkbox", { name: "Select Game 3 for bulk editing" });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();

  const docket = page.locator(".custom-shelf-bulk-docket");
  const toolbar = page.locator(".custom-shelf-bulk-toolbar");
  await expect(docket).toHaveCSS("position", "static");
  await expect(toolbar).toBeVisible();
  expect(await toolbar.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Move to top" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove selected" })).toBeVisible();
});
