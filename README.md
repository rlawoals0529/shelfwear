# shelfwear

What your Steam library actually gets played, with a local-only mode and a shareable public-profile mode.

![The shelf: hours, never-launched count, and disk held by games that have never run](docs/screenshot.png)

## Two ways in

### Local files — most private

Drop in `localconfig.vdf` and your `appmanifest_*.acf` files. They are parsed in the browser and are not uploaded. This mode can show local install size and disk held by games you have never launched.

### Public Steam profile — easiest to share

On a Cloudflare Workers deployment, paste a public Steam profile URL or 64-bit SteamID. The Worker keeps the Steam Web API key server-side and asks Steam only for public owned-game/playtime data plus the public profile summary used for the display name/avatar. If Game details are private, Steam will not return the library.

The social summary adds:

- **Your nine** — the nine titles with the most recorded playtime, in a 3×3 grid.
- **Download card** — a 1080×1350 PNG rendered in the current Shelfwear palette. Local/sample mode is fully browser-only; Steam mode asks Shelfwear's same-origin Worker cover endpoint for public artwork and falls back to typographic tiles when artwork is unavailable.
- **Shelf familiar** — a deterministic, playful description based only on observable playtime/library patterns. It describes the library shape, not the person.
- **Copy summary** — a text version of the nine for sharing anywhere.
- **Share shelf** — a stateless URL containing only the resolved public SteamID. Opening it prefills the profile so Shelfwear can rebuild the result live; no library snapshot is stored.
- **Compare two shelves** — ownership overlap, games with recorded playtime on both profiles, and a shared-shelf signature. Comparison links likewise contain only the two public SteamIDs.

## What it tells you

- **The shelf.** Installed games become spines sized by disk use; never-launched games stand apart.
- How many titles are represented and how many have **never been launched**.
- **How much disk the unplayed ones are holding** when local manifests provide size data.
- How few titles make up half of all recorded hours.
- For two public profiles, **library overlap** is the intersection divided by the combined unique library; **played by both** only counts shared games where both profiles have recorded playtime.

## Data boundaries

Local mode and public-profile mode know different things and Shelfwear keeps that distinction visible.

`localconfig.vdf` only lists apps this Steam client has a local record of. Anything never seen by that client leaves no trace, so local counts are floors rather than account totals.

Public-profile mode uses Steam's `GetOwnedGames` response. It can be broader than the local files, but only when the profile's Game details are visible. It does not provide local disk usage or last-played timestamps. The Worker also uses `GetPlayerSummaries` for public display metadata. Library/profile API responses use `Cache-Control: no-store`, and Shelfwear does not persist imported libraries in KV, D1, or another database.

The `/api/steam/cover/:appid` route is different: it is a tightly scoped proxy for public Steam artwork, accepts only a numeric app ID, and may be cached because it contains no user-specific library data. It exists so exported canvas cards remain origin-clean instead of depending on third-party CORS behavior.

## Cloudflare Workers deployment

The repository includes `worker/index.ts` and `wrangler.jsonc`. Static Vite output is served by the Worker and `/api/*` runs through the Worker first.

Build the app:

```bash
npm install
npm run build
```

Configure the Steam API key as a Worker secret rather than committing it:

```bash
npx wrangler secret put STEAM_WEB_API_KEY
```

Then deploy:

```bash
npx wrangler deploy
```

The checked-in Wrangler config uses the current Workers Static Assets model. GitHub Pages can remain in place until the Worker deployment has been verified; on Pages, local/sample mode and PNG export still work, while Worker-backed Steam actions explain that a Cloudflare deployment is required.

## The files

| | |
| --- | --- |
| `userdata/<id>/config/localconfig.vdf` | hours and last-played, per app |
| `steamapps/appmanifest_<id>.acf` | one per installed game: its name and size |

Either alone works, with less to show. Together you get names against hours.

## Reading Valve's format

Everything in a Steam install is KeyValues text. `src/lib/vdf.ts` is a parser for the shape the files actually have.

Two details matter:

- **Key case is not consistent.** The same client can write `apps` and `Apps`, `Steam` and `steam`.
- **`\s` is not an escape.** Windows paths contain backslash sequences that must survive parsing.

Malformed input fails rather than quietly producing a believable partial library.

## Run it

```bash
npm install
npm run dev
```

`npm test` covers parser/arithmetic/social-summary/share-link/comparison/export helpers; `npm run e2e` drives a browser against Steam-shaped fixtures and verifies the generated share card is a real 1080×1350 PNG.

The page opens on clearly labeled synthetic sample data so there is something to inspect before loading a library.

## Licence

MIT.
