/**
 * Turning Steam's files into rows, and rows into the few figures worth reading.
 *
 * Two files matter. `localconfig.vdf` knows how long you have played each app and when you
 * last did. `appmanifest_<id>.acf`, one per installed game, knows its name and what it is
 * taking up on disk. Neither knows everything, so what a row is missing is carried as
 * missing rather than as zero.
 */
import { parseVdf, dig, children, type VdfNode } from "./vdf.js";

export interface Game {
  appid: string;
  /** Only known for games with a manifest, so an uninstalled one has none. */
  name: string | null;
  /** Minutes. Zero is a real answer: owned and never launched. */
  minutes: number;
  /** Unix seconds, or null when the client has never recorded a launch. */
  lastPlayed: number | null;
  /** Bytes on disk. Null when the game is not installed, which is not the same as 0. */
  bytes: number | null;
  installed: boolean;
}

const int = (v: unknown): number | null => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Playtime and last-played, keyed by appid, from a `localconfig.vdf`. */
export function readLocalConfig(text: string): Map<string, { minutes: number; lastPlayed: number | null }> {
  const root = parseVdf(text);
  const apps = dig(root, "UserLocalConfigStore", "Software", "Valve", "Steam", "apps");
  const out = new Map<string, { minutes: number; lastPlayed: number | null }>();
  for (const [appid, node] of children(apps)) {
    // Steam has used both spellings. Reading only one of them reports a library of zeroes
    // on half the machines it runs on.
    const minutes = int(dig(node, "playtime")) ?? int(dig(node, "playTime")) ?? 0;
    const last = int(dig(node, "LastPlayed"));
    out.set(appid, { minutes, lastPlayed: last && last > 0 ? last : null });
  }
  return out;
}

/** Name and size from one `appmanifest_<id>.acf`. Returns null if it is not one. */
export function readManifest(text: string): { appid: string; name: string; bytes: number | null } | null {
  let root: VdfNode;
  try { root = parseVdf(text); } catch { return null; }
  const state = dig(root, "AppState");
  const appid = dig(state, "appid");
  const name = dig(state, "name");
  if (typeof appid !== "string" || typeof name !== "string") return null;
  return { appid, name, bytes: int(dig(state, "SizeOnDisk")) };
}

/**
 * Combine what the two kinds of file know.
 *
 * A game can appear in one and not the other: installed but never launched has a manifest
 * and no playtime; played then uninstalled has playtime and no manifest. Both are rows.
 */
export function buildLibrary(
  play: Map<string, { minutes: number; lastPlayed: number | null }>,
  manifests: { appid: string; name: string; bytes: number | null }[],
): Game[] {
  const byId = new Map(manifests.map((m) => [m.appid, m]));
  const ids = new Set([...play.keys(), ...byId.keys()]);

  return [...ids]
    .map((appid) => {
      const p = play.get(appid);
      const m = byId.get(appid);
      return {
        appid,
        name: m?.name ?? null,
        minutes: p?.minutes ?? 0,
        lastPlayed: p?.lastPlayed ?? null,
        bytes: m?.bytes ?? null,
        installed: m !== undefined,
      };
    })
    .sort((a, b) => b.minutes - a.minutes || a.appid.localeCompare(b.appid));
}

export interface Stats {
  games: number;
  played: number;
  neverPlayed: number;
  totalMinutes: number;
  installedBytes: number;
  /** Disk held by games that have never been launched. The backlog, in gigabytes. */
  unplayedBytes: number;
  /** How many titles it takes to reach half of all your hours. */
  halfOfHoursIn: number;
  /** True when some installed game reports no size, so the byte totals are a floor. */
  sizeIsPartial: boolean;
  unknownSize: number;
}

export function summarise(games: Game[]): Stats {
  const totalMinutes = games.reduce((n, g) => n + g.minutes, 0);
  const played = games.filter((g) => g.minutes > 0);
  const installed = games.filter((g) => g.installed);
  const unknownSize = installed.filter((g) => g.bytes === null).length;

  // How concentrated the hours are. Sorted descending already, so this walks the top down
  // until it has half the total. It is usually a much smaller number than people expect.
  let running = 0, halfOfHoursIn = 0;
  for (const g of [...games].sort((a, b) => b.minutes - a.minutes)) {
    if (running >= totalMinutes / 2) break;
    running += g.minutes;
    halfOfHoursIn++;
  }

  return {
    games: games.length,
    played: played.length,
    neverPlayed: games.length - played.length,
    totalMinutes,
    installedBytes: installed.reduce((n, g) => n + (g.bytes ?? 0), 0),
    unplayedBytes: installed.filter((g) => g.minutes === 0).reduce((n, g) => n + (g.bytes ?? 0), 0),
    halfOfHoursIn: totalMinutes > 0 ? halfOfHoursIn : 0,
    sizeIsPartial: unknownSize > 0,
    unknownSize,
  };
}

export const hours = (minutes: number): number => Math.round((minutes / 60) * 10) / 10;
export const gb = (bytes: number): number => Math.round((bytes / 1_073_741_824) * 10) / 10;
