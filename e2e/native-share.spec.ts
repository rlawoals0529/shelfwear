import { expect, test } from "@playwright/test";

test("Share shelf uses the browser share sheet when available", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shelfwearNativeShares: ShareData[] }).__shelfwearNativeShares = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shelfwearNativeShares: ShareData[] }).__shelfwearNativeShares.push(data);
      },
    });
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
          name: "Cozy Player",
          avatar: null,
          profileUrl: null,
        },
        games: [{ appid: "10", name: "Shared Quest", minutes: 120 }],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const share = page.getByRole("button", { name: "Share shelf" });
  await share.click();
  await expect(page.getByRole("button", { name: "Shared" })).toBeVisible();

  const payloads = await page.evaluate(() =>
    (window as unknown as { __shelfwearNativeShares: ShareData[] }).__shelfwearNativeShares,
  );
  expect(payloads).toHaveLength(1);
  expect(payloads[0]?.title).toBe("Cozy Player · Shelfwear");
  expect(payloads[0]?.text).toBe("See this public Steam shelf on Shelfwear.");
  expect(payloads[0]?.url).toContain("?steam=76561198000000000");
  expect(payloads[0]?.url).toContain("#steam");
});

test("cancelling the native share sheet keeps Share shelf idle", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    });
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
          name: "Cozy Player",
          avatar: null,
          profileUrl: null,
        },
        games: [{ appid: "10", name: "Shared Quest", minutes: 120 }],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  await page.getByRole("button", { name: "Share shelf" }).click();
  await expect(page.getByRole("button", { name: "Share shelf" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Shared" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Link copied" })).toHaveCount(0);
});
