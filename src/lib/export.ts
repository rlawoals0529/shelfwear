import type { Game } from "./library.js";

export type LibraryExportSource = "sample" | "local" | "steam";
export type LibraryExportFormat = "csv" | "json";

export interface LibraryExportContext {
  kind: LibraryExportSource;
  sourceLabel: string;
  generatedAt: string;
  steamid?: string;
  profileName?: string | null;
}

const sourceName = (kind: LibraryExportSource): string => {
  switch (kind) {
    case "steam": return "public_steam";
    case "local": return "local_steam_files";
    case "sample": return "synthetic_demo";
  }
};

const commonRow = (game: Game, context: LibraryExportContext) => ({
  appid: game.appid,
  name: game.name,
  lifetime_minutes: game.minutes,
  source: sourceName(context.kind),
});

const rowFor = (game: Game, context: LibraryExportContext): Record<string, string | number | boolean | null> => {
  if (context.kind === "steam") {
    return {
      ...commonRow(game, context),
      icon_hash: game.iconHash ?? null,
    };
  }

  return {
    ...commonRow(game, context),
    installed_on_this_pc: game.installed,
    known_disk_bytes: game.bytes,
    local_last_played_unix: game.lastPlayed,
  };
};

export function libraryExportObject(games: readonly Game[], context: LibraryExportContext) {
  return {
    schema: "shelfwear.library.v1",
    generated_at: context.generatedAt,
    source: {
      kind: sourceName(context.kind),
      label: context.sourceLabel,
      ...(context.steamid ? { steamid: context.steamid } : {}),
      ...(context.profileName ? { profile_name: context.profileName } : {}),
      note: context.kind === "steam"
        ? "Public Steam owned-game/playtime data. No local install, disk, or last-played fields are inferred."
        : context.kind === "local"
          ? "Parsed locally in this browser from Steam files. Install, disk, and local last-played fields refer only to this PC."
          : "Synthetic demo data included with Shelfwear. Device-looking fields are examples, not observations from this PC.",
    },
    games: games.map((game) => rowFor(game, context)),
  };
}

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export function libraryExportCsv(games: readonly Game[], context: LibraryExportContext): string {
  const localColumns = ["installed_on_this_pc", "known_disk_bytes", "local_last_played_unix"];
  const headers = context.kind === "steam"
    ? ["appid", "name", "lifetime_minutes", "source", "icon_hash"]
    : ["appid", "name", "lifetime_minutes", "source", ...localColumns];

  const lines = [
    headers.join(","),
    ...games.map((game) => {
      const row = rowFor(game, context);
      return headers.map((header) => csvCell(row[header])).join(",");
    }),
  ];
  return lines.join("\r\n") + "\r\n";
}

export function libraryExportJson(games: readonly Game[], context: LibraryExportContext): string {
  return JSON.stringify(libraryExportObject(games, context), null, 2) + "\n";
}

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export function libraryExportFilename(
  format: LibraryExportFormat,
  context: Pick<LibraryExportContext, "kind" | "profileName">,
): string {
  const subject = context.kind === "steam"
    ? slug(context.profileName ?? "public-steam")
    : context.kind === "local"
      ? "local"
      : "sample-demo";
  return `shelfwear-${subject}-library.${format}`;
}
