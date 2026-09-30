interface Env { STEAM_WEB_API_KEY?: string }

type SteamGame = { appid: number; name?: string; playtime_forever?: number };

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" },
});

function profileParts(input: string): { steamid?: string; vanity?: string } | null {
  const value = input.trim();
  if (/^\d{17}$/.test(value)) return { steamid: value };
  try {
    const url = new URL(value);
    if (!/(^|\.)steamcommunity\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "profiles" && /^\d{17}$/.test(parts[1] ?? "")) return { steamid: parts[1] };
    if (parts[0] === "id" && /^[A-Za-z0-9_-]{2,64}$/.test(parts[1] ?? "")) return { vanity: parts[1] };
  } catch { return null; }
  return null;
}

async function resolveSteamId(input: string, key: string): Promise<string | null> {
  const parsed = profileParts(input);
  if (!parsed) return null;
  if (parsed.steamid) return parsed.steamid;
  const url = new URL("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/");
  url.searchParams.set("key", key);
  url.searchParams.set("vanityurl", parsed.vanity!);
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json() as { response?: { success?: number; steamid?: string } };
  return data.response?.success === 1 ? data.response.steamid ?? null : null;
}

async function library(profile: string, key: string): Promise<Response> {
  const steamid = await resolveSteamId(profile, key);
  if (!steamid) return json({ error: "That does not look like a Steam profile URL or SteamID." }, 400);

  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", key);
  url.searchParams.set("steamid", steamid);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");
  const response = await fetch(url);
  if (!response.ok) return json({ error: "Steam did not return this library." }, 502);
  const data = await response.json() as { response?: { game_count?: number; games?: SteamGame[] } };
  const games = data.response?.games;
  if (!games) return json({ error: "This Steam library is private or unavailable. Make Game details public and try again." }, 404);

  return json({
    steamid,
    gameCount: data.response?.game_count ?? games.length,
    games: games.map((game) => ({
      appid: String(game.appid),
      name: game.name ?? null,
      minutes: game.playtime_forever ?? 0,
    })),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/steam/library") {
      if (!env.STEAM_WEB_API_KEY) return json({ error: "Steam import is not configured on this deployment." }, 503);
      const profile = url.searchParams.get("profile") ?? "";
      if (!profile || profile.length > 240) return json({ error: "Add a Steam profile URL or SteamID." }, 400);
      return library(profile, env.STEAM_WEB_API_KEY);
    }
    return new Response(null, { status: 404 });
  },
};
