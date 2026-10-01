import { expect, test } from "@playwright/test";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("accepts a short Steam vanity name and shows the connected profile", async ({ page }) => {
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });
  let requestedProfile = "";
  await page.route("**/api/steam/library?*", async (route) => {
    requestedProfile = new URL(route.request().url()).searchParams.get("profile") ?? "";
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
          profileUrl: "https://steamcommunity.com/id/rlawoals/",
        },
        games: [{ appid: "730", name: "Counter-Strike 2", minutes: 60 }],
      }),
    });
  });

  await page.goto("/");

  const profile = page.getByLabel("Steam username, profile URL, or SteamID");
  await expect(profile).toHaveValue("");
  await expect(page.locator(".steam-profile-prefix")).toHaveText("steamcommunity.com/id/");

  const read = page.getByRole("button", { name: "Read public profile" });
  await expect(read).toBeDisabled();

  await profile.fill("rlawoals");
  await expect(read).toBeEnabled();
  await read.click();

  expect(requestedProfile).toBe("https://steamcommunity.com/id/rlawoals");
  await expect(page.locator(".import-profile-preview")).toContainText("Cozy Player");
  await expect(page.locator(".import-profile-preview")).toContainText("76561198000000000");

  const covers = page.locator(".nine-tile img");
  await expect(covers).toHaveCount(1);
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
  await expect(page.locator(".analytics-catalog-meta")).toContainText("SHELFWEAR / READING ROOM");
  await expect(page.locator(".analytics-catalog-meta")).toContainText("DEMO SHELF");
  await expect(page.locator(".analytics-donut b")).toContainText("%");
  await expect(page.getByText(/of 17 games have recorded playtime/)).toBeVisible();
  await expect(page.getByText("How deep the library goes")).toBeVisible();
  await expect(page.getByText("Where the hours go")).toBeVisible();
  await expect(page.locator(".analytics-kpi > i")).toHaveText(["01", "02", "03", "04"]);
  await expect(page.locator(".analytics-section-code")).toHaveText(["SHELF DEPTH / 01", "HOUR LEDGER / 02", "LOCAL INSERT / 03"]);

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


test("builds a hand-picked Shelf Story with Steam art or cute fallbacks", async ({ page }) => {
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Shelf stories" }).click();
  await expect(page.getByRole("heading", { name: "Shelf stories", exact: true })).toBeVisible();

  await page.getByLabel("Game name to add").fill("Hades");
  await page.getByLabel("Optional Steam AppID or store link").fill("1145360");
  await page.getByRole("button", { name: "Add game", exact: true }).click();

  await expect(page.locator(".curated-game-tile img")).toHaveCount(1);
  await expect(page.locator(".curated-game-tile img")).toHaveAttribute("src", "/api/steam/cover/1145360");

  await page.getByLabel("Game name to add").fill("A tiny custom game");
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await expect(page.locator(".curated-fallback-letter")).toHaveText("A");
  await expect(page.getByText("2/9 picked")).toBeVisible();

  await page.getByLabel("Move A tiny custom game up").click();
  const names = await page.locator(".curated-list-row > div:nth-child(2) > b").allTextContents();
  expect(names.slice(0, 2)).toEqual(["A tiny custom game", "Hades"]);

  await expect(page.getByRole("button", { name: "Copy story link" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Download 1080×1350 card/ })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test("Steam profile entry stays aligned on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");

  const control = page.locator(".steam-profile-control");
  const button = page.getByRole("button", { name: "Read public profile" });
  const [controlBox, buttonBox] = await Promise.all([control.boundingBox(), button.boundingBox()]);
  expect(controlBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(Math.abs((controlBox!.y + controlBox!.height) - (buttonBox!.y + buttonBox!.height))).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const mobileControl = await control.boundingBox();
  const mobileButton = await button.boundingBox();
  expect(mobileControl).not.toBeNull();
  expect(mobileButton).not.toBeNull();
  expect(mobileButton!.y).toBeGreaterThan(mobileControl!.y + mobileControl!.height - 2);
});

test("long Steam names truncate cleanly and the main view buttons stay aligned", async ({ page }) => {
  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: 1,
        profile: {
          steamid: "76561198000000000",
          name: "a-ridiculously-long-steam-display-name-that-should-never-break-the-header-layout",
          avatar: null,
          profileUrl: "https://steamcommunity.com/id/cozyplayer/",
        },
        games: [{ appid: "730", name: "Counter-Strike 2", minutes: 60, iconHash: null }],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByLabel("Steam username, profile URL, or SteamID")).toHaveAttribute("placeholder", "cozyplayer");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const identity = page.locator(".steam-identity");
  await expect(identity).toBeVisible();
  const overflow = await identity.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const name = identity.locator(".steam-identity-name");
  await expect(identity).toHaveAttribute("title", /ridiculously-long/);
  const nameMetrics = await name.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
    overflow: getComputedStyle(element).textOverflow,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }));
  expect(nameMetrics.scroll).toBeGreaterThanOrEqual(nameMetrics.client);
  expect(nameMetrics.overflow).toBe("ellipsis");
  expect(nameMetrics.whiteSpace).toBe("nowrap");

  const tabs = page.locator(".view-tabs button");
  await expect(tabs).toHaveCount(4);
  const boxes = await tabs.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { y: rect.y, width: rect.width, height: rect.height };
  }));
  expect(Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y))).toBeLessThanOrEqual(1);
  expect(Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height))).toBeLessThanOrEqual(1);
  expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThanOrEqual(1);
});


test("fill from playtime preserves Steam icon fallbacks and styles them as badges", async ({ page }) => {
  const iconHash = "8c7fc95092f64b0a99c4e02263caf254da89b7bb";
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
          profileUrl: "https://steamcommunity.com/id/cozyplayer/",
        },
        games: [{
          appid: "3681810",
          name: "Blue Protocol: Star Resonance",
          minutes: 60000,
          iconHash,
        }],
      }),
    });
  });
  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("cozyplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();
  await page.getByRole("button", { name: "Shelf stories" }).click();
  await page.getByRole("button", { name: "Fill from playtime" }).click();

  const art = page.locator(".curated-game-tile img").first();
  await expect(art).toHaveAttribute("src", new RegExp(`/api/steam/cover/3681810\\?icon=${iconHash}`));
  await expect(art).toHaveAttribute("data-fallback", "icon");
  await expect(page.locator(".curated-list-row")).toContainText("Steam art · app 3681810");
});


test("copies a stateless invite from a loaded public shelf", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/steam/library?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: "76561198000000000",
        gameCount: 1,
        profile: {
          steamid: "76561198000000000",
          name: "Invite Player",
          avatar: null,
          profileUrl: null,
        },
        games: [{ appid: "10", name: "Shared Quest", minutes: 120 }],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Steam username, profile URL, or SteamID").fill("inviteplayer");
  await page.getByRole("button", { name: "Read public profile" }).click();

  const invite = page.getByRole("button", { name: "Copy link" });
  await expect(invite).toBeVisible();
  await invite.click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("?invite=76561198000000000");
  expect(copied).toContain("#compare");
  expect(copied).not.toContain("compare=");
  expect(copied).not.toContain("Shared%20Quest");

  await page.getByRole("button", { name: "Copy invite message" }).click();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toBe(`Compare our Steam shelves on Shelfwear: ${copied}`);
});


test("an invite fills the friend side and only asks the recipient for their profile", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/steam/library?*", async (route) => {
    const profile = new URL(route.request().url()).searchParams.get("profile") ?? "";
    requested.push(profile);
    const inviter = profile === "76561198000000000";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: inviter ? "76561198000000000" : "76561198000000001",
        gameCount: 2,
        profile: {
          steamid: inviter ? "76561198000000000" : "76561198000000001",
          name: inviter ? "Invite Player" : "Friend Player",
          avatar: null,
          profileUrl: null,
        },
        games: [
          { appid: "10", name: "Shared Quest", minutes: inviter ? 600 : 300 },
          { appid: inviter ? "20" : "30", name: inviter ? "Invite Only" : "Friend Only", minutes: 60 },
        ],
      }),
    });
  });

  await page.goto("/?invite=76561198000000000#compare");

  await expect(page.getByRole("heading", { name: /left one side of the shelf open/i })).toBeVisible();
  await expect(page.locator(".invite-steps")).toContainText("their shelf");
  await expect(page.locator(".invite-steps")).toContainText("add yours");
  await expect(page.locator(".invite-steps")).toContainText("compare");

  const inviter = page.getByLabel("Inviter Steam profile");
  await expect(inviter).toHaveValue("76561198000000000");
  await expect(inviter).toHaveAttribute("readonly", "");

  const recipient = page.getByLabel("Your Steam profile for comparison");
  await recipient.fill("friendplayer");

  const compare = page.getByRole("button", { name: "Compare with friend" });
  await expect(compare).toBeEnabled();
  await compare.click();

  const result = page.locator(".comparison-result");
  await expect(result).toContainText("Invite Player");
  await expect(result).toContainText("Friend Player");
  await expect(result).toContainText("Shared Quest");
  await expect(result.locator(".compare-bookplate-kicker")).toContainText("SHELFWEAR LIBRARY CARD");
  expect(requested).toContain("76561198000000000");
  expect(requested).toContain("https://steamcommunity.com/id/friendplayer");

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test("Party Shelf compares 3–5 public libraries and draws only from games everyone owns", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const requested: string[] = [];

  await page.route("**/api/steam/library?*", async (route) => {
    const profile = new URL(route.request().url()).searchParams.get("profile") ?? "";
    requested.push(profile);
    const key = profile.includes("alpha") ? "alpha" : profile.includes("beta") ? "beta" : "gamma";
    const data = key === "alpha"
      ? {
          steamid: "76561198000000001",
          name: "Alpha",
          games: [
            { appid: "10", name: "Everyone Game", minutes: 600 },
            { appid: "11", name: "Handoff Game", minutes: 300 },
            { appid: "12", name: "Two of Three", minutes: 80 },
            { appid: "20", name: "Alpha Only", minutes: 40 },
          ],
        }
      : key === "beta"
        ? {
            steamid: "76561198000000002",
            name: "Beta",
            games: [
              { appid: "10", name: "Everyone Game", minutes: 500 },
              { appid: "11", name: "Handoff Game", minutes: 0 },
              { appid: "12", name: "Two of Three", minutes: 60 },
              { appid: "30", name: "Beta Only", minutes: 40 },
            ],
          }
        : {
            steamid: "76561198000000003",
            name: "Gamma",
            games: [
              { appid: "10", name: "Everyone Game", minutes: 400 },
              { appid: "11", name: "Handoff Game", minutes: 180 },
              { appid: "40", name: "Gamma Only", minutes: 40 },
            ],
          };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamid: data.steamid,
        gameCount: data.games.length,
        profile: { steamid: data.steamid, name: data.name, avatar: null, profileUrl: null },
        games: data.games,
      }),
    });
  });

  await page.route("**/api/steam/cover/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });

  await page.goto("/");
  await page.getByLabel("Party Steam profile 1").fill("alpha");
  await page.getByLabel("Party Steam profile 2").fill("beta");
  await page.getByLabel("Party Steam profile 3").fill("gamma");
  await page.getByRole("button", { name: "Build Party Shelf" }).click();

  const party = page.locator(".party-result");
  await expect(party).toBeVisible();
  await expect(party).toContainText("Alpha");
  await expect(party).toContainText("Beta");
  await expect(party).toContainText("Gamma");
  await expect(party.locator(".party-metrics")).toContainText("2");
  await expect(party.locator(".party-tonight")).toContainText("Everyone Game");
  await expect(party).toContainText("Handoff Game");
  await expect(party).toContainText("Two of Three");
  await expect(party).toContainText("2 of 3 own");
  await expect(party.locator(".party-corners")).toContainText("Only on Alpha’s shelf");
  await expect(party.locator(".party-corners")).toContainText("Only on Beta’s shelf");
  await expect(party.locator(".party-corners")).toContainText("Only on Gamma’s shelf");

  await page.getByRole("button", { name: "Share party" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("?party=");
  expect(copied).toContain("76561198000000001");
  expect(copied).toContain("76561198000000002");
  expect(copied).toContain("76561198000000003");
  expect(copied).toContain("#party");
  expect(copied).not.toContain("Everyone%20Game");

  expect(requested).toEqual(expect.arrayContaining([
    "https://steamcommunity.com/id/alpha",
    "https://steamcommunity.com/id/beta",
    "https://steamcommunity.com/id/gamma",
  ]));

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test("Party Shelf stateless links prefill resolved public SteamIDs", async ({ page }) => {
  await page.goto("/?party=76561198000000001,76561198000000002,76561198000000003#party");

  await expect(page.getByText(/This Party Shelf came from a stateless link/)).toBeVisible();
  await expect(page.getByLabel("Party Steam profile 1")).toHaveValue("76561198000000001");
  await expect(page.getByLabel("Party Steam profile 2")).toHaveValue("76561198000000002");
  await expect(page.getByLabel("Party Steam profile 3")).toHaveValue("76561198000000003");
  await expect(page.getByRole("button", { name: "Load Party Shelf" })).toBeEnabled();
});
