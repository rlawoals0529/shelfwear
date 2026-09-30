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
