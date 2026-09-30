import { describe, expect, it } from "vitest";
import { STEAM_PROFILE_PREFIX, comparisonShareUrl, hasSteamProfileInput, normaliseSteamProfileInput, sharedComparisonFromSearch, sharedSteamFromSearch, steamShareUrl } from "./steam.js";

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

  it("rejects malformed shared identifiers", () => {
    expect(sharedSteamFromSearch("?steam=not-an-id")).toBeNull();
    expect(sharedComparisonFromSearch("?compare=76561198000000000,wat" )).toBeNull();
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
