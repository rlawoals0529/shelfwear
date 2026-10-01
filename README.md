# shelfwear

A view of your Steam library based on what you actually play. You can keep it local, or load a public profile when you want something easy to share.

![The shelf: hours, never-launched count, and disk held by games that have never run](docs/screenshot.png)

## Two ways in

### Local files — most private

Drop in `localconfig.vdf` and your `appmanifest_*.acf` files. They are parsed in the browser and are not uploaded. This mode can show local install size and disk held by games you have never launched.

### Public Steam profile — easiest to share

On a Cloudflare Workers deployment, paste a public Steam profile URL or 64-bit SteamID. The Worker keeps the Steam Web API key server-side and asks Steam only for public owned-game/playtime data plus the public profile summary used for the display name/avatar. If Game details are private, Steam will not return the library.

The interface uses original inline SVG doodles, emoji/kaomoji accents, and system fonts. It does not hotlink a character pack or third-party webfont.

For sharing, Shelfwear can make:

- **Your nine** — the nine titles with the most recorded playtime, in a 3×3 grid.
- **Shelf Stories** — prompt-driven, hand-picked collections such as Games that shaped me, comfort games, and multiplayer memories.
- **Download card** — a 1080×1350 PNG rendered in the current Shelfwear palette. Local/sample mode is fully browser-only; Steam mode asks Shelfwear's same-origin Worker cover endpoint for public artwork and falls back to typographic tiles when artwork is unavailable.
- **Shelf familiar** — a deterministic mascot based only on observable library patterns, presented as a cataloged library specimen with three visible evidence fields, a field note explaining why it was chosen, and its own downloadable 1080×1350 bookplate card. It describes the library shape, not the person.
- **Copy summary** — a text version of the nine for sharing anywhere.
- **Share shelf** — a stateless URL containing only the resolved public SteamID. Opening it prefills the profile so Shelfwear can rebuild the result live; no library snapshot is stored.
- **Compare two shelves** — ownership overlap, each shelf’s unique corner, games with recorded playtime on both profiles, “easy handoffs” where only one profile has recorded time in a jointly owned game, a shared-shelf signature, and a downloadable 1080×1350 friend comparison card. Finished comparison links contain only the two public SteamIDs.
- **Invite a friend** — after loading your own public shelf, copy either a one-sided invite URL or a ready-to-send invite message. The URL contains only your resolved public SteamID. The recipient lands on a ruled-paper Shelf Invite, sees the three-step handoff, and adds only their own public Steam profile.

## What it tells you

- **The shelf.** Installed games become spines sized by disk use; never-launched games stand apart.
- How many titles are represented and how many have **never been launched**.
- **How much disk the unplayed ones are holding** when local manifests provide size data.
- How few titles make up half of all recorded hours.
- For two public profiles, **library overlap** is the intersection divided by the combined unique library; **played by both** only counts shared games where both profiles have recorded playtime. The comparison's strongest shared play signal is the common game with the highest smaller-of-the-two playtime, so one person's huge hours cannot dominate the ordering by itself.

## Data boundaries

Local files and a public Steam profile expose different data, so Shelfwear keeps the two modes separate instead of filling the gaps with guesses.

`localconfig.vdf` only lists apps this Steam client has a local record of. Anything never seen by that client leaves no trace, so local counts are floors rather than account totals.

Public-profile mode uses Steam's `GetOwnedGames` response. It can be broader than the local files, but only when the profile's Game details are visible. It does not provide local disk usage or last-played timestamps. The Worker also uses `GetPlayerSummaries` for public display metadata. Library/profile API responses use `Cache-Control: no-store`, and Shelfwear does not persist imported libraries in KV, D1, or another database.

The `/api/steam/cover/:appid` route is different: it is a tightly scoped proxy for public Steam artwork, accepts only a numeric app ID, and may be cached because it contains no user-specific library data. It exists so exported canvas cards remain origin-clean instead of depending on third-party CORS behavior.

## Whole-shelf browsing

The **Everything** section is interactive rather than a fixed dump of games. Visitors can search by title, sort by most/least played or alphabetically, and filter to played or never-played games. Every row can also open a small **Shelf Index** record showing only what the current source actually knows: recorded playtime and play state everywhere; install state, known size, and last recorded launch only for real local-file imports. Public Steam records may show the same official artwork already available from the public import, while local-file records intentionally do not fetch artwork automatically. Only real local-file mode enables **Recently played on this PC**, **Largest installed**, and **Installed on this PC**. Public Steam imports never show those controls, and the built-in sample keeps its synthetic local data clearly marked as demo data instead of presenting it as a device fact. The list can switch between cozy and compact row density without changing the underlying data. Shelfwear remembers the selected row density and last sort choice in browser `localStorage`; search/filter state, open catalog records, and Steam library contents are not persisted server-side for these preferences.

## Shelf Stories

**Shelf Stories** turns the hand-picked card builder into a small prompt-driven collection maker. Start from **Games that shaped me**, **My comfort games**, **Currently obsessed**, **Childhood favorites**, **Multiplayer memories**, or **Play again for the first time**. Choosing a prompt sets a suggested title and caption without replacing games you already picked. You can then add titles manually or pull them from the loaded shelf, attach a Steam AppID or Store URL when you want official artwork, order up to nine games, and add a short optional **why this one?** note to each pick.

Stories also have three visual treatments: **Scrapbook**, **Polaroid**, and **Poster**. Scrapbook is the canonical Shelfwear story artifact: a ruled-paper folio with a shelf spine and hand-picked catalog framing. A separate **Finishing touch** control lets the author keep the full **Archive** treatment, switch to **Doodles** for hearts/sparkles and looser scraps, or use **Clean** for a quieter version of the same Shelfwear structure. Polaroid and Poster remain alternate card looks. These choices change both the live preview and exported card; they never change or invent game data.

Sharing stays stateless. New share URLs use `?story=...` and contain only the story title, caption, selected card look, selected finishing touch, selected game names, optional per-game notes, numeric Steam AppIDs, and public Steam icon hashes when a loaded library provides them. Shelfwear does not create an account or store the story. Existing `?top=...` links remain supported and open the same editable Shelf Stories view.

The builder can export a 1080×1350 PNG carrying the selected card look and authored notes. Games with an AppID use the existing same-origin Steam artwork proxy. If Steam has no portrait, Shelfwear prefers the public icon hash from GetOwnedGames and otherwise letterboxes an official wide Steam asset rather than cropping it into a blurry square. Games without an AppID intentionally use a designed text tile rather than guessed artwork.

## Shelf Familiar

Shelf Familiar is the companion artifact to Shelf Stories and friend comparisons. The on-page result is styled as a **library specimen/bookplate** with a classification label, numbered evidence fields, a field note, and a catalog stamp. The 1080×1350 export uses the same structure rather than a generic mascot card.

The familiar remains deterministic and evidence-first: its name, glyph, description, signals, and evidence come from observable library-shape logic already shown in the interface. The card explicitly states that it is cataloged from library patterns only and is not a personality test or a claim about the person.

## Friend comparison cards

After loading two public profiles, Shelfwear can export a 1080×1350 **library-card-style** comparison artifact with a ruled-paper field, shelf labels for both profiles, a stamped overlap mark, checkout-slip rows for up to six mutually played games, a stamped shared-shelf signature, and an optional handoff note when one side has played a jointly owned game and the other has 0h recorded. It still carries the same display names, library overlap, shared ownership count, played-by-both count, each shelf's unique-game count, and recorded hours. Shared games reuse Shelfwear's same-origin Steam artwork proxy and official icon fallback.

The on-page comparison also shows **easy handoffs**: games owned by both profiles where exactly one side has recorded playtime. They are ordered by the recorded playtime on the side that has played them. This is only a visibility shortcut for shared ownership/playtime, not a recommendation score.

The comparison card does **not** create a compatibility score or infer anything about the people. Its figures are the same observable public-library measures already shown on the comparison page. The existing share-comparison URL remains stateless and contains only the two resolved public SteamIDs.

Friend invites are stateless too. An invite uses `?invite=<SteamID>#compare` and contains only the inviter's resolved 17-digit public SteamID. It does not contain either library, profile name, playtime, comparison result, or the eventual recipient. When the recipient submits their own public profile, Shelfwear fetches both public libraries live and creates the normal comparison.

## Analytics

Shelfwear has a second, page-like Analytics view derived only from the currently loaded library. Its presentation now uses the same physical artifact system as the social surfaces: a **Reading Room** ledger with ruled sheets, catalog codes, numbered slips, shelf-depth bars, and a simple hour ledger instead of generic dashboard cards. It still reports only observable measures such as library utilization, untouched share, playtime-depth buckets, top-game concentration, and the games carrying the largest share of recorded hours. Local-file mode can additionally show known disk-space and last-played buckets when those fields exist. Public Steam imports do not invent disk or recency data that Steam does not return.

The GitHub Pages build sends public-Steam API and cover requests to the production Worker at `https://shelfwear.rlawoals0529.workers.dev`. The Worker allows that specific Pages origin with CORS; local-file parsing still stays entirely in-browser. Merges to `main` automatically deploy the current build to Cloudflare so the Worker and frontend do not drift.

## Cloudflare Workers deployment

The repository includes `worker/index.ts` and `wrangler.jsonc`. Static Vite output is served by the Worker and `/api/*` runs through the Worker first.

### GitHub Actions — recommended

`.github/workflows/cloudflare.yml` provides a manual production deployment so credentials stay in GitHub Actions secrets instead of the repository.

Configure these repository secrets under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token permitted to deploy this Worker.
- `CLOUDFLARE_ACCOUNT_ID` — the target Cloudflare account ID.
- `STEAM_WEB_API_KEY` — the Steam Web API key bound to the Worker as a secret.

Then open **Actions → Cloudflare deploy → Run workflow**. The workflow runs `npm ci`, builds the Vite assets, deploys with Wrangler, writes `STEAM_WEB_API_KEY` as a Worker secret, and records the returned deployment URL in the job summary. Do not commit any of these values.

### Local deployment

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
