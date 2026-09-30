export interface CuratedGame {
  name: string;
  appid: string | null;
}

export interface CuratedTopGames {
  title: string;
  caption: string;
  games: CuratedGame[];
}

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
  const title = clean(input.title ?? "", TITLE_LIMIT) || "my top games";
  const caption = clean(input.caption ?? "", CAPTION_LIMIT);
  const seen = new Set<string>();
  const games: CuratedGame[] = [];

  for (const raw of input.games ?? []) {
    if (games.length >= CURATED_LIMIT) break;
    const name = clean(raw?.name ?? "", GAME_NAME_LIMIT);
    if (!name) continue;
    const appid = raw?.appid && /^\d{1,10}$/.test(raw.appid) ? raw.appid : null;
    const key = `${name.toLowerCase()}\u0000${appid ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    games.push({ name, appid });
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
    g: list.games.map((game) => game.appid ? [game.name, game.appid] : [game.name]),
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
      return { name: entry[0], appid };
    }).filter((game): game is CuratedGame => game !== null);

    return normaliseCuratedTopGames({
      title: typeof parsed.t === "string" ? parsed.t : "my top games",
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
  url.searchParams.set("top", encodeCuratedTopGames(input));
  return url.toString();
}

export function curatedFromSearch(search: string): CuratedTopGames | null {
  return decodeCuratedTopGames(new URLSearchParams(search).get("top"));
}
