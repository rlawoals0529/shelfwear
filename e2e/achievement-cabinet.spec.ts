import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Achievement Cabinet is on-demand, factual, selectable, and exportable", async ({ page }) => {
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  let achievementRequests = 0;

  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __trophyFillText: string[] }).__trophyFillText = seen;
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
        gameCount: 1,
        profile: {
          steamid: "76561198000000000",
          name: "Trophy Player",
          avatar: null,
          profileUrl: null,
        },
        games: [{ appid: "10", name: "Shared Quest", minutes: 2400, iconHash: null }],
      }),
    });
  });

  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  });

  await page.route("**/api/steam/achievements?*", async (route) => {
    achievementRequests++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("steamid")).toBe("76561198000000000");
    expect(url.searchParams.get("appid")).toBe("10");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        appid: "10",
        gameName: "Shared Quest",
        total: 5,
        unlocked: 4,
        completionPercent: 80,
        achievements: [
          {
            apiName: "ACH_HIDDEN_GEM",
            name: "Hidden Gem",
            description: "Find the thing almost nobody finds.",
            achieved: true,
            unlockTime: 1700300000,
            globalPercent: 0.7,
            hidden: false,
            icon: null,
          },
          {
            apiName: "ACH_RARE_FIND",
            name: "Rare Find",
            description: "A less common milestone.",
            achieved: true,
            unlockTime: 1700200000,
            globalPercent: 2.5,
            hidden: false,
            icon: null,
          },
          {
            apiName: "ACH_FIRST",
            name: "First Steps",
            description: "Begin the journey.",
            achieved: true,
            unlockTime: 1700000000,
            globalPercent: 75,
            hidden: false,
            icon: null,
          },
          {
            apiName: "ACH_NO_RARITY",
            name: "No Rarity Data",
            description: null,
            achieved: true,
            unlockTime: 1700100000,
            globalPercent: null,
            hidden: false,
            icon: null,
          },
          {
            apiName: "ACH_LOCKED",
            name: "Still Locked",
            description: null,
            achieved: false,
            unlockTime: null,
            globalPercent: 0.2,
            hidden: true,
            icon: null,
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("trophyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();
  await expect(page.getByText("Trophy Player", { exact: true }).first()).toBeVisible();
  expect(achievementRequests).toBe(0);

  await page.getByRole("button", { name: "Open details for Shared Quest" }).click();
  const drawer = page.getByRole("complementary", { name: "Details for Shared Quest" });
  await expect(drawer.getByText("Achievement Cabinet")).toBeVisible();
  expect(achievementRequests).toBe(0);

  await drawer.getByRole("button", { name: "Load achievements" }).click();
  await expect(drawer.locator(".achievement-cabinet")).toBeVisible();
  expect(achievementRequests).toBe(1);

  await expect(drawer.getByLabel("80% achievement completion")).toBeVisible();
  await expect(drawer.locator(".achievement-cabinet-facts")).toContainText("Hidden Gem");
  await expect(drawer.locator(".achievement-cabinet-facts")).toContainText("0.70% global");
  await expect(drawer.locator(".achievement-cabinet-facts")).toContainText("Latest recorded unlock");
  await expect(drawer.locator(".achievement-cabinet-facts")).toContainText("Hidden Gem");
  await expect(drawer.locator(".achievement-slip")).toHaveCount(4);
  await expect(drawer.locator(".achievement-slip[aria-pressed='true']")).toHaveCount(3);
  await expect(drawer.getByText("Still Locked")).toHaveCount(0);

  await drawer.getByRole("button", { name: /No Rarity Data/ }).click();
  await expect(drawer.locator(".achievement-slip[aria-pressed='true']")).toHaveCount(4);

  const downloadPromise = page.waitForEvent("download");
  await drawer.getByRole("button", { name: "Download Trophy Cabinet" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shelfwear-shared-quest-trophy-cabinet.png");

  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);

  const drawn = await page.evaluate(() =>
    (window as unknown as { __trophyFillText: string[] }).__trophyFillText,
  );
  expect(drawn).toContain("SHELFWEAR / TROPHY CABINET");
  expect(drawn).toContain("Shared Quest");
  expect(drawn).toContain("80%");
  expect(drawn).toContain("Hidden Gem");
  expect(drawn).toContain("CABINET COPY");
  expect(drawn).toContain("TROPHY CABINET / 1080×1350");

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Achievement Cabinet is not offered for local-file mode", async ({ page }) => {
  const fixtures = [
    new URL("./fixtures/localconfig.vdf", import.meta.url).pathname,
    new URL("./fixtures/appmanifest_700.acf", import.meta.url).pathname,
    new URL("./fixtures/appmanifest_900.acf", import.meta.url).pathname,
  ];

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixtures);
  await page.getByRole("button", { name: "Open details for Fixture Alpha" }).click();
  const drawer = page.getByRole("complementary", { name: "Details for Fixture Alpha" });
  await expect(drawer.getByText("Achievement Cabinet")).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Load achievements" })).toHaveCount(0);
});
