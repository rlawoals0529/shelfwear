import { describe, expect, it } from "vitest";
import { familiarFor, steamCover, topNine } from "./profile.js";
import type { Game } from "./library.js";

const game = (appid: string, minutes: number, name = `Game ${appid}`): Game => ({
  appid,
  name,
  minutes,
  lastPlayed: null,
  bytes: null,
  installed: false,
});

describe("topNine", () => {
  it("takes the nine played named games with the most time", () => {
    const games = Array.from({ length: 12 }, (_, i) => game(String(i + 1), (i + 1) * 60));
    games.push(game("99", 0, "Never played"));
    const result = topNine(games);
    expect(result).toHaveLength(9);
    expect(result[0]?.appid).toBe("12");
    expect(result.at(-1)?.appid).toBe("4");
  });
});

describe("familiarFor", () => {
  it("uses the hearth cat when one game dominates recorded time", () => {
    const result = familiarFor([game("1", 400), game("2", 300), game("3", 200), game("4", 100)]);
    expect(result.name).toBe("Hearth Cat");
    expect(result.evidence).toContain("40%");
  });

  it("uses the lantern moth for a mostly untouched shelf", () => {
    const games = [game("1", 100), ...Array.from({ length: 11 }, (_, i) => game(String(i + 2), 0))];
    expect(familiarFor(games).name).toBe("Lantern Moth");
  });
});

describe("steamCover", () => {
  it("builds a Steam static asset URL from an appid", () => {
    expect(steamCover("730")).toBe("https://shared.steamstatic.com/store_item_assets/steam/apps/730/library_600x900.jpg");
  });
});
