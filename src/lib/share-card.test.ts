import { describe, expect, it } from "vitest";
import { proxiedSteamCover, shareCardFilename } from "./share-card.js";

describe("shareCardFilename", () => {
  it("creates a filesystem-safe PNG name from a public profile name", () => {
    expect(shareCardFilename("Jaemin's Cozy Shelf!"))
      .toBe("shelfwear-jaemin-s-cozy-shelf-nine.png");
  });

  it("falls back when a name has no usable latin filename characters", () => {
    expect(shareCardFilename("한글"))
      .toBe("shelfwear-my-nine.png");
  });
});

describe("proxiedSteamCover", () => {
  it("keeps cover retrieval on Shelfwear's own API origin", () => {
    expect(proxiedSteamCover("730")).toBe("/api/steam/cover/730");
    expect(proxiedSteamCover("730", "0123456789abcdef0123456789abcdef01234567"))
      .toBe("/api/steam/cover/730?icon=0123456789abcdef0123456789abcdef01234567");
  });
});
