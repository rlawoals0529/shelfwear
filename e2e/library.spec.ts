import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const F = (n: string) => fileURLToPath(new URL(join("fixtures", n), import.meta.url));
const ALL = ["localconfig.vdf", "appmanifest_700.acf", "appmanifest_900.acf"].map(F);

/** A headline figure, found by its label rather than by its value. */
const metric = (page: import("@playwright/test").Page, label: string) =>
  page.locator(".metric").filter({ hasText: label }).locator("b");

/** A row in the full list, which is where a game's own name is the exact text. */
const row = (page: import("@playwright/test").Page, name: string) =>
  page.locator(".row").filter({ has: page.locator(".name", { hasText: name }) });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows a real library before you have given it anything", async ({ page }) => {
  // A page whose first paint is an empty drop zone teaches nothing. The sample has to be
  // labelled as a sample, though, or it reads as the visitor's own data.
  await expect(page.getByRole("heading", { name: "shelfwear" })).toBeVisible();
  await expect(page.getByText("Reading the sample library.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The shelf" })).toBeVisible();
  await expect(page.getByText("nothing is fetched")).toBeVisible();
});

test("reads dropped Steam files, tabs and inconsistent capitalisation included", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);

  await expect(page.getByText("3 files")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything (3)" })).toBeVisible();

  // The fixture writes "Apps" and both "playTime" and "playtime". Steam does all three,
  // and a reader that only handles one reports an empty library on half the machines.
  await expect(row(page, "Fixture Alpha")).toBeVisible();
  await expect(row(page, "Fixture Never Launched")).toBeVisible();

  // 6000 + 30 minutes = 100.5 hours. Reading the label rather than hunting for the
  // number means this cannot pass by matching some other figure that happens to agree.
  await expect(metric(page, "hours played")).toHaveText("100.5");
  await expect(metric(page, "games here")).toHaveText("3");
});

test("a game with no manifest is a row, not a hole", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  // App 800 has playtime and no manifest: played, then uninstalled. It still happened.
  const uninstalled = page.locator(".row").filter({ hasText: "app 800" });
  await expect(uninstalled).toBeVisible();
  await expect(uninstalled).toContainText("not installed");
  await expect(uninstalled).toContainText("0.5h");
});

test("never launched is counted, and its disk is counted separately", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  // 900 is installed at 50 GB and has never been launched. Separating that from the
  // 60 GB total is the number the whole page exists to show.
  await expect(metric(page, "never launched")).toHaveText("1");
  // One decimal, because the headline figures count up to their value and hold their
  // width while they do it. Same numbers, written the way the page writes them.
  await expect(metric(page, "installed")).toHaveText("60.0 GB");
  await expect(metric(page, "held by unplayed")).toHaveText("50.0 GB");
});

test("a file that is not a manifest is reported, not silently dropped", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles([...ALL, F("notes.txt")]);
  await expect(page.getByText("1 file skipped: not a manifest.")).toBeVisible();
  // And the real files still loaded.
  await expect(page.getByRole("heading", { name: "Everything (3)" })).toBeVisible();
});

test("files with nothing in them say so instead of rendering an empty library", async ({ page }) => {
  // Zero games drawn as a result looks exactly like a true answer.
  await page.locator('input[type="file"]').setInputFiles(F("notes.txt"));
  await expect(page.locator(".err")).toContainText("No games in those files");
  await expect(page.getByRole("heading", { name: "Everything (3)" })).toBeHidden();
});

test("you can get back to the sample after loading your own", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(ALL);
  await expect(page.getByText("3 files")).toBeVisible();
  await page.getByRole("button", { name: "Back to the sample" }).click();
  await expect(page.getByText("Reading the sample library.")).toBeVisible();
});

test("the counts are described as a floor, because they are", async ({ page }) => {
  // localconfig only knows apps this client has touched. Presenting that as "your library"
  // would be the single most misleading thing this page could do.
  await expect(page.getByText(/treat every count here as a floor/)).toBeVisible();
  await expect(page.getByText(/not the same as everything you own/)).toBeVisible();
});

test("the games you never launched are the first shelf, and it says what they cost", async ({ page }) => {
  const shelves = page.locator(".shelf");
  // Untouched first, because they are the point. A run sorted by size with the untouched
  // scattered through it says nothing at a glance.
  await expect(shelves.first().locator(".shelf-label")).toContainText(/never launched, holding [\d.]+ GB/);
  await expect(shelves.nth(1).locator(".shelf-label")).toContainText(/played$/);

  // Every spine on the first shelf is one that has never run, and none on the second is.
  const first = shelves.first().locator(".spine");
  expect(await first.count()).toBeGreaterThan(0);
  expect(await first.evaluateAll((els) => els.every((e) => e.classList.contains("worn")))).toBe(true);
  expect(
    await shelves.nth(1).locator(".spine").evaluateAll((els) => els.every((e) => !e.classList.contains("worn"))),
  ).toBe(true);
});

test("a spine is as wide as the game is big", async ({ page }) => {
  const spines = page.locator(".shelf").first().locator(".spine");
  const seen = await spines.evaluateAll((els) =>
    els.map((e) => ({
      width: Math.round(e.getBoundingClientRect().width),
      gb: Number(e.querySelector(".spine-size")!.textContent),
    })),
  );

  expect(seen.length).toBeGreaterThan(2);
  // Sorted biggest first, and width has to fall with it or the picture is decoration.
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i]!.gb, `${seen[i]!.gb} GB after ${seen[i - 1]!.gb} GB`).toBeLessThanOrEqual(seen[i - 1]!.gb);
    expect(seen[i]!.width).toBeLessThanOrEqual(seen[i - 1]!.width);
  }
  // And a real difference in size is a visible difference in width.
  expect(seen[0]!.width).toBeGreaterThan(seen[seen.length - 1]!.width);
});

test("every row of spines stands on a plank, even once the shelf wraps", async ({ page }) => {
  // Narrow enough that the first shelf has to wrap. A border under the run draws one line at
  // the foot of the box, so the moment it wrapped the top row was standing on nothing.
  await page.setViewportSize({ width: 390, height: 1000 });
  // The spines arrive with a 6px rise. Measuring through it reads every foot up to 6px off
  // its own plank, which is a failure about the entrance rather than about the layout.
  const settled = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const measure = async () => {
    await settled();
    return page.locator(".shelf").first().locator(".shelf-run").evaluate((run) => {
      const box = run.getBoundingClientRect();
      const cs = getComputedStyle(run);
      const spineH = parseFloat(cs.getPropertyValue("--spine-h"));
      const pitch = spineH + parseFloat(cs.getPropertyValue("--row-gap"));
      const feet = [...run.querySelectorAll(".spine")].map((e) => Math.round(e.getBoundingClientRect().bottom - box.top));

      /*
       * Where the plank is PAINTED, read off the computed background.
       *
       * The first version of this test compared the feet against the row pitch, which is a
       * property of the layout and not of the plank at all: it passed unchanged after the
       * repeating background was swapped back for the single border that caused the bug.
       * The stops are the only place the paint can be read without sampling pixels.
       */
      const stops = [...cs.backgroundImage.matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]));
      return {
        rows: new Set(feet).size,
        feet,
        spineH,
        pitch,
        repeats: cs.backgroundImage.startsWith("repeating-linear-gradient"),
        // The band repeats at the row pitch, and the line inside it starts at the spine's foot.
        period: stops.length ? Math.max(...stops) : null,
        plankAt: stops.length ? stops.find((s) => s > 0) ?? null : null,
      };
    });
  };

  // Polled, not slept on: a resize does not reflow before the next evaluate, and a fixed
  // wait is a guess that passes on this machine and flakes on a slower one.
  await expect.poll(async () => (await measure()).rows, {
    message: "the shelf never wrapped, so this proves nothing",
  }).toBeGreaterThan(1);
  const seen = await measure();

  // The plank repeats, at the row pitch, with its line at the spines' feet. A border-bottom
  // draws one line at the foot of the whole box, so the moment the run wrapped the top row
  // was standing on nothing - and that is what this has to be able to tell apart.
  expect(seen.repeats, "the plank is not a repeating one, so only the last row has one").toBe(true);
  expect(seen.period).toBe(seen.pitch);
  expect(seen.plankAt).toBe(seen.spineH);

  // And every row of spines really does land on one of those lines.
  expect(seen.feet.every((f) => Math.abs((f - seen.spineH) % seen.pitch) < 1.5)).toBe(true);
});
