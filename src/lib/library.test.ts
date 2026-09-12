import { describe, expect, it } from "vitest";
import { readLocalConfig, readManifest, buildLibrary, summarise, hours, gb, shelve, type Game } from "./library.js";

const config = (apps: string) => `
"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" { ${apps} } } } } }`;

const manifest = (appid: string, name: string, size?: string) => `
"AppState" {
  "appid" "${appid}"
  "name"  "${name}"
  ${size === undefined ? "" : `"SizeOnDisk" "${size}"`}
}`;

describe("readLocalConfig", () => {
  it("reads playtime and last played", () => {
    const m = readLocalConfig(config(`"440" { "playTime" "1200" "LastPlayed" "1700000000" }`));
    expect(m.get("440")).toEqual({ minutes: 1200, lastPlayed: 1700000000 });
  });

  it("accepts either spelling of playtime", () => {
    // The client has written both. Reading one gives a library of zeroes on the machines
    // that use the other, and a library of zeroes looks like a true answer.
    expect(readLocalConfig(config(`"1" { "playtime" "60" }`)).get("1")?.minutes).toBe(60);
    expect(readLocalConfig(config(`"2" { "playTime" "60" }`)).get("2")?.minutes).toBe(60);
  });

  it("finds the apps block whatever its capitalisation", () => {
    const odd = `"userlocalconfigstore" { "software" { "valve" { "steam" { "Apps" { "7" { "playTime" "5" } } } } } }`;
    expect(readLocalConfig(odd).get("7")?.minutes).toBe(5);
  });

  it("an app with no playtime recorded is zero, not missing", () => {
    // Owned and never launched is the row this whole tool is about.
    const m = readLocalConfig(config(`"440" { "LaunchOptions" "-novid" }`));
    expect(m.get("440")).toEqual({ minutes: 0, lastPlayed: null });
  });

  it("a zero or absent LastPlayed is null rather than 1970", () => {
    expect(readLocalConfig(config(`"1" { "LastPlayed" "0" }`)).get("1")?.lastPlayed).toBeNull();
    expect(readLocalConfig(config(`"2" { }`)).get("2")?.lastPlayed).toBeNull();
  });

  it("a file with no apps block gives nothing rather than throwing", () => {
    expect(readLocalConfig(`"UserLocalConfigStore" { "Software" { } }`).size).toBe(0);
  });
});

describe("readManifest", () => {
  it("reads the fields that matter", () => {
    expect(readManifest(manifest("440", "Team Fortress 2", "22548578304"))).toEqual({
      appid: "440", name: "Team Fortress 2", bytes: 22548578304,
    });
  });

  it("a manifest with no size reports null, not zero", () => {
    // Zero bytes would quietly subtract a real game from the disk total.
    expect(readManifest(manifest("440", "Team Fortress 2"))?.bytes).toBeNull();
  });

  it("returns null for a file that is not a manifest", () => {
    expect(readManifest(`"UserLocalConfigStore" { }`)).toBeNull();
    expect(readManifest(`this is not vdf at all "`)).toBeNull();
    expect(readManifest("")).toBeNull();
  });
});

describe("buildLibrary", () => {
  it("keeps a game that is in only one of the two files", () => {
    const play = readLocalConfig(config(`"1" { "playTime" "600" } "2" { "playTime" "0" }`));
    const games = buildLibrary(play, [
      readManifest(manifest("2", "Installed, never launched", "1000"))!,
      readManifest(manifest("3", "Installed, no playtime record", "2000"))!,
    ]);
    expect(games.map((g) => g.appid).sort()).toEqual(["1", "2", "3"]);

    // Played then uninstalled: hours, no name, no size, and not installed.
    const one = games.find((g) => g.appid === "1")!;
    expect(one).toMatchObject({ minutes: 600, name: null, bytes: null, installed: false });

    // Installed but never launched, which is the backlog.
    const two = games.find((g) => g.appid === "2")!;
    expect(two).toMatchObject({ minutes: 0, name: "Installed, never launched", installed: true });
  });

  it("sorts by playtime, then by appid so the order is stable", () => {
    const play = readLocalConfig(config(`"b" { "playTime" "10" } "a" { "playTime" "10" } "c" { "playTime" "99" }`));
    expect(buildLibrary(play, []).map((g) => g.appid)).toEqual(["c", "a", "b"]);
  });
});

describe("summarise", () => {
  const build = (rows: [string, number, string | null, number | null][]) =>
    rows.map(([appid, minutes, name, bytes]) => ({
      appid, minutes, name, bytes, lastPlayed: null, installed: name !== null,
    }));

  it("counts played against never played", () => {
    const s = summarise(build([["1", 600, "A", 100], ["2", 0, "B", 200], ["3", 0, "C", 300]]));
    expect(s).toMatchObject({ games: 3, played: 1, neverPlayed: 2, totalMinutes: 600 });
  });

  it("separates disk held by never-played games from the rest", () => {
    const s = summarise(build([["1", 600, "A", 100], ["2", 0, "B", 200], ["3", 0, "C", 300]]));
    expect(s.installedBytes).toBe(600);
    expect(s.unplayedBytes).toBe(500);
  });

  it("says the byte total is a floor when a manifest has no size", () => {
    // Reporting a total that is missing a game, with nothing saying so, is the failure.
    const s = summarise(build([["1", 60, "A", null], ["2", 60, "B", 100]]));
    expect(s.sizeIsPartial).toBe(true);
    expect(s.unknownSize).toBe(1);
    expect(s.installedBytes).toBe(100);
  });

  it("an uninstalled game is not counted as unknown size", () => {
    // It has no manifest, so of course there is no size. That is not a gap in the data.
    const s = summarise(build([["1", 60, null, null]]));
    expect(s.sizeIsPartial).toBe(false);
    expect(s.unknownSize).toBe(0);
  });

  it("counts how few titles hold half the hours", () => {
    // 1000 of 1900 minutes is already past half, so one title does it.
    const s = summarise(build([["1", 1000, "A", 1], ["2", 500, "B", 1], ["3", 400, "C", 1]]));
    expect(s.halfOfHoursIn).toBe(1);
  });

  it("a library with no hours reports zero rather than every game", () => {
    const s = summarise(build([["1", 0, "A", 1], ["2", 0, "B", 1]]));
    expect(s.halfOfHoursIn).toBe(0);
    expect(s.totalMinutes).toBe(0);
  });

  it("an empty library does not divide by zero", () => {
    expect(summarise([])).toMatchObject({ games: 0, played: 0, neverPlayed: 0, halfOfHoursIn: 0 });
  });
});

describe("units", () => {
  it("rounds to one decimal", () => {
    expect(hours(90)).toBe(1.5);
    expect(hours(1)).toBe(0);
    expect(gb(1_073_741_824)).toBe(1);
    expect(gb(1_610_612_736)).toBe(1.5);
  });
});

describe("shelve", () => {
  const game = (appid: string, bytes: number | null, minutes: number, installed = true): Game => ({
    appid,
    name: `game ${appid}`,
    minutes,
    lastPlayed: null,
    bytes,
    installed,
  });

  it("puts the never launched on their own shelf, biggest first", () => {
    const { untouched, played } = shelve([
      game("1", 10e9, 60),
      game("2", 5e9, 0),
      game("3", 40e9, 0),
    ]);
    expect(untouched.map((s) => s.game.appid)).toEqual(["3", "2"]);
    expect(played.map((s) => s.game.appid)).toEqual(["1"]);
    expect(untouched.every((s) => s.untouched)).toBe(true);
  });

  it("makes the spine as wide as the game is big", () => {
    const { played } = shelve([game("1", 100e9, 60), game("2", 50e9, 60)], 20, 120);
    expect(played[0]!.width).toBe(120);
    // Half the bytes, half the way between the floor and the ceiling.
    expect(played[1]!.width).toBe(70);
  });

  it("gives the smallest game a spine you can still see", () => {
    const { played } = shelve([game("1", 100e9, 60), game("2", 1, 60)], 26, 116);
    // Not a hairline: a floor, or the tail of a real library is unclickable.
    expect(played[1]!.width).toBe(26);
  });

  it("leaves off anything with no size, because a spine is made of disk", () => {
    const { untouched, played } = shelve([
      game("1", null, 0, true),
      game("2", null, 60, false),
      game("3", 0, 0, true),
    ]);
    expect(untouched).toEqual([]);
    expect(played).toEqual([]);
  });

  it("survives a library with nothing installed", () => {
    expect(shelve([])).toEqual({ untouched: [], played: [] });
  });
});
