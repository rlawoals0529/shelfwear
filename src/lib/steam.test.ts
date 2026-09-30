import { describe, expect, it } from "vitest";
import { comparisonShareUrl, sharedComparisonFromSearch, sharedSteamFromSearch, steamShareUrl } from "./steam.js";

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
