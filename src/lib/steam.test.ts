import { afterEach, describe, expect, it, vi } from "vitest";
import { SHELFWEAR_WORKER_ORIGIN, STEAM_PROFILE_PREFIX, comparisonShareUrl, fetchSteamAchievements, hasSteamProfileInput, inviteShareUrl, normaliseSteamProfileInput, sharedComparisonFromSearch, sharedInviteFromSearch, sharedSteamFromSearch, steamApiUrl, steamShareUrl } from "./steam.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Steam share URLs", () => {
  it("creates a single-shelf link without retaining unrelated query data", () => {
    expect(steamShareUrl("https://example.com/shelfwear/?old=1#x", "76561198000000000"))
      .toBe("https://example.com/shelfwear/?steam=76561198000000000#steam");
  });

  it("creates and parses a comparison link", () => {
    const url = comparisonShareUrl("https://example.com/shelfwear/", "76561198000000000", "76561198000000001");
    expect(url).toBe("https://example.com/shelfwear/?compare=76561198000000000%2C76561198000000001#compare");
    expect(sharedComparisonFromSearch(new URL(url).search)).toEqual(["76561198000000000", "76561198000000001"]);
  });

  it("creates a one-sided invite that contains only the inviter's public SteamID", () => {
    const url = inviteShareUrl("https://example.com/shelfwear/?old=1#x", "76561198000000000");
    expect(url).toBe("https://example.com/shelfwear/?invite=76561198000000000#compare");
    expect(sharedInviteFromSearch(new URL(url).search)).toBe("76561198000000000");
    expect(url).not.toContain("compare=");
  });

  it("rejects malformed shared identifiers", () => {
    expect(sharedSteamFromSearch("?steam=not-an-id")).toBeNull();
    expect(sharedComparisonFromSearch("?compare=76561198000000000,wat" )).toBeNull();
    expect(sharedInviteFromSearch("?invite=not-an-id")).toBeNull();
  });
});


describe("Steam profile input", () => {
  it("lets a vanity username be typed after the prefilled Steam URL", () => {
    expect(STEAM_PROFILE_PREFIX).toBe("https://steamcommunity.com/id/");
    expect(normaliseSteamProfileInput(`${STEAM_PROFILE_PREFIX}cozyplayer`))
      .toBe("https://steamcommunity.com/id/cozyplayer");
  });

  it("also accepts a bare vanity name and expands it", () => {
    expect(normaliseSteamProfileInput("cozyplayer")).toBe("https://steamcommunity.com/id/cozyplayer");
  });

  it("does not treat the prefix by itself as a complete profile", () => {
    expect(hasSteamProfileInput(STEAM_PROFILE_PREFIX)).toBe(false);
    expect(hasSteamProfileInput(`${STEAM_PROFILE_PREFIX}cozyplayer`)).toBe(true);
  });
});


describe("Steam API routing", () => {
  it("uses the Cloudflare Worker when the frontend is on GitHub Pages", () => {
    expect(steamApiUrl("/api/steam/library?profile=x", "rlawoals0529.github.io"))
      .toBe(`${SHELFWEAR_WORKER_ORIGIN}/api/steam/library?profile=x`);
  });

  it("keeps API requests same-origin on the Worker and local development", () => {
    expect(steamApiUrl("/api/steam/library?profile=x", "shelfwear.rlawoals0529.workers.dev"))
      .toBe("/api/steam/library?profile=x");
    expect(steamApiUrl("/api/steam/library?profile=x", "localhost"))
      .toBe("/api/steam/library?profile=x");
  });
});


describe("Steam achievements", () => {
  it("fetches one selected game from the same API routing layer", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/steam/achievements?steamid=76561198000000000&appid=10");
      return new Response(JSON.stringify({
        steamid: "76561198000000000",
        appid: "10",
        gameName: "Shared Quest",
        total: 2,
        unlocked: 1,
        completionPercent: 50,
        achievements: [
          {
            apiName: "ACH_FIRST",
            name: "First Step",
            description: "Do the thing",
            achieved: true,
            unlockTime: 1700000000,
            globalPercent: 12.34,
            hidden: false,
            icon: null,
          },
          {
            apiName: "ACH_LOCKED",
            name: "Still Locked",
            description: null,
            achieved: false,
            unlockTime: null,
            globalPercent: 2.1,
            hidden: true,
            icon: null,
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const cabinet = await fetchSteamAchievements("76561198000000000", "10");
    expect(cabinet).toMatchObject({
      gameName: "Shared Quest",
      total: 2,
      unlocked: 1,
      completionPercent: 50,
    });
    expect(cabinet.achievements[0]).toMatchObject({ name: "First Step", globalPercent: 12.34, achieved: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid IDs before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSteamAchievements("bad", "10")).rejects.toThrow(/resolved public SteamID/);
    await expect(fetchSteamAchievements("76561198000000000", "bad")).rejects.toThrow(/numeric Steam AppID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
