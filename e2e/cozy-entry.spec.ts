import { expect, test } from "@playwright/test";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("starts with an easy vanity URL and fills the demo 3x3 with artwork", async ({ page }) => {
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });

  await page.goto("/");

  const profile = page.getByLabel("Steam username, profile URL, or SteamID");
  await expect(profile).toHaveValue("https://steamcommunity.com/id/");

  const read = page.getByRole("button", { name: "Read public profile" });
  await expect(read).toBeDisabled();

  await profile.fill("https://steamcommunity.com/id/cozyplayer");
  await expect(read).toBeEnabled();

  const covers = page.locator(".nine-tile img");
  await expect(covers).toHaveCount(9);
  await expect(covers.first()).toHaveAttribute("src", "/api/steam/cover/730");
});


test("the cozy layout stays fitted on a phone and keeps portrait game art", async ({ page }) => {
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const panel = await page.locator(".import-panel").boundingBox();
  expect(panel).not.toBeNull();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);

  const tile = await page.locator(".nine-tile").first().boundingBox();
  expect(tile).not.toBeNull();
  expect(tile!.height / tile!.width).toBeGreaterThan(1.45);
  expect(tile!.height / tile!.width).toBeLessThan(1.55);
});


test("cute decoration is aligned and does not add third-party font or icon requests", async ({ page }) => {
  const externalDecorRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/fonts\.googleapis|fonts\.gstatic|unpkg|jsdelivr/i.test(url)) externalDecorRequests.push(url);
  });

  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });

  await page.goto("/");

  await expect(page.locator(".hero-charm")).toBeVisible();
  const titles = page.locator(".section-title");
  expect(await titles.count()).toBeGreaterThanOrEqual(6);

  const firstTitle = titles.first();
  const icon = firstTitle.locator(".section-icon");
  const heading = firstTitle.getByRole("heading");
  const [iconBox, headingBox] = await Promise.all([icon.boundingBox(), heading.boundingBox()]);
  expect(iconBox).not.toBeNull();
  expect(headingBox).not.toBeNull();
  expect(Math.abs(iconBox!.y - headingBox!.y)).toBeLessThan(28);

  await expect(page.getByRole("button", { name: "Read public profile" }).locator(".button-icon")).toBeVisible();
  expect(externalDecorRequests).toEqual([]);
});


test("analytics view is aligned, responsive, and derived from the loaded library", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Analytics" }).click();

  await expect(page.getByRole("heading", { name: "Library analytics" })).toBeVisible();
  await expect(page.locator(".analytics-donut b")).toContainText("%");
  await expect(page.getByText(/of 17 games have recorded playtime/)).toBeVisible();
  await expect(page.getByText("How deep the library goes")).toBeVisible();
  await expect(page.getByText("Where the hours go")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("section icons are vertically centered with their title copy", async ({ page }) => {
  await page.goto("/");
  const title = page.locator(".library-panel .section-title");
  const icon = title.locator(".section-icon");
  const copy = title.locator(".section-title-copy");
  const [iconBox, copyBox] = await Promise.all([icon.boundingBox(), copy.boundingBox()]);

  expect(iconBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  const iconCenter = iconBox!.y + iconBox!.height / 2;
  const copyCenter = copyBox!.y + copyBox!.height / 2;
  expect(Math.abs(iconCenter - copyCenter)).toBeLessThanOrEqual(2);
});


test("stat cards keep values and labels aligned even when captions wrap", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");

  const values = page.locator(".stats-panel .metric-value-row");
  const labels = page.locator(".stats-panel .metric-label");
  await expect(values).toHaveCount(6);
  await expect(labels).toHaveCount(6);
  await expect(page.locator(".stats-panel .metric-unit")).toHaveCount(2);

  const valueBoxes = await values.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { y: rect.y, height: rect.height };
    }),
  );
  const labelBoxes = await labels.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { y: rect.y, height: rect.height };
    }),
  );

  for (const row of [[0, 1, 2], [3, 4, 5]]) {
    const valueBaselines = row.map((index) => valueBoxes[index]!.y + valueBoxes[index]!.height);
    const labelTops = row.map((index) => labelBoxes[index]!.y);
    expect(Math.max(...valueBaselines) - Math.min(...valueBaselines)).toBeLessThanOrEqual(1);
    expect(Math.max(...labelTops) - Math.min(...labelTops)).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const first = await page.locator(".stats-panel .metric-card").nth(0).boundingBox();
  const second = await page.locator(".stats-panel .metric-card").nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(1);
});


test("builds a hand-picked top-games list with Steam art or cute fallbacks", async ({ page }) => {
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "My top games" }).click();
  await expect(page.getByRole("heading", { name: "My top games" })).toBeVisible();

  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByLabel("Optional Steam AppID or store link").fill("1145360");
  await page.getByRole("button", { name: "Add game" }).click();

  await expect(page.locator(".curated-game-tile img")).toHaveCount(1);
  await expect(page.locator(".curated-game-tile img")).toHaveAttribute("src", "/api/steam/cover/1145360");

  await page.getByLabel("Game name to add").fill("A tiny custom game");
  await page.getByRole("button", { name: "Add game" }).click();
  await expect(page.locator(".curated-fallback-letter")).toHaveText("A");
  await expect(page.getByText("2/9 picked")).toBeVisible();

  await page.getByLabel("Move A tiny custom game up").click();
  const names = await page.locator(".curated-list-row > div:nth-child(2) > b").allTextContents();
  expect(names.slice(0, 2)).toEqual(["A tiny custom game", "Hades"]);

  await expect(page.getByRole("button", { name: "Copy share link" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Download 1080×1350 card/ })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test("builds a hand-picked top-games list with Steam art or cute fallbacks", async ({ page }) => {
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "My top games" }).click();
  await expect(page.getByRole("heading", { name: "My top games" })).toBeVisible();

  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByLabel("Optional Steam AppID or store link").fill("1145360");
  await page.getByRole("button", { name: "Add game" }).click();

  await expect(page.locator(".curated-game-tile img")).toHaveCount(1);
  await expect(page.locator(".curated-game-tile img")).toHaveAttribute("src", "/api/steam/cover/1145360");

  await page.getByLabel("Game name to add").fill("A tiny custom game");
  await page.getByRole("button", { name: "Add game" }).click();
  await expect(page.locator(".curated-fallback-letter")).toHaveText("A");
  await expect(page.getByText("2/9 picked")).toBeVisible();

  await page.getByLabel("Move A tiny custom game up").click();
  const names = await page.locator(".curated-list-row > div:nth-child(2) > b").allTextContents();
  expect(names.slice(0, 2)).toEqual(["A tiny custom game", "Hades"]);

  await expect(page.getByRole("button", { name: "Copy share link" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Download 1080×1350 card/ })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
