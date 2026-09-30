import { describe, expect, it } from "vitest";
import { familiarFor, steamCover, steamHeader, steamIcon, topNine } from "./profile.js";
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

  it("uses a distinct familiar for a concentrated three-game core", () => {
    const result = familiarFor([
      game("1", 300), game("2", 250), game("3", 200),
      game("4", 70), game("5", 70), game("6", 70),
    ]);
    expect(result.name).toBe("Anchor Turtle");
    expect(result.signals).toContainEqual({ label: "Top three", value: "78%" });
  });

  it("recognises large played archives without treating size as personality", () => {
    const games = Array.from({ length: 200 }, (_, i) => game(String(i + 1), 180));
    const result = familiarFor(games);
    expect(result.name).toBe("Archive Dragon");
    expect(result.evidence).toContain("200 games have recorded playtime");
  });

  it("recognises deep libraries by median played time", () => {
    const games = Array.from({ length: 8 }, (_, i) => game(String(i + 1), 50 * 60));
    const result = familiarFor(games);
    expect(result.name).toBe("Deep-Dive Owl");
    expect(result.signals).toContainEqual({ label: "Median played", value: "50h" });
  });

  it("recognises a long tail of short visits", () => {
    const games = Array.from({ length: 12 }, (_, i) => game(String(i + 1), 60));
    expect(familiarFor(games).name).toBe("Comet Hare");
  });

  it("keeps the broad balanced shelf as the magpie", () => {
    const games = Array.from({ length: 24 }, (_, i) => game(String(i + 1), 180));
    expect(familiarFor(games).name).toBe("Magpie");
  });

  it("uses a quiet familiar when nothing has recorded playtime", () => {
    const result = familiarFor([game("1", 0), game("2", 0), game("3", 0)]);
    expect(result.name).toBe("Quiet Dormouse");
    expect(result.signals).toHaveLength(3);
  });

  it("returns three transparent signals for every familiar", () => {
    const result = familiarFor(Array.from({ length: 10 }, (_, i) => game(String(i + 1), 180)));
    expect(result.name).toBe("Library Fox");
    expect(result.signals).toHaveLength(3);
    expect(result.signals.every((signal) => signal.label && signal.value)).toBe(true);
  });
});

describe("steamCover", () => {
  it("builds the official Steam artwork CDN URL", () => {
    expect(steamCover("730")).toBe("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/library_600x900.jpg");
    expect(steamHeader("730")).toBe("https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg");
    expect(steamIcon("730", "0123456789abcdef0123456789abcdef01234567")).toBe("https://media.steampowered.com/steamcommunity/public/images/apps/730/0123456789abcdef0123456789abcdef01234567.jpg");
  });
});
