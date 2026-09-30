import type { Game } from "./library.js";

export interface SteamProfileSummary {
  steamid: string;
  name: string | null;
  avatar: string | null;
  profileUrl: string | null;
}

export interface PublicSteamLibrary {
  steamid: string;
  gameCount: number;
  profile: SteamProfileSummary;
  games: Game[];
}

interface ApiLibrary {
  steamid?: string;
  gameCount?: number;
  profile?: Partial<SteamProfileSummary>;
  error?: string;
  games?: { appid: string; name: string | null; minutes: number }[];
}

export async function fetchPublicSteamLibrary(profile: string): Promise<PublicSteamLibrary> {
  const response = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile.trim())}`);
  const data = await response.json().catch(() => null) as ApiLibrary | null;

  if (!data) {
    throw new Error("Public Steam import needs the Cloudflare Workers deployment. The local-file reader still works here.");
  }
  if (!response.ok || !data.games || !data.steamid) {
    throw new Error(data.error ?? "Steam import failed.");
  }

  return {
    steamid: data.steamid,
    gameCount: data.gameCount ?? data.games.length,
    profile: {
      steamid: data.steamid,
      name: data.profile?.name ?? null,
      avatar: data.profile?.avatar ?? null,
      profileUrl: data.profile?.profileUrl ?? null,
    },
    games: data.games.map((game) => ({
      ...game,
      lastPlayed: null,
      bytes: null,
      installed: false,
    })),
  };
}

function cleanBase(current: string): URL {
  const url = new URL(current);
  url.search = "";
  url.hash = "";
  return url;
}

export function steamShareUrl(current: string, steamid: string): string {
  const url = cleanBase(current);
  url.searchParams.set("steam", steamid);
  url.hash = "steam";
  return url.toString();
}

export function comparisonShareUrl(current: string, leftSteamId: string, rightSteamId: string): string {
  const url = cleanBase(current);
  url.searchParams.set("compare", `${leftSteamId},${rightSteamId}`);
  url.hash = "compare";
  return url.toString();
}

export function sharedSteamFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("steam");
  return value && /^\d{17}$/.test(value) ? value : null;
}

export function sharedComparisonFromSearch(search: string): [string, string] | null {
  const value = new URLSearchParams(search).get("compare");
  if (!value) return null;
  const [left, right, extra] = value.split(",");
  if (extra || !left || !right || !/^\d{17}$/.test(left) || !/^\d{17}$/.test(right)) return null;
  return [left, right];
}
