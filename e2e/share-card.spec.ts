import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";

test("downloads the sample top-nine card as a real PNG without network data", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __shelfwearFillText: string[] }).__shelfwearFillText = seen;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      seen.push(String(args[0]));
      return original.apply(this, args as Parameters<CanvasRenderingContext2D["fillText"]>);
    };
  });
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

  const drawnText = await page.evaluate(() =>
    (window as unknown as { __shelfwearFillText: string[] }).__shelfwearFillText,
  );
  expect(drawnText).toContain("shelfwear ♡");
  expect(drawnText).not.toContain("cat");
  expect(drawnText).not.toContain("moth");
  expect(drawnText).not.toContain("magpie");
  expect(drawnText).not.toContain("fox");
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
  await page.getByRole("button", { name: "Shelf stories" }).click();
  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByLabel("Optional Steam AppID or store link").fill("1145360");
  await page.getByRole("button", { name: "Add game", exact: true }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 1080×1350 card" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("shelfwear-games-that-shaped-me.png");
  const path = await download.path();
  expect(path).not.toBeNull();

  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
});


test("curated export keeps the library-provided Steam icon fallback", async ({ page }) => {
  const iconHash = "8c7fc95092f64b0a99c4e02263caf254da89b7bb";
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const coverRequests: string[] = [];

  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: 1,
        profile: {
          steamid: "76561198000000000",
          name: "Cozy Player",
          avatar: null,
          profileUrl: "https://steamcommunity.com/id/cozyplayer/",
        },
        games: [{
          appid: "3681810",
          name: "Blue Protocol: Star Resonance",
          minutes: 60000,
          iconHash,
        }],
      }),
    });
  });

  await page.route("**/api/steam/cover/*", async (route) => {
    coverRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();
  await page.getByRole("button", { name: "Shelf stories" }).click();
  await page.getByRole("button", { name: "Fill from playtime" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 1080×1350 card" }).click();
  await downloadPromise;

  expect(coverRequests.some((url) =>
    url.includes("/api/steam/cover/3681810") && url.includes(`icon=${iconHash}`)
  )).toBe(true);
});


test("Shelf Story prompts update the card without replacing picked games", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Shelf stories" }).click();

  await expect(page.getByRole("heading", { name: "Shelf stories" })).toBeVisible();
  await expect(page.getByRole("button", { name: /games that shaped me/i })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await expect(page.locator(".curated-list-row")).toHaveCount(1);

  await page.getByRole("button", { name: /my comfort games/i }).click();
  await expect(page.getByLabel("Shelf story card title")).toHaveValue("my comfort games");
  await expect(page.getByLabel("Shelf story card caption")).toHaveValue("the ones I always know I can come back to");
  await expect(page.locator(".curated-list-row")).toHaveCount(1);
  await expect(page.locator(".curated-list-row")).toContainText("Hades");
});

test("Shelf Story notes and card styles survive sharing and appear in exports", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __storyFillText: string[] }).__storyFillText = seen;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      seen.push(String(args[0]));
      return original.apply(this, args as Parameters<CanvasRenderingContext2D["fillText"]>);
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Shelf stories" }).click();
  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await page.getByLabel("Why Hades belongs in this story").fill("the run that made roguelikes click");
  await page.getByRole("button", { name: /^Poster/ }).click();

  await expect(page.locator(".curated-card-preview")).toHaveClass(/story-style-poster/);
  await expect(page.locator(".curated-game-note")).toHaveText("the run that made roguelikes click");

  await page.getByRole("button", { name: "Copy story link" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(copied);

  await expect(page.getByRole("button", { name: /^Poster/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Why Hades belongs in this story")).toHaveValue("the run that made roguelikes click");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 1080×1350 card" }).click();
  await downloadPromise;

  const drawnText = await page.evaluate(() =>
    (window as unknown as { __storyFillText: string[] }).__storyFillText,
  );
  expect(drawnText).toContain("the run that made roguelikes click");
  expect(drawnText).toContain("a hand-picked story · poster card · not ranked by playtime");
});

test("new story links use story= and old top= links still open", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Shelf stories" }).click();
  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await page.getByRole("button", { name: "Copy story link" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("?story=");
  expect(copied).not.toContain("?top=");

  const storyUrl = new URL(copied);
  const payload = storyUrl.searchParams.get("story");
  expect(payload).toBeTruthy();

  await page.goto(`/?top=${payload}`);
  await expect(page.getByRole("button", { name: "Shelf stories" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Shelf story card title")).toHaveValue("games that shaped me");
  await expect(page.locator(".curated-list-row")).toContainText("Hades");
});


test("downloads a standalone Shelf Familiar card with transparent evidence", async ({ page }) => {
  await page.goto("/");

  const familiar = page.locator(".familiar-v2");
  await expect(familiar).toBeVisible();
  await expect(familiar.locator(".familiar-signals > span")).toHaveCount(3);
  await expect(familiar.getByText("Why this one:", { exact: false })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download familiar card" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^shelfwear-[a-z0-9-]+-familiar\.png$/);
  const path = await download.path();
  expect(path).not.toBeNull();

  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
});
