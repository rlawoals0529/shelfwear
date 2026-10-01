import { describe, expect, it } from "vitest";
import type { Game } from "./library.js";
import {
  MAX_SHELF_HISTORY_SNAPSHOTS,
  diffShelfHistory,
  makeShelfHistorySnapshot,
  normaliseShelfHistory,
  recordShelfHistoryVisit,
  startShelfHistory,
} from "./history.js";

const game = (appid: string, minutes: number): Game => ({
  appid,
  name: `Game ${appid}`,
  minutes,
  lastPlayed: null,
  bytes: null,
  installed: false,
});

describe("Shelf History", () => {
  it("starts from an explicit browser-local baseline", () => {
    const record = startShelfHistory("76561198000000000", [game("10", 60), game("20", 0)], 1000);
    expect(record).toMatchObject({
      steamid: "76561198000000000",
      enabledAt: 1000,
      lastCheckedAt: 1000,
    });
    expect(record.snapshots).toHaveLength(1);
    expect(record.snapshots[0]).toMatchObject({
      gameCount: 2,
      playedCount: 1,
      totalMinutes: 60,
      games: [["10", 60], ["20", 0]],
    });
    expect(JSON.stringify(record)).not.toContain("Game 10");
  });

  it("finds only changes observable between saved snapshots", () => {
    const before = makeShelfHistorySnapshot([
      game("10", 110),
      game("20", 0),
      game("30", 590),
      game("40", 2990),
      game("50", 5990),
    ], 1000);
    const after = makeShelfHistorySnapshot([
      game("10", 125),
      game("20", 30),
      game("30", 610),
      game("40", 3010),
      game("50", 6010),
      game("60", 150),
    ], 2000);

    const delta = diffShelfHistory(before, after);
    expect(delta).toMatchObject({
      fromAt: 1000,
      toAt: 2000,
      minutesDelta: 255,
      gamesDelta: 1,
      newlyOwned: ["60"],
      newlyPlayed: ["20", "60"],
      changed: true,
    });
    expect(delta.thresholds).toEqual([
      { appid: "10", hours: 2, fromMinutes: 110, toMinutes: 125 },
      { appid: "30", hours: 10, fromMinutes: 590, toMinutes: 610 },
      { appid: "40", hours: 50, fromMinutes: 2990, toMinutes: 3010 },
      { appid: "50", hours: 100, fromMinutes: 5990, toMinutes: 6010 },
    ]);
    expect(delta.thresholds.some((entry) => entry.appid === "60")).toBe(false);
  });

  it("updates the last check without adding duplicate snapshots", () => {
    const baseline = startShelfHistory("76561198000000000", [game("10", 60)], 1000);
    const next = recordShelfHistoryVisit(baseline, [game("10", 60)], 2000);
    expect(next.delta.changed).toBe(false);
    expect(next.record.snapshots).toHaveLength(1);
    expect(next.record.lastCheckedAt).toBe(2000);
  });

  it("keeps a compact bounded snapshot history", () => {
    let record = startShelfHistory("76561198000000000", [game("10", 0)], 1000);
    for (let index = 1; index <= MAX_SHELF_HISTORY_SNAPSHOTS + 3; index++) {
      record = recordShelfHistoryVisit(record, [game("10", index * 60)], 1000 + index).record;
    }
    expect(record.snapshots).toHaveLength(MAX_SHELF_HISTORY_SNAPSHOTS);
    expect(record.snapshots.at(-1)?.totalMinutes).toBe((MAX_SHELF_HISTORY_SNAPSHOTS + 3) * 60);
  });

  it("normalises stored records and rejects another SteamID", () => {
    const record = startShelfHistory("76561198000000000", [game("10", 60)], 1000);
    expect(normaliseShelfHistory(record, "76561198000000000")).not.toBeNull();
    expect(normaliseShelfHistory(record, "76561198000000001")).toBeNull();
  });
});
