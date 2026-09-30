interface Env { STEAM_WEB_API_KEY?: string }

type SteamGame = { appid: number; name?: string; playtime_forever?: number };
type SteamPlayer = {
  steamid?: string;
  personaname?: string;
  profileurl?: string;
  avatarfull?: string;
};

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

  const ownedUrl = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  ownedUrl.searchParams.set("key", key);
  ownedUrl.searchParams.set("steamid", steamid);
  ownedUrl.searchParams.set("include_appinfo", "true");
  ownedUrl.searchParams.set("include_played_free_games", "true");

  const summaryUrl = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  summaryUrl.searchParams.set("key", key);
  summaryUrl.searchParams.set("steamids", steamid);

  const [ownedResponse, summaryResponse] = await Promise.all([
    fetch(ownedUrl),
    fetch(summaryUrl),
  ]);
  if (!ownedResponse.ok) return json({ error: "Steam did not return this library." }, 502);

  const data = await ownedResponse.json() as { response?: { game_count?: number; games?: SteamGame[] } };
  const gameCount = data.response?.game_count;
  const games = data.response?.games ?? (gameCount === 0 ? [] : undefined);
  if (!games) return json({ error: "This Steam library is private or unavailable. Make Game details public and try again." }, 404);

  let player: SteamPlayer | undefined;
  if (summaryResponse.ok) {
    const summary = await summaryResponse.json() as { response?: { players?: SteamPlayer[] } };
    player = summary.response?.players?.[0];
  }

  return json({
    steamid,
    gameCount: gameCount ?? games.length,
    profile: {
      steamid,
      name: player?.personaname ?? null,
      avatar: player?.avatarfull ?? null,
      profileUrl: player?.profileurl ?? null,
    },
    games: games.map((game) => ({
      appid: String(game.appid),
      name: game.name ?? null,
      minutes: game.playtime_forever ?? 0,
    })),
  });
}

async function steamCover(appid: string): Promise<Response> {
  if (!/^\d{1,10}$/.test(appid)) return new Response(null, { status: 400 });
  const source = `https://shared.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;
  const upstream = await fetch(source);
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !contentType.toLowerCase().startsWith("image/")) {
    return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300" } });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const cover = url.pathname.match(/^\/api\/steam\/cover\/(\d{1,10})$/);
      if (cover?.[1]) return steamCover(cover[1]);

      if (url.pathname === "/api/steam/library") {
        if (!env.STEAM_WEB_API_KEY) return json({ error: "Steam import is not configured on this deployment." }, 503);
        const profile = url.searchParams.get("profile") ?? "";
        if (!profile || profile.length > 240) return json({ error: "Add a Steam profile URL or SteamID." }, 400);
        return library(profile, env.STEAM_WEB_API_KEY);
      }
    }
    return new Response(null, { status: 404 });
  },
};
