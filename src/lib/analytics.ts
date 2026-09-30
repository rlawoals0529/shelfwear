import { hours, summarise, type Game } from "./library.js";

export interface AnalyticsBucket {
  label: string;
  count: number;
}

export interface AnalyticsGame {
  appid: string;
  name: string | null;
  minutes: number;
  hours: number;
  sharePercent: number;
}

export interface LibraryAnalytics {
  utilizationPercent: number;
  untouchedPercent: number;
  topGameSharePercent: number;
  topThreeSharePercent: number;
  topNineSharePercent: number;
  medianPlayedHours: number;
  playtimeBuckets: AnalyticsBucket[];
  topGames: AnalyticsGame[];
  knownDiskShareUntouchedPercent: number | null;
  recentActivity: AnalyticsBucket[] | null;
}

const pct = (part: number, total: number): number =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

const shareOfMinutes = (games: Game[], count: number, totalMinutes: number): number =>
  pct(
    [...games]
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, count)
      .reduce((sum, game) => sum + game.minutes, 0),
    totalMinutes,
  );

export function analyticsFor(games: Game[], nowSeconds = Date.now() / 1000): LibraryAnalytics {
  const stats = summarise(games);
  const played = games.filter((game) => game.minutes > 0).sort((a, b) => a.minutes - b.minutes);
  const sorted = [...games].sort((a, b) => b.minutes - a.minutes || a.appid.localeCompare(b.appid));

  const middle = Math.floor(played.length / 2);
  const medianMinutes = played.length === 0
    ? 0
    : played.length % 2 === 1
      ? played[middle]!.minutes
      : (played[middle - 1]!.minutes + played[middle]!.minutes) / 2;

  const playtimeBuckets: AnalyticsBucket[] = [
    { label: "Unplayed", count: games.filter((game) => game.minutes === 0).length },
    { label: "Under 2h", count: games.filter((game) => game.minutes > 0 && game.minutes < 120).length },
    { label: "2–10h", count: games.filter((game) => game.minutes >= 120 && game.minutes < 600).length },
    { label: "10–50h", count: games.filter((game) => game.minutes >= 600 && game.minutes < 3000).length },
    { label: "50–100h", count: games.filter((game) => game.minutes >= 3000 && game.minutes < 6000).length },
    { label: "100h+", count: games.filter((game) => game.minutes >= 6000).length },
  ];

  const datedPlayed = games.filter((game) => game.minutes > 0 && game.lastPlayed !== null);
  let recentActivity: AnalyticsBucket[] | null = null;
  if (datedPlayed.length > 0) {
    const day = 86400;
    recentActivity = [
      { label: "Last 30d", count: datedPlayed.filter((game) => nowSeconds - game.lastPlayed! < 30 * day).length },
      { label: "1–6mo", count: datedPlayed.filter((game) => {
        const age = nowSeconds - game.lastPlayed!;
        return age >= 30 * day && age < 180 * day;
      }).length },
      { label: "6–12mo", count: datedPlayed.filter((game) => {
        const age = nowSeconds - game.lastPlayed!;
        return age >= 180 * day && age < 365 * day;
      }).length },
      { label: "1y+", count: datedPlayed.filter((game) => nowSeconds - game.lastPlayed! >= 365 * day).length },
    ];
  }

  const knownDiskShareUntouchedPercent = stats.installedBytes > 0
    ? pct(stats.unplayedBytes, stats.installedBytes)
    : null;

  return {
    utilizationPercent: pct(stats.played, stats.games),
    untouchedPercent: pct(stats.neverPlayed, stats.games),
    topGameSharePercent: shareOfMinutes(sorted, 1, stats.totalMinutes),
    topThreeSharePercent: shareOfMinutes(sorted, 3, stats.totalMinutes),
    topNineSharePercent: shareOfMinutes(sorted, 9, stats.totalMinutes),
    medianPlayedHours: hours(medianMinutes),
    playtimeBuckets,
    topGames: sorted.slice(0, 8).map((game) => ({
      appid: game.appid,
      name: game.name,
      minutes: game.minutes,
      hours: hours(game.minutes),
      sharePercent: pct(game.minutes, stats.totalMinutes),
    })),
    knownDiskShareUntouchedPercent,
    recentActivity,
  };
}
