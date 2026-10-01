import type { PublicSteamLibrary } from "./steam.js";

export interface PartyGame {
  appid: string;
  name: string | null;
  iconHash?: string | null;
  ownerCount: number;
  playedCount: number;
  minutesBySteamId: Record<string, number>;
}

export interface PartyUniqueCorner {
  steamid: string;
  name: string;
  count: number;
}

export interface PartyComparison {
  playerCount: number;
  unionCount: number;
  ownedByAllCount: number;
  playedByAllCount: number;
  ownedByAll: PartyGame[];
  playedByAll: PartyGame[];
  ownedByMost: PartyGame[];
  handoffs: PartyGame[];
  uniqueCorners: PartyUniqueCorner[];
}

const displayName = (library: PublicSteamLibrary): string =>
  library.profile.name ?? library.steamid;

export function comparePartyLibraries(libraries: PublicSteamLibrary[]): PartyComparison {
  if (libraries.length < 3 || libraries.length > 5) {
    throw new Error("Party Shelf needs 3–5 public Steam profiles.");
  }

  const byApp = new Map<string, {
    name: string | null;
    iconHash?: string | null;
    minutesBySteamId: Record<string, number>;
  }>();

  for (const library of libraries) {
    for (const game of library.games) {
      const current = byApp.get(game.appid) ?? {
        name: game.name ?? null,
        iconHash: game.iconHash ?? null,
        minutesBySteamId: {},
      };
      if (!current.name && game.name) current.name = game.name;
      if (!current.iconHash && game.iconHash) current.iconHash = game.iconHash;
      current.minutesBySteamId[library.steamid] = game.minutes;
      byApp.set(game.appid, current);
    }
  }

  const partyGames: PartyGame[] = [...byApp.entries()].map(([appid, game]) => {
    const ownerCount = Object.keys(game.minutesBySteamId).length;
    const playedCount = Object.values(game.minutesBySteamId).filter((minutes) => minutes > 0).length;
    return {
      appid,
      name: game.name,
      iconHash: game.iconHash ?? null,
      ownerCount,
      playedCount,
      minutesBySteamId: game.minutesBySteamId,
    };
  });

  const all = libraries.length;
  const byMutualDepth = (a: PartyGame, b: PartyGame): number => {
    const aMinutes = libraries.map((library) => a.minutesBySteamId[library.steamid] ?? 0);
    const bMinutes = libraries.map((library) => b.minutesBySteamId[library.steamid] ?? 0);
    const aMin = Math.min(...aMinutes);
    const bMin = Math.min(...bMinutes);
    const aTotal = aMinutes.reduce((sum, value) => sum + value, 0);
    const bTotal = bMinutes.reduce((sum, value) => sum + value, 0);
    return bMin - aMin || bTotal - aTotal || (a.name ?? a.appid).localeCompare(b.name ?? b.appid);
  };

  const ownedByAll = partyGames
    .filter((game) => game.ownerCount === all)
    .sort(byMutualDepth);

  const playedByAll = ownedByAll
    .filter((game) => game.playedCount === all)
    .sort(byMutualDepth);

  const majorityThreshold = Math.floor(all / 2) + 1;
  const ownedByMost = partyGames
    .filter((game) => game.ownerCount >= majorityThreshold && game.ownerCount < all)
    .sort((a, b) => b.ownerCount - a.ownerCount || b.playedCount - a.playedCount || (a.name ?? a.appid).localeCompare(b.name ?? b.appid));

  const handoffs = ownedByAll
    .filter((game) => game.playedCount > 0 && game.playedCount < all)
    .sort((a, b) => b.playedCount - a.playedCount || byMutualDepth(a, b));

  const uniqueCorners = libraries.map((library) => ({
    steamid: library.steamid,
    name: displayName(library),
    count: partyGames.filter((game) =>
      game.ownerCount === 1 && Object.prototype.hasOwnProperty.call(game.minutesBySteamId, library.steamid)
    ).length,
  }));

  return {
    playerCount: all,
    unionCount: partyGames.length,
    ownedByAllCount: ownedByAll.length,
    playedByAllCount: playedByAll.length,
    ownedByAll,
    playedByAll,
    ownedByMost,
    handoffs,
    uniqueCorners,
  };
}
