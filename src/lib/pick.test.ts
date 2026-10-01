import { describe, expect, it } from "vitest";
import { buildPickPool, drawGame } from "./pick.js";
import type { Game } from "./library.js";

const game = (
  appid: string,
  minutes: number,
  installed = false,
): Game => ({
  appid,
  name: `Game ${appid}`,
  minutes,
  lastPlayed: null,
  bytes: installed ? 1024 : null,
  installed,
});

const games = [
  game("1", 0, true),
  game("2", 30, false),
  game("3", 119, true),
  game("4", 120, true),
  game("5", 900, false),
];

describe("buildPickPool", () => {
  it("keeps never-played separate from lightly played", () => {
    expect(buildPickPool(games, "never-played").games.map((g) => g.appid)).toEqual(["1"]);
    expect(buildPickPool(games, "under-two").games.map((g) => g.appid)).toEqual(["2", "3"]);
  });

  it("uses install state literally", () => {
    expect(buildPickPool(games, "installed").games.map((g) => g.appid)).toEqual(["1", "3", "4"]);
  });

  it("intersects a custom shelf with the currently loaded library", () => {
    const pool = buildPickPool(games, "custom-shelf", { customShelfAppIds: ["2", "5", "999"] });
    expect(pool.games.map((g) => g.appid)).toEqual(["2", "5"]);
    expect(pool.baseCount).toBe(2);
  });

  it("removes only session exclusions and reports how many matched", () => {
    const pool = buildPickPool(games, "under-two", { excludedAppIds: ["2", "999"] });
    expect(pool.games.map((g) => g.appid)).toEqual(["3"]);
    expect(pool.baseCount).toBe(2);
    expect(pool.excludedCount).toBe(1);
  });
});

describe("drawGame", () => {
  it("is injectable and deterministic for tests", () => {
    expect(drawGame(games, () => 0)?.appid).toBe("1");
    expect(drawGame(games, () => 0.999)?.appid).toBe("5");
  });

  it("returns null for an empty drawer", () => {
    expect(drawGame([], () => 0.5)).toBeNull();
  });
});
