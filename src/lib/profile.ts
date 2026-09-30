import type { Game } from "./library.js";

export interface Familiar {
  name: string;
  animal: string;
  description: string;
  evidence: string;
}

export function topNine(games: Game[]): Game[] {
  return [...games]
    .filter((game) => game.name && game.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || (a.name ?? "").localeCompare(b.name ?? ""))
    .slice(0, 9);
}

export function familiarFor(games: Game[]): Familiar {
  const played = games.filter((game) => game.minutes > 0);
  const totalMinutes = played.reduce((sum, game) => sum + game.minutes, 0);
  const ranked = [...played].sort((a, b) => b.minutes - a.minutes);
  const topOne = totalMinutes ? (ranked[0]?.minutes ?? 0) / totalMinutes : 0;
  const topThree = totalMinutes ? ranked.slice(0, 3).reduce((sum, game) => sum + game.minutes, 0) / totalMinutes : 0;
  const untouchedShare = games.length ? games.filter((game) => game.minutes === 0).length / games.length : 0;

  // A mostly untouched shelf is the stronger library-level signal. Check it before
  // concentration, otherwise a shelf with one played game and eleven untouched games
  // looks like a single-game devotee simply because its only recorded time is 100%.
  if (untouchedShare >= 0.55 && games.length >= 12) {
    return {
      name: "Lantern Moth",
      animal: "moth",
      description: "This shelf is very good at finding the next bright thing.",
      evidence: `${Math.round(untouchedShare * 100)}% of the games here have no recorded playtime.`,
    };
  }
  if (topOne >= 0.38) {
    return {
      name: "Hearth Cat",
      animal: "cat",
      description: "This shelf keeps returning to one especially warm spot.",
      evidence: `${Math.round(topOne * 100)}% of recorded playtime sits in one game.`,
    };
  }
  if (played.length >= 24 && topThree < 0.45) {
    return {
      name: "Magpie",
      animal: "magpie",
      description: "This shelf collects favorites instead of building one giant nest.",
      evidence: `${played.length} games have playtime and the top three hold ${Math.round(topThree * 100)}% of it.`,
    };
  }
  return {
    name: "Library Fox",
    animal: "fox",
    description: "This shelf has a few familiar dens, with plenty of wandering between them.",
    evidence: `The top three games hold ${Math.round(topThree * 100)}% of recorded playtime across ${played.length} played games.`,
  };
}

/** Official Steam library artwork for ordinary <img> display. Canvas export uses the Worker proxy. */
export function steamCover(appid: string): string {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${encodeURIComponent(appid)}/library_600x900.jpg`;
}

/** Stable official Steam header artwork used only when portrait artwork is unavailable. */
export function steamHeader(appid: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(appid)}/header.jpg`;
}
