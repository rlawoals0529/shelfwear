import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const ALL = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("exports public Steam data without local-device fields", async ({ page }) => {
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
          profileUrl: null,
        },
        games: [{
          appid: "10",
          name: "Public Game",
          minutes: 125,
          iconHash: "0123456789abcdef0123456789abcdef01234567",
        }],
      }),
    });
  });

  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shelfwear-cozy-player-library.json");

  const raw = await readFile((await download.path())!, "utf8");
  const data = JSON.parse(raw);
  expect(data.source.kind).toBe("public_steam");
  expect(data.games[0].lifetime_minutes).toBe(125);
  expect(data.games[0]).not.toHaveProperty("installed_on_this_pc");
  expect(data.games[0]).not.toHaveProperty("known_disk_bytes");
  expect(data.games[0]).not.toHaveProperty("local_last_played_unix");
});

test("local CSV export carries real local provenance and device fields", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shelfwear-local-library.csv");

  const raw = await readFile((await download.path())!, "utf8");
  expect(raw.split("\r\n")[0]).toContain("installed_on_this_pc");
  expect(raw).toContain("local_steam_files");
  expect(raw).toContain("Fixture Never Launched");
});

test("library header actions do not overflow a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const panel = page.locator(".library-panel");
  await expect(panel).toBeVisible();

  const overflow = await panel.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();
});
