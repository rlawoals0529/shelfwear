import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_SHELF_GAMES,
  MAX_CUSTOM_SHELVES,
  cleanShelfName,
  customShelfGamesFromLibrary,
  moveSelectedCustomShelfGames,
  removeSelectedCustomShelfGames,
  customShelvesBackupFilename,
  customShelvesBackupObject,
  customShelvesBackupText,
  customShelfShareText,
  normaliseCustomShelves,
  nextDuplicateShelfName,
  parseCustomShelvesBackup,
  shelfStoryFromCustomShelf,
  type CustomShelf,
} from "./custom-shelves.js";

describe("bulk custom-shelf editing", () => {
  const games = [
    { appid: "1", name: "One", note: "keep one" },
    { appid: "2", name: "Two" },
    { appid: "3", name: "Three", note: "keep three" },
    { appid: "4", name: "Four" },
  ];

  it("moves selected games to the top as a stable block", () => {
    const moved = moveSelectedCustomShelfGames(games, ["4", "2"], "top");
    expect(moved.map((game) => game.appid)).toEqual(["2", "4", "1", "3"]);
    expect(moved[0]).toBe(games[1]);
    expect(moved[1]).toBe(games[3]);
  });

  it("moves selected games to the bottom while preserving both relative orders", () => {
    const moved = moveSelectedCustomShelfGames(games, ["2", "4", "999"], "bottom");
    expect(moved.map((game) => game.appid)).toEqual(["1", "3", "2", "4"]);
    expect(moved.map((game) => game.note)).toEqual(["keep one", "keep three", undefined, undefined]);
  });

  it("removes only explicitly selected games and ignores stale ids", () => {
    const remaining = removeSelectedCustomShelfGames(games, ["2", "999", "4"]);
    expect(remaining.map((game) => game.appid)).toEqual(["1", "3"]);
    expect(remaining[1]?.note).toBe("keep three");
  });
});

describe("custom shelves", () => {
  it("turns library results into compact shelf entries without source metrics", () => {
    const games = Array.from({ length: MAX_CUSTOM_SHELF_GAMES + 3 }, (_, index) => ({
      appid: String(index + 1),
      name: index === 0 ? "Hades" : `Game ${index + 1}`,
      minutes: 600 + index,
      lastPlayed: 1700000000 + index,
      bytes: 1234 + index,
      installed: true,
      iconHash: index === 0 ? "a".repeat(40) : null,
    }));

    const compact = customShelfGamesFromLibrary(games);
    expect(compact).toHaveLength(MAX_CUSTOM_SHELF_GAMES);
    expect(compact[0]).toEqual({ appid: "1", name: "Hades", iconHash: "a".repeat(40) });
    expect(compact[0]).not.toHaveProperty("minutes");
    expect(compact[0]).not.toHaveProperty("lastPlayed");
    expect(compact[0]).not.toHaveProperty("bytes");
    expect(compact[0]).not.toHaveProperty("installed");
  });

  it("normalises names, deduplicates games, and drops malformed records", () => {
    const shelves = normaliseCustomShelves([
      {
        id: " comfort ",
        name: "  Comfort   games  ",
        createdAt: 10,
        updatedAt: 20,
        games: [
          { appid: "10", name: "  Shared   Quest ", iconHash: "a".repeat(40) },
          { appid: "10", name: "duplicate" },
          { appid: "oops", name: "bad" },
        ],
      },
      { id: "", name: "missing id", games: [] },
    ]);

    expect(shelves).toEqual([
      {
        id: "comfort",
        name: "Comfort games",
        createdAt: 10,
        updatedAt: 20,
        games: [{ appid: "10", name: "Shared Quest", iconHash: "a".repeat(40) }],
      },
    ]);
  });

  it("bounds shelves, games, shelf names, and notes", () => {
    const shelves = normaliseCustomShelves(
      Array.from({ length: MAX_CUSTOM_SHELVES + 3 }, (_, shelfIndex) => ({
        id: `shelf-${shelfIndex}`,
        name: "x".repeat(60),
        createdAt: shelfIndex,
        updatedAt: shelfIndex,
        games: Array.from({ length: MAX_CUSTOM_SHELF_GAMES + 5 }, (_, gameIndex) => ({
          appid: String(1000 + gameIndex),
          name: `Game ${gameIndex}`,
          note: "n".repeat(120),
        })),
      })),
    );

    expect(shelves).toHaveLength(MAX_CUSTOM_SHELVES);
    expect(shelves[0]?.name).toHaveLength(40);
    expect(shelves[0]?.games).toHaveLength(MAX_CUSTOM_SHELF_GAMES);
    expect(shelves[0]?.games[0]?.note).toHaveLength(80);
    expect(cleanShelfName("   shelf    name  ")).toBe("shelf name");
  });

  it("turns the first nine shelf games into an authored Story seed", () => {
    const shelf: CustomShelf = {
      id: "comfort",
      name: "Comfort games",
      createdAt: 1,
      updatedAt: 1,
      games: Array.from({ length: 12 }, (_, index) => ({
        appid: String(index + 1),
        name: `Game ${index + 1}`,
        note: index === 0 ? "always come back to this" : undefined,
      })),
    };

    const story = shelfStoryFromCustomShelf(shelf);
    expect(story.title).toBe("Comfort games");
    expect(story.games).toHaveLength(9);
    expect(story.games[0]?.note).toBe("always come back to this");
  });
});


describe("custom shelf backups", () => {
  const shelf: CustomShelf = {
    id: "comfort",
    name: "Comfort games",
    createdAt: 10,
    updatedAt: 20,
    games: [
      { appid: "10", name: "Shared Quest", iconHash: "a".repeat(40), note: "rainy day" },
    ],
  };

  it("exports only the compact custom-shelf schema", () => {
    const backup = customShelvesBackupObject([shelf], "2026-10-01T05:00:00.000Z");
    expect(backup).toEqual({
      schema: "shelfwear.custom-shelves.v1",
      exportedAt: "2026-10-01T05:00:00.000Z",
      shelves: [shelf],
    });
    const text = customShelvesBackupText([shelf], "2026-10-01T05:00:00.000Z");
    expect(text).toContain('"note": "rainy day"');
    expect(text).not.toContain("minutes");
    expect(text).not.toContain("installed");
    expect(text).not.toContain("bytes");
  });

  it("round-trips a valid backup through the same shelf normalizer", () => {
    const text = customShelvesBackupText([shelf], "2026-10-01T05:00:00.000Z");
    expect(parseCustomShelvesBackup(text)).toEqual({
      schema: "shelfwear.custom-shelves.v1",
      exportedAt: "2026-10-01T05:00:00.000Z",
      shelves: [shelf],
    });
  });

  it("rejects unrelated or unsupported JSON", () => {
    expect(() => parseCustomShelvesBackup("{")).toThrow("not valid JSON");
    expect(() => parseCustomShelvesBackup('{"schema":"something.else","shelves":[]}'))
      .toThrow("Unsupported");
    expect(() => parseCustomShelvesBackup('{"schema":"shelfwear.custom-shelves.v1"}'))
      .toThrow("does not contain a shelves list");
  });

  it("allows a deliberate empty backup but rejects malformed non-empty shelf data", () => {
    expect(parseCustomShelvesBackup(
      '{"schema":"shelfwear.custom-shelves.v1","exportedAt":"x","shelves":[]}'
    ).shelves).toEqual([]);

    expect(() => parseCustomShelvesBackup(
      '{"schema":"shelfwear.custom-shelves.v1","exportedAt":"x","shelves":[{"bad":true}]}'
    )).toThrow("No valid Shelfwear shelves");
  });

  it("uses a dated, portable filename", () => {
    expect(customShelvesBackupFilename(new Date("2026-10-01T05:00:00.000Z")))
      .toBe("shelfwear-my-shelves-2026-10-01.json");
  });
});


describe("duplicate shelf naming", () => {
  it("uses a readable copy suffix and avoids existing names case-insensitively", () => {
    expect(nextDuplicateShelfName("Comfort games", ["Comfort games"]))
      .toBe("Comfort games copy");
    expect(nextDuplicateShelfName("Comfort games", ["Comfort games", "comfort games copy"]))
      .toBe("Comfort games copy 2");
  });

  it("keeps duplicate names inside the shelf-name limit", () => {
    const name = nextDuplicateShelfName("x".repeat(60), ["x".repeat(40)]);
    expect(name.length).toBeLessThanOrEqual(40);
    expect(name).toMatch(/copy/);
  });
});


describe("custom shelf sharing", () => {
  it("shares the ordered game list but never private notes", () => {
    const shelf: CustomShelf = {
      id: "comfort",
      name: "Comfort games",
      createdAt: 1,
      updatedAt: 2,
      games: [
        { appid: "1", name: "Hades", note: "private rainy-day note" },
        { appid: "2", name: "Stardew Valley", note: "do not share this" },
      ],
    };

    const text = customShelfShareText(shelf);
    expect(text).toContain("Comfort games");
    expect(text).toContain("1. Hades");
    expect(text).toContain("2. Stardew Valley");
    expect(text).toContain("Made with Shelfwear");
    expect(text).not.toContain("private rainy-day note");
    expect(text).not.toContain("do not share this");
    expect(text).not.toContain("appid");
  });
});
