import { expect, test, type Page } from "@playwright/test";

async function seedTransferShelves(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("shelfwear:custom-shelves:v1", JSON.stringify([
      {
        id: "source",
        name: "Source Shelf",
        createdAt: 1,
        updatedAt: 1,
        games: [
          { appid: "1", name: "Game 1", note: "source one" },
          { appid: "2", name: "Game 2", note: "source two" },
          { appid: "3", name: "Game 3", note: "source three" },
        ],
      },
      {
        id: "target",
        name: "Target Shelf",
        createdAt: 2,
        updatedAt: 2,
        games: [
          { appid: "2", name: "Game 2", note: "target two" },
        ],
      },
    ]));
  });
  await page.reload();
  await page.getByRole("button", { name: "My shelves" }).click();
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Source Shelf");
  await page.getByRole("button", { name: "Bulk edit" }).click();
}

async function storedShelves(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("shelfwear:custom-shelves:v1") ?? "[]")
  );
}

test("bulk copy skips duplicates, preserves notes, and can be undone", async ({ page }) => {
  await seedTransferShelves(page);

  await page.getByRole("checkbox", { name: "Select Game 1 for bulk editing" }).check();
  await page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" }).check();

  const target = page.getByLabel("Destination shelf for selected games");
  await target.selectOption("target");
  await expect(page.locator(".custom-shelf-bulk-transfer")).toContainText("1 can be added");
  await expect(page.locator(".custom-shelf-bulk-transfer")).toContainText("1 already there");

  await page.getByRole("button", { name: "Copy to shelf" }).click();
  await expect(page.locator(".custom-shelf-bulk-status")).toContainText("Copied 1 selected game to “Target Shelf”");
  await expect(page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select Game 1 for bulk editing" })).not.toBeChecked();

  await expect.poll(async () => {
    const shelves = await storedShelves(page);
    return shelves.map((shelf: { games: Array<{ appid: string }> }) => shelf.games.map((game) => game.appid));
  }).toEqual([["1", "2", "3"], ["2", "1"]]);

  const copied = await storedShelves(page);
  expect(copied[0].games[0].note).toBe("source one");
  expect(copied[1].games[0].note).toBe("target two");
  expect(copied[1].games[1].note).toBe("source one");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".custom-shelf-bulk-status")).toContainText("Undid: Copy 1 game to “Target Shelf”");
  await expect(page.getByRole("checkbox", { name: "Select Game 1 for bulk editing" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" })).toBeChecked();

  await expect.poll(async () => {
    const shelves = await storedShelves(page);
    return shelves.map((shelf: { games: Array<{ appid: string }> }) => shelf.games.map((game) => game.appid));
  }).toEqual([["1", "2", "3"], ["2"]]);
});

test("bulk move removes only inserted games and undo restores both shelves", async ({ page }) => {
  await seedTransferShelves(page);

  await page.getByRole("checkbox", { name: "Select Game 1 for bulk editing" }).check();
  await page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" }).check();
  await page.getByRole("checkbox", { name: "Select Game 3 for bulk editing" }).check();
  await page.getByLabel("Destination shelf for selected games").selectOption("target");

  await page.getByRole("button", { name: "Move to shelf" }).click();
  await expect(page.locator(".custom-shelf-bulk-status")).toContainText("Moved 2 selected games to “Target Shelf”");
  await expect(page.locator(".custom-shelf-bulk-status")).toContainText("1 already was there");
  await expect(page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" })).toBeChecked();

  await expect.poll(async () => {
    const shelves = await storedShelves(page);
    return shelves.map((shelf: { games: Array<{ appid: string }> }) => shelf.games.map((game) => game.appid));
  }).toEqual([["2"], ["2", "1", "3"]]);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => {
    const shelves = await storedShelves(page);
    return shelves.map((shelf: { games: Array<{ appid: string }> }) => shelf.games.map((game) => game.appid));
  }).toEqual([["1", "2", "3"], ["2"]]);
  await expect(page.getByRole("checkbox", { name: "Select Game 1 for bulk editing" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select Game 3 for bulk editing" })).toBeChecked();
});

test("one-step undo restores bulk reorder and removal", async ({ page }) => {
  await seedTransferShelves(page);

  await page.getByRole("checkbox", { name: "Select Game 2 for bulk editing" }).check();
  await page.getByRole("checkbox", { name: "Select Game 3 for bulk editing" }).check();
  await page.getByRole("button", { name: "Move to top" }).click();

  expect(await page.locator(".custom-shelf-game-copy > b").allTextContents()).toEqual(["Game 2", "Game 3", "Game 1"]);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await page.locator(".custom-shelf-game-copy > b").allTextContents()).toEqual(["Game 1", "Game 2", "Game 3"]);

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Remove selected" }).click();
  expect(await page.locator(".custom-shelf-game-copy > b").allTextContents()).toEqual(["Game 1"]);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await page.locator(".custom-shelf-game-copy > b").allTextContents()).toEqual(["Game 1", "Game 2", "Game 3"]);
  await expect(page.getByLabel("Note for Game 2 on Source Shelf")).toHaveValue("source two");
});

test("bulk transfer controls and undo strip fit on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedTransferShelves(page);
  await page.getByRole("checkbox", { name: "Select Game 1 for bulk editing" }).check();

  const transfer = page.locator(".custom-shelf-bulk-transfer");
  await expect(transfer).toBeVisible();
  expect(await transfer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Copy to shelf" }).click();
  const status = page.locator(".custom-shelf-bulk-status");
  await expect(status.getByRole("button", { name: "Undo" })).toBeVisible();
  expect(await status.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
