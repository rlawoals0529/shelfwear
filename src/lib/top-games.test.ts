import { describe, expect, it } from "vitest";
import {
  curatedFromSearch,
  curatedShareUrl,
  decodeCuratedTopGames,
  encodeCuratedTopGames,
  normaliseCuratedTopGames,
  steamAppIdFromInput,
} from "./top-games.js";

describe("steamAppIdFromInput", () => {
  it("accepts an app id or Steam store app URL", () => {
    expect(steamAppIdFromInput("730")).toBe("730");
    expect(steamAppIdFromInput("https://store.steampowered.com/app/730/CounterStrike_2/")).toBe("730");
  });

  it("rejects non-Steam and malformed values", () => {
    expect(steamAppIdFromInput("https://example.com/app/730")).toBeNull();
    expect(steamAppIdFromInput("not-an-id")).toBeNull();
  });
});

describe("curated top games", () => {
  const list = {
    title: "games that shaped me",
    caption: "nine little pieces of my gaming history",
    games: [
      { name: "Counter-Strike 2", appid: "730", iconHash: "0123456789abcdef0123456789abcdef01234567" },
      { name: "A custom indie", appid: null, iconHash: null },
    ],
  };

  it("round-trips unicode-safe share payloads", () => {
    const encoded = encodeCuratedTopGames({ ...list, caption: "cozy ♡ 게임" });
    expect(decodeCuratedTopGames(encoded)).toEqual({ ...list, caption: "cozy ♡ 게임" });
  });

  it("creates and reads a stateless top-games share URL", () => {
    const url = curatedShareUrl("https://example.com/?steam=123#x", list);
    expect(url).not.toContain("steam=");
    expect(url).not.toContain("#x");
    expect(curatedFromSearch(new URL(url).search)).toEqual(list);
  });

  it("caps the list at nine and removes duplicate entries", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Game ${i}`, appid: String(i + 1) }));
    const normalized = normaliseCuratedTopGames({
      title: "  my   list ",
      caption: "",
      games: [many[0]!, many[0]!, ...many],
    });
    expect(normalized.games).toHaveLength(9);
    expect(normalized.title).toBe("my list");
  });
});


it("keeps a valid Steam icon hash in shared curated lists", () => {
  const encoded = encodeCuratedTopGames({
    title: "favorites",
    caption: "",
    games: [{ name: "Blue Protocol: Star Resonance", appid: "3681810", iconHash: "8c7fc95092f64b0a99c4e02263caf254da89b7bb" }],
  });
  expect(decodeCuratedTopGames(encoded)?.games[0]).toEqual({
    name: "Blue Protocol: Star Resonance",
    appid: "3681810",
    iconHash: "8c7fc95092f64b0a99c4e02263caf254da89b7bb",
  });
});
