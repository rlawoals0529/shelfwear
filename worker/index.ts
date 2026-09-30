interface Env { STEAM_WEB_API_KEY?: string }

type SteamGame = { appid: number; name?: string; playtime_forever?: number; img_icon_url?: string };
type SteamPlayer = {
  steamid?: string;
  personaname?: string;
  profileurl?: string;
  avatarfull?: string;
};

const ALLOWED_ORIGINS = new Set([
  "https://rlawoals0529.github.io",
  "https://shelfwear.rlawoals0529.workers.dev",
]);

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get("origin");
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { "access-control-allow-origin": origin, "vary": "origin" }
    : {};
};

const json = (request: Request, body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...corsHeaders(request) },
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

async function library(profile: string, key: string, request: Request): Promise<Response> {
  const steamid = await resolveSteamId(profile, key);
  if (!steamid) return json(request, { error: "That does not look like a Steam profile URL or SteamID." }, 400);

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
  if (!ownedResponse.ok) return json(request, { error: "Steam did not return this library." }, 502);

  const data = await ownedResponse.json() as { response?: { game_count?: number; games?: SteamGame[] } };
  const gameCount = data.response?.game_count;
  const games = data.response?.games ?? (gameCount === 0 ? [] : undefined);
  if (!games) return json(request, { error: "This Steam library is private or unavailable. Make Game details public and try again." }, 404);

  let player: SteamPlayer | undefined;
  if (summaryResponse.ok) {
    const summary = await summaryResponse.json() as { response?: { players?: SteamPlayer[] } };
    player = summary.response?.players?.[0];
  }

  return json(request, {
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
      iconHash: game.img_icon_url && /^[a-f0-9]{40}$/i.test(game.img_icon_url) ? game.img_icon_url : null,
    })),
  });
}


type SteamStoreDetails = {
  header_image?: string;
  capsule_image?: string;
  capsule_imagev5?: string;
  background?: string;
  background_raw?: string;
};

const STEAM_IMAGE_HOSTS = [
  "steamstatic.com",
  "steamcdn-a.akamaihd.net",
] as const;

function allowedSteamImage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const allowed = STEAM_IMAGE_HOSTS.some((host) =>
      url.hostname === host || url.hostname.endsWith(`.${host}`)
    );
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

function siblingSteamAsset(source: string | undefined, filename: string): string | null {
  const safe = allowedSteamImage(source);
  if (!safe) return null;
  const original = new URL(safe);
  const sibling = new URL(filename, original);
  sibling.search = original.search;
  return allowedSteamImage(sibling.toString());
}

async function steamStoreArtwork(appid: string): Promise<string[]> {
  const url = new URL("https://store.steampowered.com/api/appdetails/");
  url.searchParams.set("appids", appid);
  url.searchParams.set("cc", "us");
  url.searchParams.set("l", "english");

  try {
    const response = await fetch(url, {
      headers: { "accept": "application/json" },
    });
    if (!response.ok) return [];
    const payload = await response.json() as Record<string, { success?: boolean; data?: SteamStoreDetails }>;
    const data = payload[appid]?.success ? payload[appid]?.data : undefined;
    if (!data) return [];

    const candidates = [
      siblingSteamAsset(data.header_image, "library_600x900_2x.jpg"),
      siblingSteamAsset(data.header_image, "library_600x900.jpg"),
      allowedSteamImage(data.capsule_image),
      allowedSteamImage(data.capsule_imagev5),
      allowedSteamImage(data.header_image),
      allowedSteamImage(data.background),
      allowedSteamImage(data.background_raw),
    ].filter((value): value is string => Boolean(value));

    return [...new Set(candidates)];
  } catch {
    return [];
  }
}

async function imageResponse(source: string, request: Request): Promise<Response | null> {
  const upstream = await fetch(source);
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !contentType.toLowerCase().startsWith("image/")) return null;
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      ...corsHeaders(request),
    },
  });
}

async function steamCover(appid: string, request: Request, iconHash: string | null): Promise<Response> {
  if (!/^\d{1,10}$/.test(appid)) return new Response(null, { status: 400 });

  // Most games still have the classic un-hashed portrait path, so try that first.
  const directSources = [
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
  ];
  for (const source of directSources) {
    const response = await imageResponse(source, request);
    if (response) return response;
  }

  // Newer Steam releases can put artwork below a content-hash directory. Ask Steam's store
  // details endpoint for its current official image URL, then try portrait siblings in that
  // exact directory before falling back to Steam's supplied capsule/header art.
  for (const source of await steamStoreArtwork(appid)) {
    const response = await imageResponse(source, request);
    if (response) return response;
  }

  // Stable legacy header as the final official-Steam fallback.
  const legacyHeader = await imageResponse(
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    request,
  );
  if (legacyHeader) return legacyHeader;

  // GetOwnedGames includes an official Steam community icon hash. It is not a full cover,
  // but it is a reliable branded fallback for newer games whose portrait art cannot be
  // discovered from the public store endpoint.
  if (iconHash && /^[a-f0-9]{40}$/i.test(iconHash)) {
    const icon = await imageResponse(
      `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${iconHash}.jpg`,
      request,
    );
    if (icon) return icon;
  }

  return new Response(null, {
    status: 404,
    headers: { "cache-control": "public, max-age=300", ...corsHeaders(request) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      const origin = request.headers.get("origin");
      if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(request),
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    if (request.method === "GET") {
      const cover = url.pathname.match(/^\/api\/steam\/cover\/(\d{1,10})$/);
      if (cover?.[1]) return steamCover(cover[1], request, url.searchParams.get("icon"));

      if (url.pathname === "/api/steam/library") {
        if (!env.STEAM_WEB_API_KEY) return json(request, { error: "Steam import is not configured on this deployment." }, 503);
        const profile = url.searchParams.get("profile") ?? "";
        if (!profile || profile.length > 240) return json(request, { error: "Add a Steam profile URL or SteamID." }, 400);
        return library(profile, env.STEAM_WEB_API_KEY, request);
      }
    }
    return new Response(null, { status: 404 });
  },
};
