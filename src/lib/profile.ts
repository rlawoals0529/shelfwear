import type { Game } from "./library.js";

export interface FamiliarSignal {
  label: string;
  value: string;
}

export interface Familiar {
  name: string;
  animal: string;
  glyph: string;
  description: string;
  evidence: string;
  signals: FamiliarSignal[];
}

export function topNine(games: Game[]): Game[] {
  return [...games]
    .filter((game) => game.name && game.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || (a.name ?? "").localeCompare(b.name ?? ""))
    .slice(0, 9);
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

const medianMinutes = (games: Game[]): number => {
  if (!games.length) return 0;
  const values = games.map((game) => game.minutes).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? ((values[mid - 1] ?? 0) + (values[mid] ?? 0)) / 2
    : values[mid] ?? 0;
};

const compactHours = (minutes: number): string => {
  const hours = minutes / 60;
  return hours >= 10 ? `${Math.round(hours)}h` : `${Math.round(hours * 10) / 10}h`;
};

export function familiarFor(games: Game[]): Familiar {
  const played = games.filter((game) => game.minutes > 0);
  const totalMinutes = played.reduce((sum, game) => sum + game.minutes, 0);
  const ranked = [...played].sort((a, b) => b.minutes - a.minutes);
  const topOne = totalMinutes ? (ranked[0]?.minutes ?? 0) / totalMinutes : 0;
  const topThree = totalMinutes ? ranked.slice(0, 3).reduce((sum, game) => sum + game.minutes, 0) / totalMinutes : 0;
  const untouchedShare = games.length ? games.filter((game) => game.minutes === 0).length / games.length : 0;
  const medianPlayedMinutes = medianMinutes(played);
  const shortVisitShare = played.length
    ? played.filter((game) => game.minutes < 120).length / played.length
    : 0;

  const commonSignals = [
    { label: "Played", value: `${played.length} games` },
    { label: "Top three", value: percent(topThree) },
  ];

  if (played.length === 0) {
    return {
      name: "Quiet Dormouse",
      animal: "dormouse",
      glyph: "🐭",
      description: "This shelf is still waiting for its first recorded adventure.",
      evidence: games.length
        ? `None of the ${games.length} games here have recorded playtime.`
        : "There are no games in the currently visible shelf.",
      signals: [
        { label: "Played", value: "0 games" },
        { label: "Visible", value: `${games.length} games` },
        { label: "Recorded time", value: "0h" },
      ],
    };
  }

  // A mostly untouched shelf is the stronger library-level signal. Check it before
  // concentration, otherwise a shelf with one played game and eleven untouched games
  // looks like a single-game devotee simply because its only recorded time is 100%.
  if (untouchedShare >= 0.55 && games.length >= 12) {
    return {
      name: "Lantern Moth",
      animal: "moth",
      glyph: "🦋",
      description: "This shelf has a wide halo of games that have not been opened yet.",
      evidence: `${percent(untouchedShare)} of the games here have no recorded playtime.`,
      signals: [
        { label: "Untouched", value: percent(untouchedShare) },
        { label: "Visible", value: `${games.length} games` },
        { label: "Played", value: `${played.length} games` },
      ],
    };
  }

  if (topOne >= 0.38) {
    return {
      name: "Hearth Cat",
      animal: "cat",
      glyph: "🐱",
      description: "One game has become the warm center of this shelf.",
      evidence: `${percent(topOne)} of recorded playtime sits in one game.`,
      signals: [
        { label: "Top game", value: percent(topOne) },
        { label: "Top three", value: percent(topThree) },
        { label: "Played", value: `${played.length} games` },
      ],
    };
  }

  if (played.length >= 3 && topThree >= 0.72) {
    return {
      name: "Anchor Turtle",
      animal: "turtle",
      glyph: "🐢",
      description: "This shelf keeps most of its hours anchored to a small core.",
      evidence: `The top three games hold ${percent(topThree)} of all recorded playtime.`,
      signals: [
        { label: "Top three", value: percent(topThree) },
        { label: "Top game", value: percent(topOne) },
        { label: "Played", value: `${played.length} games` },
      ],
    };
  }

  if (games.length >= 180 && played.length >= 60) {
    return {
      name: "Archive Dragon",
      animal: "dragon",
      glyph: "🐉",
      description: "This is a large shelf with a substantial played collection inside it.",
      evidence: `${played.length} games have recorded playtime across ${games.length} visible titles.`,
      signals: [
        { label: "Visible", value: `${games.length} games` },
        { label: "Played", value: `${played.length} games` },
        { label: "Top three", value: percent(topThree) },
      ],
    };
  }

  if (played.length >= 8 && medianPlayedMinutes >= 40 * 60) {
    return {
      name: "Deep-Dive Owl",
      animal: "owl",
      glyph: "🦉",
      description: "The middle of this played shelf is made of long stays, not quick visits.",
      evidence: `The median played game has ${compactHours(medianPlayedMinutes)} of recorded time.`,
      signals: [
        { label: "Median played", value: compactHours(medianPlayedMinutes) },
        { label: "Played", value: `${played.length} games` },
        { label: "Top three", value: percent(topThree) },
      ],
    };
  }

  if (played.length >= 12 && shortVisitShare >= 0.6) {
    return {
      name: "Comet Hare",
      animal: "hare",
      glyph: "🐇",
      description: "This shelf has a long trail of short recorded visits.",
      evidence: `${percent(shortVisitShare)} of played games have under two hours recorded.`,
      signals: [
        { label: "Under 2h", value: percent(shortVisitShare) },
        { label: "Played", value: `${played.length} games` },
        { label: "Top three", value: percent(topThree) },
      ],
    };
  }

  if (played.length >= 24 && topThree < 0.45) {
    return {
      name: "Magpie",
      animal: "magpie",
      glyph: "🐦",
      description: "Recorded time is spread across a broad collection instead of one dominant nest.",
      evidence: `${played.length} games have playtime and the top three hold ${percent(topThree)} of it.`,
      signals: [
        { label: "Played", value: `${played.length} games` },
        { label: "Top three", value: percent(topThree) },
        { label: "Median played", value: compactHours(medianPlayedMinutes) },
      ],
    };
  }

  return {
    name: "Library Fox",
    animal: "fox",
    glyph: "🦊",
    description: "This shelf has a few familiar dens, with plenty of recorded time elsewhere too.",
    evidence: `The top three games hold ${percent(topThree)} of recorded playtime across ${played.length} played games.`,
    signals: [
      ...commonSignals,
      { label: "Median played", value: compactHours(medianPlayedMinutes) },
    ],
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

/** Official Steam community icon from the hash returned by GetOwnedGames. */
export function steamIcon(appid: string, iconHash: string): string {
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${encodeURIComponent(appid)}/${encodeURIComponent(iconHash)}.jpg`;
}
