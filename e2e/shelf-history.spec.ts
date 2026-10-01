import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const STEAMID = "76561198000000000";
const HISTORY_KEY = `shelfwear:shelf-history:v1:${STEAMID}`;

test("Shelf History starts from an opt-in baseline and records only later observable changes", async ({ page }) => {
  let phase = 1;

  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __milestoneFillText: string[] }).__milestoneFillText = seen;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      seen.push(String(args[0]));
      return original.apply(this, args as Parameters<CanvasRenderingContext2D["fillText"]>);
    };
  });

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
  await expect(history.locator(".history-events")).toContainText("Deep Game");
  await expect(history.locator(".history-snapshot")).toHaveCount(2);
  const overview = history.locator(".history-observation-overview");
  await expect(overview).toContainText("Since history began");
  await expect(overview).toContainText("+2.3h");
  await expect(overview).toContainText("+1 game");
  await expect(overview).toContainText("+2 played");
  await expect(overview.locator(".history-observation-dot")).toHaveCount(2);
  await expect(overview).toContainText("Lines only connect observations");
  await expect(history.locator(".history-milestone-row")).toContainText("9.8h → 10.2h · crossed 10h");

  const milestoneDownload = page.waitForEvent("download");
  await history.getByRole("button", { name: "Download 10h slip" }).click();
  const milestone = await milestoneDownload;
  expect(milestone.suggestedFilename()).toBe("shelfwear-deep-game-10h-milestone.png");

  const milestonePath = await milestone.path();
  expect(milestonePath).not.toBeNull();
  const milestoneBytes = await readFile(milestonePath!);
  expect(milestoneBytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(milestoneBytes.readUInt32BE(16)).toBe(1080);
  expect(milestoneBytes.readUInt32BE(20)).toBe(1350);

  const drawn = await page.evaluate(() =>
    (window as unknown as { __milestoneFillText: string[] }).__milestoneFillText,
  );
  expect(drawn).toContain("SHELFWEAR / MILESTONE SLIP");
  expect(drawn).toContain("Deep Game");
  expect(drawn).toContain("10H");
  expect(drawn).toContain("PREVIOUS SAVED TOTAL");
  expect(drawn).toContain("9.8h");
  expect(drawn).toContain("CURRENT SAVED TOTAL");
  expect(drawn).toContain("10.2h");
  expect(drawn).toContain("MILESTONE OBSERVED");
  expect(drawn).toContain("Not a Steam event timestamp.");

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
  expect(await page.evaluate((key) => localStorage.getItem(key), HISTORY_KEY)).toBeNull();
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
