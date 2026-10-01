import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_SHELF_GAMES,
  MAX_CUSTOM_SHELVES,
  cleanShelfName,
  customShelvesBackupFilename,
  customShelvesBackupObject,
  customShelvesBackupText,
  normaliseCustomShelves,
  parseCustomShelvesBackup,
  shelfStoryFromCustomShelf,
  type CustomShelf,
} from "./custom-shelves.js";

describe("custom shelves", () => {
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
