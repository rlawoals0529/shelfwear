import { expect, test } from "@playwright/test";

async function seedShelves(page: import("@playwright/test").Page, count = 6) {
  await page.goto("/");
  await page.evaluate((shelfCount) => {
    const shelves = Array.from({ length: shelfCount }, (_, index) => ({
      id: `shelf-${index + 1}`,
      name: `Shelf ${index + 1}`,
      games: index === shelfCount - 1
        ? [{ appid: "70", name: "Last Shelf Game" }]
        : [],
      createdAt: index + 1,
      updatedAt: index + 1,
    }));
    localStorage.setItem("shelfwear:custom-shelves:v1", JSON.stringify(shelves));
  }, count);
  await page.reload();
  await page.getByRole("button", { name: "My shelves" }).click();
}

test("jump switcher appears for larger shelf collections and selects the requested shelf", async ({ page }) => {
  await seedShelves(page);

  const switcher = page.getByLabel("Jump to a custom shelf");
  await expect(switcher).toBeVisible();
  await expect(switcher.locator("option")).toHaveCount(6);

  await switcher.selectOption("shelf-6");

  await expect(page.getByLabel("Rename active shelf")).toHaveValue("Shelf 6");
  await expect(page.locator(".custom-shelf-game")).toContainText("Last Shelf Game");
  await expect(page.locator('.custom-shelf-tabs button[aria-pressed="true"]')).toContainText("Shelf 6");
});

test("active shelf tab is kept inside the horizontally scrollable tab strip", async ({ page }) => {
  await seedShelves(page, 12);
  await page.getByLabel("Jump to a custom shelf").selectOption("shelf-12");

  const layout = await page.locator('.custom-shelf-tabs button[aria-pressed="true"]').evaluate((button) => {
    const tab = button.getBoundingClientRect();
    const strip = button.parentElement!.getBoundingClientRect();
    return {
      tabLeft: tab.left,
      tabRight: tab.right,
      stripLeft: strip.left,
      stripRight: strip.right,
    };
  });

  expect(layout.tabLeft).toBeGreaterThanOrEqual(layout.stripLeft - 1);
  expect(layout.tabRight).toBeLessThanOrEqual(layout.stripRight + 1);
});

test("My Shelves switcher fits cleanly on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedShelves(page);

  const switcher = page.locator(".custom-shelf-switcher");
  await expect(switcher).toBeVisible();
  expect(await switcher.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
