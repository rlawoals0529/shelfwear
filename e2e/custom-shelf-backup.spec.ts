import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My shelves" }).click();
});

test("downloads a portable backup without library metrics", async ({ page }) => {
  await page.getByRole("button", { name: "Comfort games" }).click();
  await page.getByLabel("Search games to add to active shelf").fill("hades");
  await page.locator(".custom-shelf-suggestions button").first().click();
  await page.getByLabel(/Note for .* on Comfort games/).fill("rainy day");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^shelfwear-my-shelves-\d{4}-\d{2}-\d{2}\.json$/);

  const raw = await readFile((await download.path())!, "utf8");
  const parsed = JSON.parse(raw);
  expect(parsed.schema).toBe("shelfwear.custom-shelves.v1");
  expect(parsed.shelves).toHaveLength(1);
  expect(parsed.shelves[0].name).toBe("Comfort games");
  expect(parsed.shelves[0].games[0].note).toBe("rainy day");
  expect(raw).not.toContain('"minutes"');
  expect(raw).not.toContain('"installed"');
  expect(raw).not.toContain('"bytes"');
});

test("restores a validated backup and replaces current browser-local shelves", async ({ page }) => {
  await page.getByRole("button", { name: "Comfort games" }).click();

  const backup = {
    schema: "shelfwear.custom-shelves.v1",
    exportedAt: "2026-10-01T05:00:00.000Z",
    shelves: [{
      id: "restored",
      name: "Restored favorites",
      createdAt: 1,
      updatedAt: 2,
      games: [{ appid: "10", name: "Counter-Strike", note: "old favorite" }],
    }],
  };

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("replaces the 1 currently stored shelf");
    await dialog.accept();
  });

  await page.getByLabel("Choose a My Shelves backup").setInputFiles({
    name: "shelves.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(page.getByRole("status")).toContainText("Restored 1 shelf");
  await expect(page.getByRole("button", { name: /Restored favorites/ })).toBeVisible();
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Restored favorites");
  await expect(page.locator(".custom-shelf-game")).toContainText("Counter-Strike");
  await expect(page.getByLabel("Note for Counter-Strike on Restored favorites")).toHaveValue("old favorite");

  await page.reload();
  await page.getByRole("button", { name: "My shelves" }).click();
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Restored favorites");
});

test("rejects unrelated JSON without changing shelves", async ({ page }) => {
  await page.getByRole("button", { name: "Comfort games" }).click();

  await page.getByLabel("Choose a My Shelves backup").setInputFiles({
    name: "wrong.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schema":"not-shelfwear","shelves":[]}'),
  });

  await expect(page.getByRole("alert")).toContainText("Unsupported Shelfwear shelves backup version");
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Comfort games");
});

test("backup controls fit on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Comfort games" }).click();
  const backup = page.locator(".custom-shelf-backup");
  await expect(backup).toBeVisible();
  expect(await backup.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
