import { describe, expect, it } from "vitest";
import { comparePartyLibraries } from "./party.js";
import type { PublicSteamLibrary } from "./steam.js";

const library = (steamid: string, name: string, games: Array<[string, number, string?]>): PublicSteamLibrary => ({
  steamid,
  gameCount: games.length,
  profile: { steamid, name, avatar: null, profileUrl: null },
  games: games.map(([appid, minutes, gameName]) => ({
    appid,
    name: gameName ?? `Game ${appid}`,
    minutes,
    lastPlayed: null,
    bytes: null,
    installed: false,
  })),
});

describe("comparePartyLibraries", () => {
  const group = [
    library("76561198000000001", "A", [["1", 600], ["2", 300], ["3", 0], ["10", 50]]),
    library("76561198000000002", "B", [["1", 500], ["2", 0], ["3", 100], ["20", 60]]),
    library("76561198000000003", "C", [["1", 400], ["2", 200], ["4", 100], ["30", 70]]),
  ];

  it("finds games owned and played by everyone", () => {
    const result = comparePartyLibraries(group);
    expect(result.playerCount).toBe(3);
    expect(result.unionCount).toBe(7);
    expect(result.ownedByAll.map((game) => game.appid)).toEqual(["1", "2"]);
    expect(result.playedByAll.map((game) => game.appid)).toEqual(["1"]);
    expect(result.ownedByAllCount).toBe(2);
    expect(result.playedByAllCount).toBe(1);
  });

  it("keeps group handoffs and unique corners factual", () => {
    const result = comparePartyLibraries(group);
    expect(result.handoffs.map((game) => game.appid)).toEqual(["2"]);
    expect(result.handoffs[0]?.playedCount).toBe(2);
    expect(result.uniqueCorners).toEqual([
      { steamid: "76561198000000001", name: "A", count: 1 },
      { steamid: "76561198000000002", name: "B", count: 1 },
      { steamid: "76561198000000003", name: "C", count: 1 },
    ]);
  });

  it("shows majority ownership separately from everyone", () => {
    const four = [
      ...group,
      library("76561198000000004", "D", [["1", 20], ["5", 10]]),
    ];
    const result = comparePartyLibraries(four);
    expect(result.ownedByAll.map((game) => game.appid)).toEqual(["1"]);
    expect(result.ownedByMost.map((game) => [game.appid, game.ownerCount])).toContainEqual(["2", 3]);
  });

  it("requires between three and five profiles", () => {
    expect(() => comparePartyLibraries(group.slice(0, 2))).toThrow(/3–5/);
    expect(() => comparePartyLibraries([...group, group[0]!, group[1]!, group[2]!])).toThrow(/3–5/);
  });
});
