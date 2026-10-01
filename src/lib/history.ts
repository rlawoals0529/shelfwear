import type { Game } from "./library.js";

export interface ShelfHistorySnapshot {
  at: number;
  gameCount: number;
  playedCount: number;
  totalMinutes: number;
  /** Compact [appid, lifetime minutes] pairs. Names come from the currently loaded library. */
  games: Array<[string, number]>;
}

export interface ShelfHistoryRecord {
  steamid: string;
  enabledAt: number;
  lastCheckedAt: number;
  snapshots: ShelfHistorySnapshot[];
}

export interface ShelfHistoryThreshold {
  appid: string;
  hours: 2 | 10 | 50 | 100;
  fromMinutes: number;
  toMinutes: number;
}

export interface ShelfHistoryDelta {
  fromAt: number;
  toAt: number;
  minutesDelta: number;
  gamesDelta: number;
  newlyOwned: string[];
  newlyPlayed: string[];
  thresholds: ShelfHistoryThreshold[];
  changed: boolean;
}

export const SHELF_HISTORY_KEY_PREFIX = "shelfwear:shelf-history:v1:";
export const MAX_SHELF_HISTORY_SNAPSHOTS = 8;

const THRESHOLDS = [
  [2, 120],
  [10, 600],
  [50, 3000],
  [100, 6000],
] as const;

const cleanTime = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

export function makeShelfHistorySnapshot(games: Game[], at: number): ShelfHistorySnapshot {
  const compact = games
    .map((game) => [game.appid, Math.max(0, Math.round(game.minutes))] as [string, number])
    .filter(([appid]) => /^\d+$/.test(appid))
    .sort((a, b) => a[0].localeCompare(b[0]));

  return {
    at: cleanTime(at),
    gameCount: compact.length,
    playedCount: compact.filter(([, minutes]) => minutes > 0).length,
    totalMinutes: compact.reduce((sum, [, minutes]) => sum + minutes, 0),
    games: compact,
  };
}

function snapshotMap(snapshot: ShelfHistorySnapshot): Map<string, number> {
  return new Map(snapshot.games);
}

function snapshotsEqual(left: ShelfHistorySnapshot, right: ShelfHistorySnapshot): boolean {
  if (
    left.gameCount !== right.gameCount
    || left.playedCount !== right.playedCount
    || left.totalMinutes !== right.totalMinutes
    || left.games.length !== right.games.length
  ) return false;

  return left.games.every(([appid, minutes], index) =>
    right.games[index]?.[0] === appid && right.games[index]?.[1] === minutes
  );
}

export function diffShelfHistory(
  previous: ShelfHistorySnapshot,
  current: ShelfHistorySnapshot,
): ShelfHistoryDelta {
  const before = snapshotMap(previous);
  const after = snapshotMap(current);
  const newlyOwned: string[] = [];
  const newlyPlayed: string[] = [];
  const thresholds: ShelfHistoryThreshold[] = [];

  for (const [appid, minutes] of after) {
    const prior = before.get(appid);
    if (prior === undefined) {
      newlyOwned.push(appid);
      if (minutes > 0) newlyPlayed.push(appid);
      continue;
    }

    if (prior === 0 && minutes > 0) newlyPlayed.push(appid);
    for (const [hours, thresholdMinutes] of THRESHOLDS) {
      if (prior < thresholdMinutes && minutes >= thresholdMinutes) {
        thresholds.push({ appid, hours, fromMinutes: prior, toMinutes: minutes });
      }
    }
  }

  return {
    fromAt: previous.at,
    toAt: current.at,
    minutesDelta: current.totalMinutes - previous.totalMinutes,
    gamesDelta: current.gameCount - previous.gameCount,
    newlyOwned,
    newlyPlayed,
    thresholds,
    changed: !snapshotsEqual(previous, current),
  };
}

export function startShelfHistory(steamid: string, games: Game[], at = Date.now()): ShelfHistoryRecord {
  if (!/^\d{17}$/.test(steamid)) throw new Error("Shelf history needs a resolved public SteamID.");
  const snapshot = makeShelfHistorySnapshot(games, at);
  return {
    steamid,
    enabledAt: snapshot.at,
    lastCheckedAt: snapshot.at,
    snapshots: [snapshot],
  };
}

export function recordShelfHistoryVisit(
  record: ShelfHistoryRecord,
  games: Game[],
  at = Date.now(),
): { record: ShelfHistoryRecord; delta: ShelfHistoryDelta } {
  const current = makeShelfHistorySnapshot(games, at);
  const previous = record.snapshots[record.snapshots.length - 1]
    ?? makeShelfHistorySnapshot([], record.enabledAt);
  const delta = diffShelfHistory(previous, current);
  const snapshots = delta.changed
    ? [...record.snapshots, current].slice(-MAX_SHELF_HISTORY_SNAPSHOTS)
    : record.snapshots;

  return {
    record: {
      ...record,
      lastCheckedAt: current.at,
      snapshots,
    },
    delta,
  };
}

function normaliseSnapshot(value: unknown): ShelfHistorySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const at = cleanTime(input.at);
  if (!at || !Array.isArray(input.games)) return null;

  const games: Array<[string, number]> = [];
  const seen = new Set<string>();
  for (const row of input.games) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const appid = typeof row[0] === "string" ? row[0] : "";
    const minutes = cleanTime(row[1]);
    if (!/^\d+$/.test(appid) || seen.has(appid)) continue;
    seen.add(appid);
    games.push([appid, minutes]);
  }
  games.sort((a, b) => a[0].localeCompare(b[0]));

  return {
    at,
    gameCount: games.length,
    playedCount: games.filter(([, minutes]) => minutes > 0).length,
    totalMinutes: games.reduce((sum, [, minutes]) => sum + minutes, 0),
    games,
  };
}

export function normaliseShelfHistory(value: unknown, steamid: string): ShelfHistoryRecord | null {
  if (!/^\d{17}$/.test(steamid) || !value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.steamid !== steamid) return null;

  const snapshots = Array.isArray(input.snapshots)
    ? input.snapshots
      .map(normaliseSnapshot)
      .filter((snapshot): snapshot is ShelfHistorySnapshot => Boolean(snapshot))
      .sort((a, b) => a.at - b.at)
      .slice(-MAX_SHELF_HISTORY_SNAPSHOTS)
    : [];
  if (!snapshots.length) return null;

  const enabledAt = cleanTime(input.enabledAt) || snapshots[0]!.at;
  const lastCheckedAt = Math.max(cleanTime(input.lastCheckedAt), snapshots[snapshots.length - 1]!.at);

  return { steamid, enabledAt, lastCheckedAt, snapshots };
}

export function readShelfHistory(steamid: string): ShelfHistoryRecord | null {
  if (!/^\d{17}$/.test(steamid)) return null;
  try {
    const raw = window.localStorage.getItem(SHELF_HISTORY_KEY_PREFIX + steamid);
    return raw ? normaliseShelfHistory(JSON.parse(raw), steamid) : null;
  } catch {
    return null;
  }
}

export function writeShelfHistory(record: ShelfHistoryRecord): void {
  try {
    const normalised = normaliseShelfHistory(record, record.steamid);
    if (!normalised) return;
    window.localStorage.setItem(SHELF_HISTORY_KEY_PREFIX + record.steamid, JSON.stringify(normalised));
  } catch {
    // Browser storage is optional. Shelfwear keeps working without history persistence.
  }
}

export function clearShelfHistory(steamid: string): void {
  try {
    window.localStorage.removeItem(SHELF_HISTORY_KEY_PREFIX + steamid);
  } catch {
    // Nothing else in the app should fail because localStorage is unavailable.
  }
}
