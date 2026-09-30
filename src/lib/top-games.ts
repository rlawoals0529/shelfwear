export interface CuratedGame {
  name: string;
  appid: string | null;
  /** Official Steam community icon hash; optional, public, and only used as an artwork fallback. */
  iconHash?: string | null;
}

export interface CuratedTopGames {
  title: string;
  caption: string;
  games: CuratedGame[];
}

export interface ShelfStoryPreset {
  id: string;
  title: string;
  caption: string;
  prompt: string;
}

export const SHELF_STORY_PRESETS: readonly ShelfStoryPreset[] = [
  {
    id: "shaped-me",
    title: "games that shaped me",
    caption: "the games that became part of my gaming history",
    prompt: "The games that left a mark, changed your taste, or simply stayed with you.",
  },
  {
    id: "comfort",
    title: "my comfort games",
    caption: "the ones I always know I can come back to",
    prompt: "Familiar worlds, reliable favorites, and the games that feel easy to return to.",
  },
  {
    id: "obsessed",
    title: "currently obsessed",
    caption: "what has my attention right now",
    prompt: "Your current rotation, fixation, or the games taking over your free time lately.",
  },
  {
    id: "childhood",
    title: "childhood favorites",
    caption: "the games I still remember exactly how they felt",
    prompt: "Old favorites, formative memories, and the games tied to a particular time in your life.",
  },
  {
    id: "multiplayer",
    title: "multiplayer memories",
    caption: "the games that were better because of who I played with",
    prompt: "Co-op campaigns, late-night queues, party games, and anything inseparable from friends.",
  },
  {
    id: "first-time",
    title: "play again for the first time",
    caption: "the experiences I wish I could discover all over again",
    prompt: "Games whose surprises, worlds, stories, or first hours you would love to experience fresh.",
  },
] as const;

export const CURATED_LIMIT = 9;
const TITLE_LIMIT = 48;
const CAPTION_LIMIT = 120;
const GAME_NAME_LIMIT = 80;

const clean = (value: string, max: number): string =>
  value.replace(/\s+/g, " ").trim().slice(0, max);

export function steamAppIdFromInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{1,10}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)steampowered\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/app\/(\d{1,10})(?:\/|$)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function normaliseCuratedTopGames(input: Partial<CuratedTopGames>): CuratedTopGames {
  const title = clean(input.title ?? "", TITLE_LIMIT) || "shelf story";
  const caption = clean(input.caption ?? "", CAPTION_LIMIT);
  const seen = new Set<string>();
  const games: CuratedGame[] = [];

  for (const raw of input.games ?? []) {
    if (games.length >= CURATED_LIMIT) break;
    const name = clean(raw?.name ?? "", GAME_NAME_LIMIT);
    if (!name) continue;
    const appid = raw?.appid && /^\d{1,10}$/.test(raw.appid) ? raw.appid : null;
    const iconHash = raw?.iconHash && /^[a-f0-9]{40}$/i.test(raw.iconHash) ? raw.iconHash.toLowerCase() : null;
    const key = `${name.toLowerCase()}\u0000${appid ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    games.push({ name, appid, iconHash });
  }

  return { title, caption, games };
}

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function encodeCuratedTopGames(input: CuratedTopGames): string {
  const list = normaliseCuratedTopGames(input);
  const compact = {
    t: list.title,
    c: list.caption || undefined,
    g: list.games.map((game) =>
      game.appid
        ? (game.iconHash ? [game.name, game.appid, game.iconHash] : [game.name, game.appid])
        : [game.name],
    ),
  };
  return toBase64Url(JSON.stringify(compact));
}

export function decodeCuratedTopGames(value: string | null | undefined): CuratedTopGames | null {
  if (!value || value.length > 4096) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as {
      t?: unknown;
      c?: unknown;
      g?: unknown;
    };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.g)) return null;
    const games = parsed.g.map((entry): CuratedGame | null => {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") return null;
      const appid = typeof entry[1] === "string" && /^\d{1,10}$/.test(entry[1]) ? entry[1] : null;
      const iconHash = typeof entry[2] === "string" && /^[a-f0-9]{40}$/i.test(entry[2])
        ? entry[2].toLowerCase()
        : null;
      return { name: entry[0], appid, iconHash };
    }).filter((game): game is CuratedGame => game !== null);

    return normaliseCuratedTopGames({
      title: typeof parsed.t === "string" ? parsed.t : "shelf story",
      caption: typeof parsed.c === "string" ? parsed.c : "",
      games,
    });
  } catch {
    return null;
  }
}

export function curatedShareUrl(current: string, input: CuratedTopGames): string {
  const url = new URL(current);
  url.search = "";
  url.hash = "";
  url.searchParams.set("story", encodeCuratedTopGames(input));
  return url.toString();
}

export function curatedFromSearch(search: string): CuratedTopGames | null {
  const params = new URLSearchParams(search);
  return decodeCuratedTopGames(params.get("story") ?? params.get("top"));
}
