# shelfwear

What your Steam library actually gets played, with a local-only mode and a shareable public-profile mode.

![The shelf: hours, never-launched count, and disk held by games that have never run](docs/screenshot.png)

## Two ways in

### Local files — most private

Drop in `localconfig.vdf` and your `appmanifest_*.acf` files. They are parsed in the browser and are not uploaded. This mode can show local install size and disk held by games you have never launched.

### Public Steam profile — easiest to share

On a Cloudflare Workers deployment, paste a public Steam profile URL or 64-bit SteamID. The Worker keeps the Steam Web API key server-side and asks Steam only for public owned-game/playtime data. If Game details are private, Steam will not return the library.

The social summary adds:

- **Your nine** — the nine titles with the most recorded playtime, in a 3×3 grid.
- **Shelf familiar** — a deterministic, playful description based only on observable playtime/library patterns. It describes the library shape, not the person.
- **Copy summary** — a text version of the nine for sharing anywhere.

## What it tells you

- **The shelf.** Installed games become spines sized by disk use; never-launched games stand apart.
- How many titles are represented and how many have **never been launched**.
- **How much disk the unplayed ones are holding** when local manifests provide size data.
- How few titles make up half of all recorded hours.

## Data boundaries

Local mode and public-profile mode know different things and Shelfwear keeps that distinction visible.

`localconfig.vdf` only lists apps this Steam client has a local record of. Anything never seen by that client leaves no trace, so local counts are floors rather than account totals.

Public-profile mode uses Steam's `GetOwnedGames` response. It can be broader than the local files, but only when the profile's Game details are visible. It does not provide local disk usage.

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

The checked-in Wrangler config uses the current Workers Static Assets model. GitHub Pages can remain in place until the Worker deployment has been verified.

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

`npm test` covers parser/arithmetic/social-summary behavior; `npm run e2e` drives a browser against Steam-shaped fixtures.

The page opens on clearly labeled synthetic sample data so there is something to inspect before loading a library.

## Licence

MIT.
