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

export interface SteamAchievement {
  apiName: string;
  name: string;
  description: string | null;
  achieved: boolean;
  unlockTime: number | null;
  globalPercent: number | null;
  hidden: boolean;
  icon: string | null;
}

export interface SteamAchievementCabinet {
  steamid: string;
  appid: string;
  gameName: string | null;
  total: number;
  unlocked: number;
  completionPercent: number;
  achievements: SteamAchievement[];
}

export const STEAM_PROFILE_PREFIX = "https://steamcommunity.com/id/";
export const SHELFWEAR_WORKER_ORIGIN = "https://shelfwear.rlawoals0529.workers.dev";

export function steamApiUrl(path: string, hostname = typeof window === "undefined" ? "" : window.location.hostname): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return hostname.toLowerCase().endsWith("github.io")
    ? `${SHELFWEAR_WORKER_ORIGIN}${normalizedPath}`
    : normalizedPath;
}

export function normaliseSteamProfileInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === STEAM_PROFILE_PREFIX) return "";
  if (/^\d{17}$/.test(trimmed) || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9_-]{2,64}$/.test(trimmed)) return `${STEAM_PROFILE_PREFIX}${trimmed}`;
  return trimmed;
}

export function hasSteamProfileInput(value: string): boolean {
  return normaliseSteamProfileInput(value).length > 0;
}

interface ApiLibrary {
  steamid?: string;
  gameCount?: number;
  profile?: Partial<SteamProfileSummary>;
  error?: string;
  games?: { appid: string; name: string | null; minutes: number; iconHash?: string | null }[];
}

export async function fetchPublicSteamLibrary(profile: string): Promise<PublicSteamLibrary> {
  const normalized = normaliseSteamProfileInput(profile);
  if (!normalized) throw new Error("Add your Steam username, profile URL, or SteamID.");
  const response = await fetch(steamApiUrl(`/api/steam/library?profile=${encodeURIComponent(normalized)}`));
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

interface ApiAchievements extends Partial<SteamAchievementCabinet> {
  error?: string;
}

export async function fetchSteamAchievements(steamid: string, appid: string): Promise<SteamAchievementCabinet> {
  if (!/^\d{17}$/.test(steamid)) throw new Error("Achievement Cabinet needs a resolved public SteamID.");
  if (!/^\d{1,10}$/.test(appid)) throw new Error("Achievement Cabinet needs a numeric Steam AppID.");

  const query = new URLSearchParams({ steamid, appid });
  const response = await fetch(steamApiUrl(`/api/steam/achievements?${query.toString()}`));
  const data = await response.json().catch(() => null) as ApiAchievements | null;

  if (!data) throw new Error("Steam achievement data is unavailable on this deployment.");
  if (!response.ok || !Array.isArray(data.achievements)) {
    throw new Error(data.error ?? "Steam achievements are unavailable for this game.");
  }

  return {
    steamid,
    appid,
    gameName: typeof data.gameName === "string" ? data.gameName : null,
    total: typeof data.total === "number" ? data.total : data.achievements.length,
    unlocked: typeof data.unlocked === "number" ? data.unlocked : data.achievements.filter((achievement) => achievement.achieved).length,
    completionPercent: typeof data.completionPercent === "number" ? data.completionPercent : 0,
    achievements: data.achievements.map((achievement) => ({
      apiName: String(achievement.apiName ?? ""),
      name: String(achievement.name ?? achievement.apiName ?? "Achievement"),
      description: typeof achievement.description === "string" ? achievement.description : null,
      achieved: achievement.achieved === true,
      unlockTime: typeof achievement.unlockTime === "number" && achievement.unlockTime > 0 ? achievement.unlockTime : null,
      globalPercent: typeof achievement.globalPercent === "number" && Number.isFinite(achievement.globalPercent)
        ? achievement.globalPercent
        : null,
      hidden: achievement.hidden === true,
      icon: typeof achievement.icon === "string" ? achievement.icon : null,
    })).filter((achievement) => achievement.apiName),
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

export function inviteShareUrl(current: string, inviterSteamId: string): string {
  const url = cleanBase(current);
  url.searchParams.set("invite", inviterSteamId);
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

export function sharedInviteFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("invite");
  return value && /^\d{17}$/.test(value) ? value : null;
}
