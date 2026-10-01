import type { Game } from "./library.js";

export type ShelfReceiptSource = "sample" | "local" | "steam";

export interface ShelfReceiptSummary {
  gameCount: number;
  totalMinutes: number;
  untouchedCount: number;
  topPlayed: Game[];
  biggestKnownInstalls: Game[];
}

export function buildShelfReceipt(
  games: readonly Game[],
  source: ShelfReceiptSource,
): ShelfReceiptSummary {
  const topPlayed = [...games]
    .filter((game) => game.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || (a.name ?? a.appid).localeCompare(b.name ?? b.appid))
    .slice(0, 4);

  const biggestKnownInstalls = source === "local"
    ? [...games]
      .filter((game) => game.installed && (game.bytes ?? 0) > 0)
      .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0) || (a.name ?? a.appid).localeCompare(b.name ?? b.appid))
      .slice(0, 3)
    : [];

  return {
    gameCount: games.length,
    totalMinutes: games.reduce((sum, game) => sum + game.minutes, 0),
    untouchedCount: games.filter((game) => game.minutes === 0).length,
    topPlayed,
    biggestKnownInstalls,
  };
}
