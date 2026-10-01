import { describe, expect, it } from "vitest";
import type { Game } from "./library.js";
import {
  MAX_SHELF_HISTORY_SNAPSHOTS,
  diffShelfHistory,
  makeShelfHistorySnapshot,
  normaliseShelfHistory,
  recordShelfHistoryVisit,
  shelfHistoryOverview,
  shelfHistorySparklinePoints,
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
    expect(delta.recordedTimeChanges).toEqual([
      { appid: "20", fromMinutes: 0, toMinutes: 30, deltaMinutes: 30 },
      { appid: "30", fromMinutes: 590, toMinutes: 610, deltaMinutes: 20 },
      { appid: "40", fromMinutes: 2990, toMinutes: 3010, deltaMinutes: 20 },
      { appid: "50", fromMinutes: 5990, toMinutes: 6010, deltaMinutes: 20 },
      { appid: "10", fromMinutes: 110, toMinutes: 125, deltaMinutes: 15 },
    ]);
    expect(delta.recordedTimeChanges.some((entry) => entry.appid === "60")).toBe(false);
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
    expect(record.snapshots[0]).toMatchObject({ at: 1000, totalMinutes: 0 });
    expect(record.snapshots.at(-1)?.totalMinutes).toBe((MAX_SHELF_HISTORY_SNAPSHOTS + 3) * 60);
  });

  it("normalises stored records and rejects another SteamID", () => {
    const record = startShelfHistory("76561198000000000", [game("10", 60)], 1000);
    expect(normaliseShelfHistory(record, "76561198000000000")).not.toBeNull();
    expect(normaliseShelfHistory(record, "76561198000000001")).toBeNull();
  });

  it("summarizes net change only from the retained observed baseline", () => {
    let record = startShelfHistory("76561198000000000", [game("10", 60), game("20", 0)], 1000);
    record = recordShelfHistoryVisit(record, [game("10", 180), game("20", 30), game("30", 60)], 2000).record;

    const overview = shelfHistoryOverview(record, [game("10", 240), game("20", 30), game("30", 60)], 3000);
    expect(overview).toMatchObject({
      fromAt: 1000,
      toAt: 3000,
      minutesDelta: 270,
      gamesDelta: 1,
      playedDelta: 2,
      baselineRetained: true,
    });
    expect(overview?.observations).toHaveLength(2);
  });

  it("plots only saved observations and handles flat histories", () => {
    const observations = [
      { at: 1000, totalMinutes: 60, gameCount: 1, playedCount: 1 },
      { at: 2000, totalMinutes: 120, gameCount: 1, playedCount: 1 },
      { at: 3000, totalMinutes: 180, gameCount: 1, playedCount: 1 },
    ];
    const points = shelfHistorySparklinePoints(observations, 100, 40, 5);
    expect(points.map((point) => point.x)).toEqual([5, 50, 95]);
    expect(points[0]!.y).toBe(35);
    expect(points[2]!.y).toBe(5);

    const flat = shelfHistorySparklinePoints(
      observations.map((point) => ({ ...point, totalMinutes: 60 })),
      100,
      40,
      5,
    );
    expect(flat.every((point) => point.y === 20)).toBe(true);
  });
});
