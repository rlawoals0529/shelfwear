import { expect, test } from "@playwright/test";

test("recent activity is on-demand and keeps Steam recent data separate from local recency", async ({ page }) => {
  let recentRequests = 0;

  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: 2,
        profile: {
          steamid: "76561198000000000",
          name: "Recent Player",
          avatar: null,
          profileUrl: null,
        },
        games: [
          { appid: "10", name: "Recent Quest", minutes: 600, iconHash: null },
          { appid: "20", name: "Older Game", minutes: 120, iconHash: null },
        ],
      }),
    });
  });

  await page.route("**/api/steam/recent?*", async (route) => {
    recentRequests++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("steamid")).toBe("76561198000000000");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        totalCount: 2,
        games: [
          {
            appid: "10",
            name: "Recent Quest",
            totalMinutes: 600,
            twoWeekMinutes: 90,
            iconHash: null,
          },
          {
            appid: "20",
            name: "Older Game",
            totalMinutes: 120,
            twoWeekMinutes: null,
            iconHash: null,
          },
        ],
      }),
    });
  });

  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "",
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("recentplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  await expect(page.getByText("Recent Player", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently played" })).toBeVisible();
  expect(recentRequests).toBe(0);

  await page.getByRole("button", { name: "Load recent activity" }).click();
  await expect(page.locator(".recent-ledger")).toBeVisible();
  expect(recentRequests).toBe(1);

  const ledger = page.locator(".recent-ledger");
  await expect(ledger).toContainText("SHELFWEAR / RECENT CHECKOUTS");
  await expect(ledger).toContainText("Recent Quest");
  await expect(ledger).toContainText("10h lifetime");
  await expect(ledger).toContainText("1.5h in the last 2 weeks");
  await expect(ledger).toContainText("Steam did not return a two-week playtime value");
  await expect(page.locator(".recent-boundary")).toContainText("does not turn this into a local last-launch timestamp");

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("recent activity is not offered for local-file mode", async ({ page }) => {
  const fixtures = [
    new URL("./fixtures/localconfig.vdf", import.meta.url).pathname,
    new URL("./fixtures/appmanifest_700.acf", import.meta.url).pathname,
    new URL("./fixtures/appmanifest_900.acf", import.meta.url).pathname,
  ];

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixtures);

  await expect(page.getByRole("heading", { name: "Recently played" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load recent activity" })).toHaveCount(0);
});
