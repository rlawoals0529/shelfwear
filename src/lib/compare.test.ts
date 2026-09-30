import { describe, expect, it } from "vitest";
import { compareLibraries } from "./compare.js";
import type { Game } from "./library.js";

const game = (appid: string, minutes: number, name = `Game ${appid}`, iconHash: string | null = null): Game => ({
  appid,
  name,
  minutes,
  lastPlayed: null,
  bytes: null,
  installed: false,
  iconHash,
});

describe("compareLibraries", () => {
  it("calculates ownership overlap and mutually played games without inventing missing data", () => {
    const left = [game("1", 600), game("2", 300), game("3", 0)];
    const right = [game("1", 120), game("2", 0), game("4", 240)];
    const result = compareLibraries(left, right);

    expect(result.sharedCount).toBe(2);
    expect(result.unionCount).toBe(4);
    expect(result.leftOnlyCount).toBe(1);
    expect(result.rightOnlyCount).toBe(1);
    expect(result.overlapPercent).toBe(50);
    expect(result.mutuallyPlayedCount).toBe(1);
    expect(result.mutuallyPlayed[0]?.appid).toBe("1");
    expect(result.oneSidedPlayed.map((game) => game.appid)).toEqual(["2"]);
  });

  it("keeps official Steam art metadata for shared-card rendering", () => {
    const hash = "0123456789abcdef0123456789abcdef01234567";
    const result = compareLibraries([game("1", 90, "Shared", hash)], [game("1", 60, "Shared")]);
    expect(result.mutuallyPlayed[0]).toMatchObject({ appid: "1", iconHash: hash });
  });

  it("orders shared one-sided play by the person who has actually played it", () => {
    const left = [game("1", 900), game("2", 0), game("3", 100)];
    const right = [game("1", 0), game("2", 500), game("3", 100)];
    const result = compareLibraries(left, right);
    expect(result.oneSidedPlayed.map((game) => game.appid)).toEqual(["1", "2"]);
  });

  it("sorts common played games by the smaller of the two playtimes", () => {
    const left = [game("1", 1000), game("2", 400)];
    const right = [game("1", 60), game("2", 300)];
    const result = compareLibraries(left, right);
    expect(result.mutuallyPlayed.map((game) => game.appid)).toEqual(["2", "1"]);
  });

  it("keeps completely separate libraries explicit", () => {
    const result = compareLibraries([game("1", 60)], [game("2", 60)]);
    expect(result.sharedCount).toBe(0);
    expect(result.signature.name).toBe("Parallel Shelves");
  });
});
