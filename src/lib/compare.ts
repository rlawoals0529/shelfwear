import type { Game } from "./library.js";

export interface SharedGame {
  appid: string;
  name: string | null;
  leftMinutes: number;
  rightMinutes: number;
  /** Public Steam icon hash, used only as an official-art fallback on comparison cards. */
  iconHash?: string | null;
}

export interface LibraryComparison {
  leftCount: number;
  rightCount: number;
  sharedCount: number;
  unionCount: number;
  leftOnlyCount: number;
  rightOnlyCount: number;
  overlapPercent: number;
  mutuallyPlayedCount: number;
  mutuallyPlayed: SharedGame[];
  /** Shared ownership where exactly one profile has recorded playtime. */
  oneSidedPlayed: SharedGame[];
  signature: {
    name: string;
    object: string;
    description: string;
    evidence: string;
  };
}

export function compareLibraries(left: Game[], right: Game[]): LibraryComparison {
  const leftById = new Map(left.map((game) => [game.appid, game]));
  const rightById = new Map(right.map((game) => [game.appid, game]));
  const union = new Set([...leftById.keys(), ...rightById.keys()]);

  const shared: SharedGame[] = [];
  for (const [appid, leftGame] of leftById) {
    const rightGame = rightById.get(appid);
    if (!rightGame) continue;
    shared.push({
      appid,
      name: leftGame.name ?? rightGame.name,
      leftMinutes: leftGame.minutes,
      rightMinutes: rightGame.minutes,
      iconHash: leftGame.iconHash ?? rightGame.iconHash ?? null,
    });
  }

  const mutuallyPlayed = shared
    .filter((game) => game.leftMinutes > 0 && game.rightMinutes > 0)
    .sort((a, b) => {
      const aMutual = Math.min(a.leftMinutes, a.rightMinutes);
      const bMutual = Math.min(b.leftMinutes, b.rightMinutes);
      return bMutual - aMutual || (b.leftMinutes + b.rightMinutes) - (a.leftMinutes + a.rightMinutes);
    });

  const oneSidedPlayed = shared
    .filter((game) => (game.leftMinutes > 0) !== (game.rightMinutes > 0))
    .sort((a, b) => Math.max(b.leftMinutes, b.rightMinutes) - Math.max(a.leftMinutes, a.rightMinutes));

  const leftOnlyCount = left.filter((game) => !rightById.has(game.appid)).length;
  const rightOnlyCount = right.filter((game) => !leftById.has(game.appid)).length;
  const overlapPercent = union.size ? (shared.length / union.size) * 100 : 0;
  const roundedOverlap = Math.round(overlapPercent);
  const signature = comparisonSignature(roundedOverlap, mutuallyPlayed.length, shared.length);

  return {
    leftCount: left.length,
    rightCount: right.length,
    sharedCount: shared.length,
    unionCount: union.size,
    leftOnlyCount,
    rightOnlyCount,
    overlapPercent,
    mutuallyPlayedCount: mutuallyPlayed.length,
    mutuallyPlayed,
    oneSidedPlayed,
    signature,
  };
}

function comparisonSignature(overlapPercent: number, mutuallyPlayed: number, shared: number): LibraryComparison["signature"] {
  if (overlapPercent >= 45 && mutuallyPlayed >= 5) {
    return {
      name: "Twin Bookends",
      object: "bookends",
      description: "These shelves lean toward a lot of the same games.",
      evidence: `${overlapPercent}% library overlap, with ${mutuallyPlayed} shared games both libraries have played.`,
    };
  }
  if (overlapPercent >= 25 && mutuallyPlayed >= 3) {
    return {
      name: "Shared Campfire",
      object: "campfire",
      description: "There is a solid patch of common ground without the shelves becoming copies.",
      evidence: `${overlapPercent}% library overlap, with ${mutuallyPlayed} shared games both libraries have played.`,
    };
  }
  if (shared > 0) {
    return {
      name: "Crossed Bookmarks",
      object: "bookmarks",
      description: "The shelves meet in a few places, then wander in different directions.",
      evidence: `${shared} games appear on both shelves, equal to ${overlapPercent}% of their combined unique library.`,
    };
  }
  return {
    name: "Parallel Shelves",
    object: "shelves",
    description: "These public libraries do not currently share a title.",
    evidence: "0 games appear on both shelves.",
  };
}
