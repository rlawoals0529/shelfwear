import { expect, test } from "@playwright/test";

const STEAMID = "76561198000000000";
const HISTORY_KEY = `shelfwear:shelf-history:v1:${STEAMID}`;

test("Shelf History starts from an opt-in baseline and records only later observable changes", async ({ page }) => {
  let phase = 1;

  await page.route("**/api/steam/library?*", async (route) => {
    const games = phase === 1
      ? [
          { appid: "10", name: "Deep Game", minutes: 590, iconHash: null },
          { appid: "20", name: "New Start", minutes: 0, iconHash: null },
          { appid: "30", name: "Stable Game", minutes: 60, iconHash: null },
        ]
      : [
          { appid: "10", name: "Deep Game", minutes: 610, iconHash: null },
          { appid: "20", name: "New Start", minutes: 30, iconHash: null },
          { appid: "30", name: "Stable Game", minutes: 60, iconHash: null },
          { appid: "40", name: "New Arrival", minutes: 90, iconHash: null },
        ];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: STEAMID,
        gameCount: games.length,
        profile: {
          steamid: STEAMID,
          name: "History Player",
          avatar: null,
          profileUrl: null,
        },
        games,
      }),
    });
  });

  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({ status: 404, contentType: "text/plain", body: "" });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("historyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  await expect(page.getByRole("heading", { name: "Shelf history" })).toBeVisible();
  await expect(page.getByText("No saved baseline yet.")).toBeVisible();

  await page.getByRole("button", { name: "Start history on this browser" }).click();
  await expect(page.locator(".history-ledger")).toBeVisible();
  await expect(page.locator(".history-baseline")).toContainText("Baseline saved");
  await expect(page.locator(".history-snapshot")).toHaveCount(1);

  const rawBaseline = await page.evaluate((key) => localStorage.getItem(key), HISTORY_KEY);
  expect(rawBaseline).toContain('"10",590');
  expect(rawBaseline).not.toContain("Deep Game");
  expect(rawBaseline).not.toContain("History Player");

  phase = 2;
  await page.getByRole("button", { name: "Read public profile" }).click();

  const history = page.locator(".history-ledger");
  await expect(history).toContainText("2 SAVED STATES");
  await expect(history.locator(".history-delta-metrics")).toContainText("+2.3h");
  await expect(history.locator(".history-delta-metrics")).toContainText("+1");
  await expect(history.locator(".history-delta-metrics")).toContainText("2");
  await expect(history.locator(".history-events")).toContainText("New Arrival");
  await expect(history.locator(".history-events")).toContainText("New Start");
  await expect(history.locator(".history-events")).toContainText("Deep Game · 10h");
  await expect(history.locator(".history-snapshot")).toHaveCount(2);

  await page.reload();
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("historyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  await expect(page.locator(".history-ledger")).toContainText("2 SAVED STATES");
  await expect(page.locator(".history-no-change")).toContainText("No recorded library or lifetime-playtime changes");

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Clear local history" }).click();
  await expect(page.getByRole("button", { name: "Start history on this browser" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), HISTORY_KEY).toBeNull();
});

test("Shelf History is not offered for local-file mode", async ({ page }) => {
  const fixtures = [
    new URL("./fixtures/localconfig.vdf", import.meta.url).pathname,
    new URL("./fixtures/appmanifest_700.acf", import.meta.url).pathname,
    new URL("./fixtures/appmanifest_900.acf", import.meta.url).pathname,
  ];

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixtures);

  await expect(page.getByRole("heading", { name: "Shelf history" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start history on this browser" })).toHaveCount(0);
});
