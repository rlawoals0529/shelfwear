import type { Game } from "./library.js";

export interface CustomShelfGame {
  appid: string;
  name: string;
  iconHash?: string | null;
  note?: string;
}

export interface CustomShelf {
  id: string;
  name: string;
  games: CustomShelfGame[];
  createdAt: number;
  updatedAt: number;
}

export const CUSTOM_SHELVES_KEY = "shelfwear:custom-shelves:v1";
export const MAX_CUSTOM_SHELVES = 12;
export const MAX_CUSTOM_SHELF_GAMES = 50;

export function customShelfGamesFromLibrary(games: readonly Game[]): CustomShelfGame[] {
  const compact: CustomShelfGame[] = [];
  const seen = new Set<string>();

  for (const game of games) {
    if (seen.has(game.appid)) continue;
    seen.add(game.appid);
    compact.push({
      appid: game.appid,
      name: game.name ?? `app ${game.appid}`,
      ...(game.iconHash ? { iconHash: game.iconHash } : {}),
    });
    if (compact.length >= MAX_CUSTOM_SHELF_GAMES) break;
  }

  return compact;
}

export type CustomShelfBulkPlacement = "top" | "bottom";

export function moveSelectedCustomShelfGames(
  games: readonly CustomShelfGame[],
  selectedAppIds: Iterable<string>,
  placement: CustomShelfBulkPlacement,
): CustomShelfGame[] {
  const selected = new Set(selectedAppIds);
  const chosen: CustomShelfGame[] = [];
  const rest: CustomShelfGame[] = [];

  for (const game of games) {
    (selected.has(game.appid) ? chosen : rest).push(game);
  }

  return placement === "top" ? [...chosen, ...rest] : [...rest, ...chosen];
}

export function removeSelectedCustomShelfGames(
  games: readonly CustomShelfGame[],
  selectedAppIds: Iterable<string>,
): CustomShelfGame[] {
  const selected = new Set(selectedAppIds);
  return games.filter((game) => !selected.has(game.appid));
}

export type CustomShelfTransferMode = "copy" | "move";

export interface CustomShelfTransferOutcome {
  shelves: CustomShelf[];
  addedAppIds: string[];
  duplicateAppIds: string[];
  capacityBlockedAppIds: string[];
}

export function transferSelectedCustomShelfGames(
  shelves: readonly CustomShelf[],
  sourceShelfId: string,
  targetShelfId: string,
  selectedAppIds: Iterable<string>,
  mode: CustomShelfTransferMode,
): CustomShelfTransferOutcome {
  const selected = new Set(selectedAppIds);
  if (!selected.size || sourceShelfId === targetShelfId) {
    return { shelves: [...shelves], addedAppIds: [], duplicateAppIds: [], capacityBlockedAppIds: [] };
  }

  const source = shelves.find((shelf) => shelf.id === sourceShelfId);
  const target = shelves.find((shelf) => shelf.id === targetShelfId);
  if (!source || !target) {
    return { shelves: [...shelves], addedAppIds: [], duplicateAppIds: [], capacityBlockedAppIds: [] };
  }

  const targetIds = new Set(target.games.map((game) => game.appid));
  const added: CustomShelfGame[] = [];
  const addedAppIds: string[] = [];
  const duplicateAppIds: string[] = [];
  const capacityBlockedAppIds: string[] = [];
  let room = Math.max(0, MAX_CUSTOM_SHELF_GAMES - target.games.length);

  for (const game of source.games) {
    if (!selected.has(game.appid)) continue;
    if (targetIds.has(game.appid)) {
      duplicateAppIds.push(game.appid);
      continue;
    }
    if (room <= 0) {
      capacityBlockedAppIds.push(game.appid);
      continue;
    }
    added.push({ ...game });
    addedAppIds.push(game.appid);
    targetIds.add(game.appid);
    room -= 1;
  }

  if (!added.length) {
    return {
      shelves: [...shelves],
      addedAppIds,
      duplicateAppIds,
      capacityBlockedAppIds,
    };
  }

  const moved = new Set(addedAppIds);
  const nextShelves = shelves.map((shelf) => {
    if (shelf.id === targetShelfId) {
      return { ...shelf, games: [...shelf.games, ...added] };
    }
    if (mode === "move" && shelf.id === sourceShelfId) {
      return { ...shelf, games: shelf.games.filter((game) => !moved.has(game.appid)) };
    }
    return shelf;
  });

  return { shelves: nextShelves, addedAppIds, duplicateAppIds, capacityBlockedAppIds };
}

export const CUSTOM_SHELF_PRESETS = [
  { id: "comfort", name: "Comfort games" },
  { id: "playing", name: "Currently playing" },
  { id: "childhood", name: "Childhood favorites" },
  { id: "backlog", name: "Backlog" },
  { id: "multiplayer", name: "Multiplayer" },
] as const;

const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const cleanTime = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export function cleanShelfName(value: unknown): string {
  return cleanText(value, 40);
}

export function normaliseCustomShelfGame(value: unknown): CustomShelfGame | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const appid = cleanText(input.appid, 24);
  const name = cleanText(input.name, 80);
  if (!/^\d+$/.test(appid) || !name) return null;

  const iconHash = typeof input.iconHash === "string" && /^[a-f0-9]{40}$/i.test(input.iconHash)
    ? input.iconHash
    : null;
  const note = cleanText(input.note, 80);

  return {
    appid,
    name,
    ...(iconHash ? { iconHash } : {}),
    ...(note ? { note } : {}),
  };
}

export function normaliseCustomShelf(value: unknown): CustomShelf | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const id = cleanText(input.id, 80);
  const name = cleanShelfName(input.name);
  if (!id || !name) return null;

  const games: CustomShelfGame[] = [];
  const seen = new Set<string>();
  if (Array.isArray(input.games)) {
    for (const candidate of input.games) {
      const game = normaliseCustomShelfGame(candidate);
      if (!game || seen.has(game.appid)) continue;
      seen.add(game.appid);
      games.push(game);
      if (games.length >= MAX_CUSTOM_SHELF_GAMES) break;
    }
  }

  const createdAt = cleanTime(input.createdAt);
  const updatedAt = Math.max(createdAt, cleanTime(input.updatedAt));

  return { id, name, games, createdAt, updatedAt };
}

export function normaliseCustomShelves(value: unknown): CustomShelf[] {
  if (!Array.isArray(value)) return [];
  const shelves: CustomShelf[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    const shelf = normaliseCustomShelf(candidate);
    if (!shelf || seen.has(shelf.id)) continue;
    seen.add(shelf.id);
    shelves.push(shelf);
    if (shelves.length >= MAX_CUSTOM_SHELVES) break;
  }

  return shelves;
}

export function readCustomShelves(): CustomShelf[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_SHELVES_KEY);
    return raw ? normaliseCustomShelves(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeCustomShelves(shelves: CustomShelf[]): void {
  try {
    window.localStorage.setItem(CUSTOM_SHELVES_KEY, JSON.stringify(normaliseCustomShelves(shelves)));
  } catch {
    // Persistence is a browser convenience; Shelfwear still works if storage is unavailable.
  }
}

export function shelfStoryFromCustomShelf(shelf: CustomShelf): {
  title: string;
  caption: string;
  games: CustomShelfGame[];
} {
  return {
    title: shelf.name,
    caption: `a hand-picked shelf of ${Math.min(9, shelf.games.length)} ${Math.min(9, shelf.games.length) === 1 ? "game" : "games"}`,
    games: shelf.games.slice(0, 9).map((game) => ({
      ...game,
      ...(game.note ? { note: game.note.slice(0, 42) } : {}),
    })),
  };
}


export interface CustomShelvesBackup {
  schema: "shelfwear.custom-shelves.v1";
  exportedAt: string;
  shelves: CustomShelf[];
}

export function customShelvesBackupObject(
  shelves: readonly CustomShelf[],
  exportedAt = new Date().toISOString(),
): CustomShelvesBackup {
  return {
    schema: "shelfwear.custom-shelves.v1",
    exportedAt,
    shelves: normaliseCustomShelves(shelves),
  };
}

export function customShelvesBackupText(
  shelves: readonly CustomShelf[],
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(customShelvesBackupObject(shelves, exportedAt), null, 2) + "\n";
}

export function parseCustomShelvesBackup(text: string): CustomShelvesBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  if (!value || typeof value !== "object") {
    throw new Error("That file is not a Shelfwear shelves backup.");
  }

  const input = value as Record<string, unknown>;
  if (input.schema !== "shelfwear.custom-shelves.v1") {
    throw new Error("Unsupported Shelfwear shelves backup version.");
  }

  if (!Array.isArray(input.shelves)) {
    throw new Error("This backup does not contain a shelves list.");
  }

  const shelves = normaliseCustomShelves(input.shelves);
  const hadCandidates = input.shelves.length > 0;
  if (hadCandidates && shelves.length === 0) {
    throw new Error("No valid Shelfwear shelves were found in this backup.");
  }

  const exportedAt = typeof input.exportedAt === "string" && input.exportedAt.trim()
    ? input.exportedAt.trim().slice(0, 80)
    : "";

  return {
    schema: "shelfwear.custom-shelves.v1",
    exportedAt,
    shelves,
  };
}

export function customShelvesBackupFilename(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `shelfwear-my-shelves-${date}.json`;
}


export function nextDuplicateShelfName(name: string, existingNames: readonly string[]): string {
  const used = new Set(existingNames.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const base = cleanShelfName(name) || "Shelf";

  for (let copy = 1; copy <= MAX_CUSTOM_SHELVES + 1; copy++) {
    const suffix = copy === 1 ? " copy" : ` copy ${copy}`;
    const room = Math.max(1, 40 - suffix.length);
    const candidate = cleanShelfName(base.slice(0, room) + suffix);
    if (candidate && !used.has(candidate.toLowerCase())) return candidate;
  }

  return cleanShelfName(base.slice(0, 32) + " duplicate") || "Shelf copy";
}


export function customShelfShareText(shelf: CustomShelf): string {
  const heading = shelf.name;
  const games = shelf.games.map((game, index) => `${index + 1}. ${game.name}`);
  const body = games.length ? games.join("\n") : "No games filed yet.";
  return `${heading}\n\n${body}\n\nMade with Shelfwear`;
}
