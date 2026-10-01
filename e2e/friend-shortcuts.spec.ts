import { expect, test, type Page } from "@playwright/test";

const STEAMID = "76561198000000000";
const PREFIX = "https://steamcommunity.com/id/";

async function mockLoadedShelf(page: Page) {
  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: STEAMID,
        gameCount: 2,
        profile: {
          steamid: STEAMID,
          name: "Cozy Player",
          avatar: null,
          profileUrl: "https://steamcommunity.com/id/cozyplayer/",
        },
        games: [
          { appid: "10", name: "Alpha", minutes: 600 },
          { appid: "20", name: "Beta", minutes: 0 },
        ],
      }),
    });
  });
}

async function loadCurrentShelf(page: Page) {
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();
  await expect(page.locator(".steam-identity-name")).toHaveText("Cozy Player");
}

test.beforeEach(async ({ page }) => {
  await mockLoadedShelf(page);
  await page.goto("/");
});

test("a loaded public shelf fills the first open Compare and Party slots", async ({ page }) => {
  await loadCurrentShelf(page);

  await expect(page.getByLabel("First Steam profile")).toHaveValue(STEAMID);
  await expect(page.getByLabel("Second Steam profile")).toHaveValue(PREFIX);
  await expect(page.getByLabel("Party Steam profile 1")).toHaveValue(STEAMID);
  await expect(page.getByLabel("Party Steam profile 2")).toHaveValue(PREFIX);

  const compareShortcut = page.getByLabel("Loaded shelf shortcut for comparison");
  const partyShortcut = page.getByLabel("Loaded shelf shortcut for Party Shelf");
  await expect(compareShortcut).toContainText("Cozy Player");
  await expect(compareShortcut).toContainText("already in slot 1");
  await expect(partyShortcut).toContainText("already in party slot 1");
});

test("existing friend entries are never overwritten when the loaded shelf is inserted", async ({ page }) => {
  await page.getByLabel("First Steam profile").fill("friend-one");
  await page.getByLabel("Party Steam profile 1").fill("friend-one");

  await loadCurrentShelf(page);

  await expect(page.getByLabel("First Steam profile")).toHaveValue("friend-one");
  await expect(page.getByLabel("Second Steam profile")).toHaveValue(STEAMID);
  await expect(page.getByLabel("Party Steam profile 1")).toHaveValue("friend-one");
  await expect(page.getByLabel("Party Steam profile 2")).toHaveValue(STEAMID);

  await expect(page.getByLabel("Loaded shelf shortcut for comparison")).toContainText("already in slot 2");
  await expect(page.getByLabel("Loaded shelf shortcut for Party Shelf")).toContainText("already in party slot 2");
});

test("loaded shelf shortcuts restore a removed current-shelf slot with one click", async ({ page }) => {
  await loadCurrentShelf(page);

  await page.getByLabel("First Steam profile").fill("");
  const compareShortcut = page.getByLabel("Loaded shelf shortcut for comparison");
  await expect(compareShortcut.getByRole("button", { name: "Use loaded shelf" })).toBeVisible();
  await compareShortcut.getByRole("button", { name: "Use loaded shelf" }).click();
  await expect(page.getByLabel("First Steam profile")).toHaveValue(STEAMID);

  await page.getByLabel("Party Steam profile 1").fill("");
  const partyShortcut = page.getByLabel("Loaded shelf shortcut for Party Shelf");
  await expect(partyShortcut.getByRole("button", { name: "Add loaded shelf" })).toBeVisible();
  await partyShortcut.getByRole("button", { name: "Add loaded shelf" }).click();
  await expect(page.getByLabel("Party Steam profile 1")).toHaveValue(STEAMID);
});

test("friend shelf shortcuts stay contained on a phone", async ({ page }) => {
  await loadCurrentShelf(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const compareShortcut = page.getByLabel("Loaded shelf shortcut for comparison");
  const partyShortcut = page.getByLabel("Loaded shelf shortcut for Party Shelf");
  await expect(compareShortcut).toBeVisible();
  await expect(partyShortcut).toBeVisible();

  for (const shortcut of [compareShortcut, partyShortcut]) {
    const overflow = await shortcut.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
});
