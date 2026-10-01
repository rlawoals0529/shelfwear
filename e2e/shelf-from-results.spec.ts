import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("makes a browser-local shelf from the current Shelf Index results", async ({ page }) => {
  await page.getByLabel("Search games in the whole shelf").fill("hades");
  await expect(page.locator(".library-rows .library-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Make shelf" }).click();
  await page.getByLabel("Name for shelf from current results").fill("Hades shortlist");
  await page.getByRole("button", { name: "File 1 game" }).click();

  await expect(page.locator(".library-shelf-status")).toContainText("Filed 1 current result into “Hades shortlist”");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shelfwear:custom-shelves:v1") ?? "[]")
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].name).toBe("Hades shortlist");
  expect(saved[0].games).toHaveLength(1);
  expect(saved[0].games[0].name).toBe("Hades");
  expect(saved[0].games[0]).not.toHaveProperty("minutes");
  expect(saved[0].games[0]).not.toHaveProperty("bytes");
  expect(saved[0].games[0]).not.toHaveProperty("installed");
  expect(saved[0].games[0]).not.toHaveProperty("lastPlayed");

  await page.getByRole("button", { name: "Open in My shelves" }).click();
  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Hades shortlist");
  await expect(page.locator(".custom-shelf-game")).toContainText("Hades");
});

test("caps a shelf made from results at the documented 50-game shelf limit", async ({ page }) => {
  const games = Array.from({ length: 55 }, (_, index) => ({
    appid: String(1000 + index),
    name: `Public Game ${String(index + 1).padStart(2, "0")}`,
    minutes: (55 - index) * 60,
  }));

  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: games.length,
        profile: {
          steamid: "76561198000000000",
          name: "Big Library",
          avatar: null,
          profileUrl: null,
        },
        games,
      }),
    });
  });

  await page.getByLabel("Steam username, profile URL, or SteamID").fill("biglibrary");
  await page.getByRole("button", { name: "Read public profile" }).click();
  await expect(page.locator(".library-result-count")).toContainText("55");

  await page.getByRole("button", { name: "Make shelf" }).click();
  await page.getByLabel("Name for shelf from current results").fill("Current results");
  await page.getByRole("button", { name: "File 50 games" }).click();

  await expect(page.locator(".library-shelf-status")).toContainText("first 50 of 55 current results");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shelfwear:custom-shelves:v1") ?? "[]")
  );
  expect(saved[0].games).toHaveLength(50);
  expect(saved[0].games[0].name).toBe("Public Game 01");
  expect(saved[0].games[49].name).toBe("Public Game 50");
});

test("shelf-from-results composer fits on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Make shelf" }).click();

  const composer = page.locator(".library-shelf-composer");
  await expect(composer).toBeVisible();
  expect(await composer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await expect(page.getByLabel("Name for shelf from current results")).toBeVisible();
  await expect(page.getByRole("button", { name: /File \d+ games?/ })).toBeVisible();
});
