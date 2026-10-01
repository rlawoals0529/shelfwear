import { describe, expect, it } from "vitest";
import { STEAM_PROFILE_PREFIX } from "./steam.js";
import { fillResolvedProfileSlot, findResolvedProfileSlot } from "./profile-slots.js";

const ID = "76561198000000000";

describe("friend profile slots", () => {
  it("puts a resolved shelf in the first open slot without overwriting entered profiles", () => {
    const result = fillResolvedProfileSlot([
      "friend-one",
      STEAM_PROFILE_PREFIX,
      STEAM_PROFILE_PREFIX,
    ], ID);

    expect(result).toEqual({
      values: ["friend-one", ID, STEAM_PROFILE_PREFIX],
      slotIndex: 1,
      changed: true,
    });
  });

  it("recognizes the original vanity input as the same resolved shelf", () => {
    const values = ["cozyplayer", STEAM_PROFILE_PREFIX];
    expect(findResolvedProfileSlot(values, ID, ["cozyplayer"])).toBe(0);
    expect(fillResolvedProfileSlot(values, ID, ["cozyplayer"]).changed).toBe(false);
  });

  it("treats equivalent profile URLs the same with or without a trailing slash", () => {
    expect(findResolvedProfileSlot(
      ["https://steamcommunity.com/id/cozyplayer"],
      ID,
      ["https://steamcommunity.com/id/cozyplayer/"],
    )).toBe(0);
  });

  it("does not overwrite a full set of friend slots", () => {
    const values = ["alpha", "beta", "gamma"];
    expect(fillResolvedProfileSlot(values, ID)).toEqual({
      values,
      slotIndex: null,
      changed: false,
    });
  });

  it("ignores invalid unresolved IDs", () => {
    const values = [STEAM_PROFILE_PREFIX, STEAM_PROFILE_PREFIX];
    expect(fillResolvedProfileSlot(values, "bad")).toEqual({
      values,
      slotIndex: null,
      changed: false,
    });
  });
});
