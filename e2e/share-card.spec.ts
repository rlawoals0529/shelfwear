import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";

test("downloads the sample top-nine card as a real PNG without network data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your nine" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download card" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("shelfwear-my-nine.png");
  const path = await download.path();
  expect(path).not.toBeNull();

  const info = await stat(path!);
  expect(info.size).toBeGreaterThan(10_000);

  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
});


test("downloads a hand-picked top-games scrapbook card", async ({ page }) => {
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "My top games" }).click();
  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByLabel("Optional Steam AppID or store link").fill("1145360");
  await page.getByRole("button", { name: "Add game", exact: true }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 1080×1350 card" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("shelfwear-my-top-games.png");
  const path = await download.path();
  expect(path).not.toBeNull();

  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
});
