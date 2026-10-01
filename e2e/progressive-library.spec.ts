import { expect, test } from "@playwright/test";

test("large libraries render progressively and reset the window when browsing changes", async ({ page }) => {
  const games = Array.from({ length: 260 }, (_, index) => ({
    appid: String(1000 + index),
    name: `Game ${String(index + 1).padStart(3, "0")}`,
    minutes: (260 - index) * 10,
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

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("biglibrary");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const rows = page.locator(".library-rows .library-row");
  await expect(page.getByRole("heading", { name: "Everything (260)" })).toBeVisible();
  await expect(rows).toHaveCount(100);
  await expect(page.locator(".library-result-count")).toContainText("showing 100 of 260 matches");
  await expect(page.getByRole("button", { name: "Show 100 more" })).toBeVisible();

  await page.getByRole("button", { name: "Show 100 more" }).click();
  await expect(rows).toHaveCount(200);
  await expect(page.locator(".library-show-more")).toContainText("200 shown · 60 more matching");
  await expect(page.getByRole("button", { name: "Show 60 more" })).toBeVisible();

  await page.getByRole("button", { name: "Show 60 more" }).click();
  await expect(rows).toHaveCount(260);
  await expect(page.locator(".library-show-more")).toHaveCount(0);

  await page.getByLabel("Search games in the whole shelf").fill("Game 250");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Game 250");
  await expect(page.locator(".library-result-count")).toContainText("showing 1 of 260");

  await page.getByLabel("Search games in the whole shelf").fill("");
  await expect(rows).toHaveCount(100);
  await expect(page.getByRole("button", { name: "Show 100 more" })).toBeVisible();
});

test("progressive library controls stay inside a phone viewport", async ({ page }) => {
  const games = Array.from({ length: 120 }, (_, index) => ({
    appid: String(2000 + index),
    name: `Phone Game ${index + 1}`,
    minutes: index,
  }));

  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000001",
        gameCount: games.length,
        profile: {
          steamid: "76561198000000001",
          name: "Phone Library",
          avatar: null,
          profileUrl: null,
        },
        games,
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("phonelibrary");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const more = page.locator(".library-show-more");
  await expect(more).toBeVisible();
  expect(await more.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
