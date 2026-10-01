import { describe, expect, it } from "vitest";
import type { Game } from "./library.js";
import { buildShelfReceipt } from "./receipt.js";

const game = (
  appid: string,
  minutes: number,
  bytes: number | null,
  installed: boolean,
): Game => ({
  appid,
  name: `Game ${appid}`,
  minutes,
  bytes,
  installed,
  lastPlayed: null,
});

const games = [
  game("1", 6000, 10, true),
  game("2", 0, 90, true),
  game("3", 180, 50, true),
  game("4", 60, null, false),
  game("5", 30, 20, true),
];

describe("buildShelfReceipt", () => {
  it("summarizes literal current-library values", () => {
    const receipt = buildShelfReceipt(games, "steam");
    expect(receipt.gameCount).toBe(5);
    expect(receipt.totalMinutes).toBe(6270);
    expect(receipt.untouchedCount).toBe(1);
    expect(receipt.topPlayed.map((game) => game.appid)).toEqual(["1", "3", "4", "5"]);
  });

  it("only includes known install sizes for real local data", () => {
    expect(buildShelfReceipt(games, "steam").biggestKnownInstalls).toEqual([]);
    expect(buildShelfReceipt(games, "sample").biggestKnownInstalls).toEqual([]);
    expect(buildShelfReceipt(games, "local").biggestKnownInstalls.map((game) => game.appid))
      .toEqual(["2", "3", "5"]);
  });
});
