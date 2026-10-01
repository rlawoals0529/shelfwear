import { describe, expect, it } from "vitest";
import type { Game } from "./library.js";
import {
  libraryExportCsv,
  libraryExportFilename,
  libraryExportObject,
} from "./export.js";

const games: Game[] = [
  {
    appid: "10",
    name: "Comma, Quote \"Game\"",
    minutes: 125,
    lastPlayed: 1700000000,
    bytes: 123456,
    installed: true,
    iconHash: "0123456789abcdef0123456789abcdef01234567",
  },
];

describe("library export", () => {
  it("never invents local-device fields for public Steam exports", () => {
    const value = libraryExportObject(games, {
      kind: "steam",
      sourceLabel: "Cozy Player public Steam library",
      generatedAt: "2026-10-01T04:00:00.000Z",
      steamid: "76561198000000000",
      profileName: "Cozy Player",
    });

    expect(value.source.kind).toBe("public_steam");
    expect(value.source.note).toContain("No local install");
    expect(value.games[0]).toMatchObject({
      appid: "10",
      lifetime_minutes: 125,
      icon_hash: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(value.games[0]).not.toHaveProperty("installed_on_this_pc");
    expect(value.games[0]).not.toHaveProperty("known_disk_bytes");
    expect(value.games[0]).not.toHaveProperty("local_last_played_unix");
  });

  it("includes literal local fields only for local-file exports", () => {
    const value = libraryExportObject(games, {
      kind: "local",
      sourceLabel: "3 files",
      generatedAt: "2026-10-01T04:00:00.000Z",
    });

    expect(value.source.kind).toBe("local_steam_files");
    expect(value.games[0]).toMatchObject({
      installed_on_this_pc: true,
      known_disk_bytes: 123456,
      local_last_played_unix: 1700000000,
    });
  });

  it("labels the bundled sample as synthetic rather than device data", () => {
    const value = libraryExportObject(games, {
      kind: "sample",
      sourceLabel: "the sample library",
      generatedAt: "2026-10-01T04:00:00.000Z",
    });

    expect(value.source.kind).toBe("synthetic_demo");
    expect(value.source.note).toContain("Synthetic demo data");
  });

  it("escapes CSV text and omits local-only columns from public exports", () => {
    const csv = libraryExportCsv(games, {
      kind: "steam",
      sourceLabel: "public Steam",
      generatedAt: "2026-10-01T04:00:00.000Z",
    });

    expect(csv.split("\r\n")[0]).toBe("appid,name,lifetime_minutes,source,icon_hash");
    expect(csv).toContain('"Comma, Quote ""Game"""');
    expect(csv).not.toContain("installed_on_this_pc");
  });

  it("uses human-readable filenames", () => {
    expect(libraryExportFilename("csv", { kind: "steam", profileName: "Cozy Player!" }))
      .toBe("shelfwear-cozy-player-library.csv");
    expect(libraryExportFilename("json", { kind: "local" }))
      .toBe("shelfwear-local-library.json");
  });
});
