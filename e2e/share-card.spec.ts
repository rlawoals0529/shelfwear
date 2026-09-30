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
