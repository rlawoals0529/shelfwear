import { expect, test } from "@playwright/test";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function loadPublicShelf(page: import("@playwright/test").Page) {
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  });
  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: 3,
        profile: {
          steamid: "76561198000000000",
          name: "Cozy Player",
          avatar: null,
          profileUrl: "https://steamcommunity.com/id/cozyplayer/",
        },
        games: [
          { appid: "10", name: "Alpha", minutes: 600 },
          { appid: "20", name: "Beta", minutes: 300 },
          { appid: "30", name: "Gamma", minutes: 60 },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();
  await expect(page.getByRole("heading", { name: "Your nine" })).toBeVisible();
}

test("Your Nine header keeps its decoration and actions inside the card", async ({ page }) => {
  await page.setViewportSize({ width: 1112, height: 850 });
  await loadPublicShelf(page);

  const panel = page.locator(".social-panel");
  const doodle = panel.locator(".social-doodle");
  await expect(doodle).toBeVisible();

  const layout = await panel.evaluate((element) => {
    const panelRect = element.getBoundingClientRect();
    const panelStyle = getComputedStyle(element);
    const doodleRect = element.querySelector(".social-doodle")!.getBoundingClientRect();
    const buttons = [...element.querySelectorAll<HTMLButtonElement>(".social-actions button")].map((button) => ({
      whiteSpace: getComputedStyle(button).whiteSpace,
      overflow: button.scrollWidth - button.clientWidth,
      left: button.getBoundingClientRect().left,
      right: button.getBoundingClientRect().right,
    }));

    return {
      panelTop: panelRect.top,
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      paddingTop: parseFloat(panelStyle.paddingTop),
      borderTopWidth: parseFloat(panelStyle.borderTopWidth),
      doodleTop: doodleRect.top,
      doodleLeft: doodleRect.left,
      doodleRight: doodleRect.right,
      buttons,
    };
  });

  expect(layout.paddingTop).toBeGreaterThanOrEqual(20);
  expect(layout.borderTopWidth).toBeGreaterThanOrEqual(1);
  expect(layout.doodleTop).toBeGreaterThanOrEqual(layout.panelTop);
  expect(layout.doodleLeft).toBeGreaterThanOrEqual(layout.panelLeft);
  expect(layout.doodleRight).toBeLessThanOrEqual(layout.panelRight);

  expect(layout.buttons).toHaveLength(3);
  for (const button of layout.buttons) {
    expect(button.whiteSpace).toBe("nowrap");
    expect(button.overflow).toBeLessThanOrEqual(1);
    expect(button.left).toBeGreaterThanOrEqual(layout.panelLeft);
    expect(button.right).toBeLessThanOrEqual(layout.panelRight);
  }

  await expect(page.getByRole("button", { name: "Download card" })).toHaveClass(/primary/);
});

test("Your Nine actions stack cleanly on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadPublicShelf(page);

  const panel = page.locator(".social-panel");
  const actions = panel.locator(".social-actions button");
  await expect(actions).toHaveCount(3);

  const boxes = await actions.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { x: box.x, width: box.width, right: box.right };
    }),
  );

  expect(Math.max(...boxes.map((box) => box.x)) - Math.min(...boxes.map((box) => box.x))).toBeLessThanOrEqual(1);
  expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThanOrEqual(1);
  expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(390);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
