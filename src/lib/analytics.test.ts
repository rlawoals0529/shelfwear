import { describe, expect, it } from "vitest";
import { analyticsFor } from "./analytics.js";
import type { Game } from "./library.js";

const game = (appid: string, minutes: number, lastPlayed: number | null = null, bytes: number | null = null): Game => ({
  appid,
  name: `Game ${appid}`,
  minutes,
  lastPlayed,
  bytes,
  installed: bytes !== null,
});

describe("analyticsFor", () => {
  it("computes utilization and playtime concentration from observed playtime", () => {
    const result = analyticsFor([
      game("1", 6000),
      game("2", 3000),
      game("3", 1000),
      game("4", 0),
    ]);

    expect(result.utilizationPercent).toBe(75);
    expect(result.untouchedPercent).toBe(25);
    expect(result.topGameSharePercent).toBe(60);
    expect(result.topThreeSharePercent).toBe(100);
    expect(result.medianPlayedHours).toBe(50);
  });

  it("keeps disk analytics unavailable when there is no known disk data", () => {
    const result = analyticsFor([game("1", 120), game("2", 0)]);
    expect(result.knownDiskShareUntouchedPercent).toBeNull();
  });

  it("uses only known installed bytes for the untouched disk share", () => {
    const result = analyticsFor([
      game("1", 120, null, 300),
      game("2", 0, null, 100),
    ]);
    expect(result.knownDiskShareUntouchedPercent).toBe(25);
  });

  it("only exposes recent-activity buckets when last-played data exists", () => {
    const now = 2_000_000_000;
    expect(analyticsFor([game("1", 60)], now).recentActivity).toBeNull();

    const result = analyticsFor([
      game("1", 60, now - 10 * 86400),
      game("2", 60, now - 90 * 86400),
      game("3", 60, now - 300 * 86400),
      game("4", 60, now - 500 * 86400),
    ], now);

    expect(result.recentActivity?.map((bucket) => bucket.count)).toEqual([1, 1, 1, 1]);
  });
});
