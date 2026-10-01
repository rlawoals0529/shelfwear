import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const ALL = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Shelf map links only to sections that exist in the sample", async ({ page }) => {
  const map = page.getByRole("navigation", { name: "Jump around this shelf" });
  await expect(map).toBeVisible();
  await expect(map.getByRole("link", { name: "Recent" })).toHaveCount(0);
  await expect(map.getByRole("link", { name: "History" })).toHaveCount(0);

  const links = await map.locator(".shelf-map-link").evaluateAll((elements) =>
    elements.map((element) => ({
      href: (element as HTMLAnchorElement).getAttribute("href"),
      label: element.textContent,
    })),
  );

  expect(links.length).toBeGreaterThanOrEqual(7);
  for (const link of links) {
    expect(link.href).toMatch(/^#[a-z0-9-]+$/);
    const exists = await page.locator(link.href!).count();
    expect(exists, `missing target for ${link.label}`).toBe(1);
  }
});

test("Shelf map exposes public-Steam-only history and recent sections after import", async ({ page }) => {
  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: 2,
        profile: {
          steamid: "76561198000000000",
          name: "Cozy Player",
          avatar: null,
          profileUrl: null,
        },
        games: [
          { appid: "10", name: "Alpha", minutes: 600 },
          { appid: "20", name: "Beta", minutes: 0 },
        ],
      }),
    });
  });

  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const map = page.getByRole("navigation", { name: "Jump around this shelf" });
  await expect(map.getByRole("link", { name: "Recent" })).toHaveAttribute("href", "#recent");
  await expect(map.getByRole("link", { name: "History" })).toHaveAttribute("href", "#history");
  await expect(page.locator("#recent")).toHaveCount(1);
  await expect(page.locator("#history")).toHaveCount(1);
});

test("Shelf map jumps to the library without hiding it under the sticky strip", async ({ page }) => {
  const map = page.getByRole("navigation", { name: "Jump around this shelf" });
  await map.getByRole("link", { name: "Library" }).click();

  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#library");
  const target = page.locator("#library");
  await expect(target).toBeVisible();

  const layout = await page.evaluate(() => {
    const mapRect = document.querySelector(".shelf-map-nav")!.getBoundingClientRect();
    const targetRect = document.querySelector("#library")!.getBoundingClientRect();
    return {
      mapBottom: mapRect.bottom,
      targetTop: targetRect.top,
    };
  });

  expect(layout.targetTop).toBeGreaterThanOrEqual(layout.mapBottom - 2);
});

test("phone navigation uses a 2x2 view switch and contains Shelf map scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const tabs = page.locator(".view-tabs button");
  await expect(tabs).toHaveCount(4);
  const tabBoxes = await tabs.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, right: rect.right };
    }),
  );

  expect(Math.abs(tabBoxes[0]!.y - tabBoxes[1]!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(tabBoxes[2]!.y - tabBoxes[3]!.y)).toBeLessThanOrEqual(1);
  expect(tabBoxes[2]!.y).toBeGreaterThan(tabBoxes[0]!.y);
  expect(Math.max(...tabBoxes.map((box) => box.right))).toBeLessThanOrEqual(390);

  const map = page.locator(".shelf-map-nav");
  const track = map.locator(".shelf-map-track");
  await expect(map).toBeVisible();

  const metrics = await track.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(metrics.scroll).toBeGreaterThan(metrics.client);

  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
});

test("local mode adds the literal disk-shelf jump target", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  const map = page.getByRole("navigation", { name: "Jump around this shelf" });
  await expect(map.getByRole("link", { name: "Disk shelf" })).toHaveAttribute("href", "#disk-shelf");
  await expect(page.locator("#disk-shelf")).toBeVisible();
});
