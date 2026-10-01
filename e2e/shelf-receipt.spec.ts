import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const LOCAL_FILES = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

test("downloads a source-labeled Shelf Receipt from the sample", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __receiptText: string[] }).__receiptText = seen;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      seen.push(String(args[0]));
      return original.apply(this, args as Parameters<CanvasRenderingContext2D["fillText"]>);
    };
  });

  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download shelf receipt" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("shelfwear-my-receipt.png");
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);

  const text = await page.evaluate(() => (window as unknown as { __receiptText: string[] }).__receiptText);
  expect(text).toContain("SHELFWEAR / SHELF RECEIPT");
  expect(text).toContain("SYNTHETIC DEMO DATA");
  expect(text).toContain("OBSERVED VALUES ONLY");
  expect(text).not.toContain("BIGGEST KNOWN INSTALLS");
});

test("public Shelf Receipts do not invent local install lines", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __receiptPublicText: string[] }).__receiptPublicText = seen;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      seen.push(String(args[0]));
      return original.apply(this, args as Parameters<CanvasRenderingContext2D["fillText"]>);
    };
  });

  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: 2,
        profile: { steamid: "76561198000000000", name: "Cozy Player", avatar: null, profileUrl: null },
        games: [
          { appid: "10", name: "Long Hours", minutes: 6000 },
          { appid: "20", name: "Untouched", minutes: 0 },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download shelf receipt" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shelfwear-cozy-player-receipt.png");

  const text = await page.evaluate(() => (window as unknown as { __receiptPublicText: string[] }).__receiptPublicText);
  expect(text).toContain("PUBLIC STEAM DATA");
  expect(text).toContain("100.0 HOURS");
  expect(text).not.toContain("BIGGEST KNOWN INSTALLS");
});


test("local Shelf Receipts can show biggest known installs from real files", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __receiptLocalText: string[] }).__receiptLocalText = seen;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      seen.push(String(args[0]));
      return original.apply(this, args as Parameters<CanvasRenderingContext2D["fillText"]>);
    };
  });

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(LOCAL_FILES);
  await expect(page.getByText("3 files")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download shelf receipt" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shelfwear-my-receipt.png");

  const text = await page.evaluate(() => (window as unknown as { __receiptLocalText: string[] }).__receiptLocalText);
  expect(text).toContain("LOCAL STEAM FILES · THIS PC");
  expect(text).toContain("BIGGEST KNOWN INSTALLS");
  expect(text).toContain("Fixture Never Launched");
  expect(text).toContain("50.0 GB");
});
