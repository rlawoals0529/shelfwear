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
    caption: `a hand-picked shelf of ${Math.min(9, shelf.games.length)} ${shelf.games.length === 1 ? "game" : "games"}`,
    games: shelf.games.slice(0, 9),
  };
}
