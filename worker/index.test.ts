import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Achievement Cabinet Worker route", () => {
  it("rejects malformed IDs before contacting Steam", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://example.com/api/steam/achievements?steamid=bad&appid=10", {
        headers: { Origin: "https://rlawoals0529.github.io" },
      }),
      { STEAM_WEB_API_KEY: "test-key" },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://rlawoals0529.github.io");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("combines player, schema, and global rarity data without storing it", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.includes("GetPlayerAchievements")) {
        return new Response(JSON.stringify({
          playerstats: {
            steamID: "76561198000000000",
            gameName: "Shared Quest",
            success: true,
            achievements: [
              { apiname: "ACH_ONE", achieved: 1, unlocktime: 1700000000 },
              { apiname: "ACH_TWO", achieved: 0, unlocktime: 0 },
            ],
          },
        }), { status: 200 });
      }

      if (url.pathname.includes("GetSchemaForGame")) {
        return new Response(JSON.stringify({
          game: {
            availableGameStats: {
              achievements: [
                {
                  name: "ACH_ONE",
                  displayName: "First Step",
                  description: "Do the first thing.",
                  hidden: 0,
                  icon: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/10/one.jpg",
                  icongray: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/10/one_gray.jpg",
                },
                {
                  name: "ACH_TWO",
                  displayName: "Locked Step",
                  description: "Still locked.",
                  hidden: 1,
                  icon: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/10/two.jpg",
                  icongray: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/10/two_gray.jpg",
                },
              ],
            },
          },
        }), { status: 200 });
      }

      if (url.pathname.includes("GetGlobalAchievementPercentagesForApp")) {
        return new Response(JSON.stringify({
          achievementpercentages: {
            achievements: [
              { name: "ACH_ONE", percent: 12.345 },
              { name: "ACH_TWO", percent: 1.2 },
            ],
          },
        }), { status: 200 });
      }

      throw new Error("unexpected Steam URL " + url.toString());
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://example.com/api/steam/achievements?steamid=76561198000000000&appid=10", {
        headers: { Origin: "https://rlawoals0529.github.io" },
      }),
      { STEAM_WEB_API_KEY: "test-key" },
    );
    const body = await response.json() as {
      unlocked: number;
      total: number;
      completionPercent: number;
      achievements: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ unlocked: 1, total: 2, completionPercent: 50 });
    expect(body.achievements[0]).toMatchObject({
      apiName: "ACH_ONE",
      name: "First Step",
      description: "Do the first thing.",
      achieved: true,
      unlockTime: 1700000000,
      globalPercent: 12.35,
      hidden: false,
    });
    expect(body.achievements[1]).toMatchObject({
      name: "Locked Step",
      achieved: false,
      hidden: true,
      globalPercent: 1.2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});


describe("Recently Played Worker route", () => {
  it("rejects malformed SteamIDs before contacting Steam", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://example.com/api/steam/recent?steamid=bad", {
        headers: { Origin: "https://rlawoals0529.github.io" },
      }),
      { STEAM_WEB_API_KEY: "test-key" },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://rlawoals0529.github.io");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Steam recent activity without inventing timestamps", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toContain("GetRecentlyPlayedGames");
      expect(url.searchParams.get("steamid")).toBe("76561198000000000");
      expect(url.searchParams.get("count")).toBe("12");

      return new Response(JSON.stringify({
        response: {
          total_count: 2,
          games: [
            {
              appid: 10,
              name: "Recent Quest",
              playtime_forever: 600,
              playtime_2weeks: 90,
              img_icon_url: "0123456789abcdef0123456789abcdef01234567",
            },
            {
              appid: 20,
              name: "Another Game",
              playtime_forever: 120,
            },
          ],
        },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://example.com/api/steam/recent?steamid=76561198000000000", {
        headers: { Origin: "https://rlawoals0529.github.io" },
      }),
      { STEAM_WEB_API_KEY: "test-key" },
    );
    const body = await response.json() as {
      steamid: string;
      totalCount: number;
      games: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ steamid: "76561198000000000", totalCount: 2 });
    expect(body.games[0]).toMatchObject({
      appid: "10",
      name: "Recent Quest",
      totalMinutes: 600,
      twoWeekMinutes: 90,
      iconHash: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(body.games[1]).toMatchObject({
      appid: "20",
      totalMinutes: 120,
      twoWeekMinutes: null,
    });
    expect(body.games[0]).not.toHaveProperty("lastPlayed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows an empty recent list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ response: { total_count: 0 } }), { status: 200 })
    ));

    const response = await worker.fetch(
      new Request("https://example.com/api/steam/recent?steamid=76561198000000000"),
      { STEAM_WEB_API_KEY: "test-key" },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ totalCount: 0, games: [] });
  });
});
