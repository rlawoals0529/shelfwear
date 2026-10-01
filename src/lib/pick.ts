import type { Game } from "./library.js";

export type PickPoolKind = "never-played" | "under-two" | "installed" | "custom-shelf";

export interface PickPoolOptions {
  customShelfAppIds?: readonly string[];
  excludedAppIds?: Iterable<string>;
}

export interface PickPoolResult {
  games: Game[];
  baseCount: number;
  excludedCount: number;
}

export function buildPickPool(
  games: readonly Game[],
  kind: PickPoolKind,
  options: PickPoolOptions = {},
): PickPoolResult {
  const customIds = new Set(options.customShelfAppIds ?? []);
  const excluded = new Set(options.excludedAppIds ?? []);

  const base = games.filter((game) => {
    switch (kind) {
      case "never-played":
        return game.minutes === 0;
      case "under-two":
        return game.minutes > 0 && game.minutes < 120;
      case "installed":
        return game.installed;
      case "custom-shelf":
        return customIds.has(game.appid);
    }
  });

  const available = base.filter((game) => !excluded.has(game.appid));
  return {
    games: available,
    baseCount: base.length,
    excludedCount: base.length - available.length,
  };
}

export function drawGame(games: readonly Game[], random = Math.random): Game | null {
  if (!games.length) return null;
  const roll = Math.max(0, Math.min(0.999999999999, random()));
  return games[Math.floor(roll * games.length)] ?? null;
}
