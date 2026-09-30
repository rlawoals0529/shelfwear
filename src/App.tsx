import { useCallback, useMemo, useRef, useState } from "react";
import { readLocalConfig, readManifest, buildLibrary, summarise, shelve, hours, gb, type Game, type Spine } from "./lib/library.js";
import { familiarFor, steamCover, topNine } from "./lib/profile.js";
import { compareLibraries, type LibraryComparison } from "./lib/compare.js";
import { downloadBlob, renderShareCard, shareCardFilename } from "./lib/share-card.js";
import {
  comparisonShareUrl,
  fetchPublicSteamLibrary,
  sharedComparisonFromSearch,
  sharedSteamFromSearch,
  steamShareUrl,
  type PublicSteamLibrary,
  type SteamProfileSummary,
} from "./lib/steam.js";
import { SAMPLE_CONFIG, SAMPLE_MANIFESTS } from "./lib/sample.js";
import { Ticker, stagger } from "./lib/motion.js";
import { Palette } from "./lib/palette.js";
import palettes from "./theme/palettes.json";

type Manifest = NonNullable<ReturnType<typeof readManifest>>;
type SourceKind = "sample" | "local" | "steam";

interface Loaded {
  games: Game[];
  source: string;
  skipped: number;
  kind: SourceKind;
  steamid?: string;
  profile?: SteamProfileSummary;
}

interface Compared {
  left: PublicSteamLibrary;
  right: PublicSteamLibrary;
  result: LibraryComparison;
}

function load(files: { name: string; text: string }[]): Loaded {
  let play = new Map<string, { minutes: number; lastPlayed: number | null }>();
  const manifests: Manifest[] = [];
  let skipped = 0;

  for (const f of files) {
    const looksLikeConfig = /localconfig\.vdf$/i.test(f.name);
    if (looksLikeConfig) {
      // A malformed localconfig is the one file whose failure is worth stopping for:
      // without it every game reads as never played, which is a believable lie.
      play = readLocalConfig(f.text);
      continue;
    }
    const m = readManifest(f.text);
    if (m) manifests.push(m);
    else skipped++;
  }

  return {
    games: buildLibrary(play, manifests),
    source: `${files.length} file${files.length === 1 ? "" : "s"}`,
    skipped,
    kind: "local",
  };
}

const SAMPLE: Loaded = {
  games: buildLibrary(readLocalConfig(SAMPLE_CONFIG), SAMPLE_MANIFESTS.map((m) => readManifest(m)!)),
  source: "the sample library",
  skipped: 0,
  kind: "sample",
};

const ago = (unix: number | null): string => {
  if (unix === null) return "never";
  const days = Math.floor((Date.now() / 1000 - unix) / 86400);
  if (days < 1) return "today";
  if (days < 60) return `${days}d ago`;
  if (days < 730) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const displayName = (library: PublicSteamLibrary): string =>
  library.profile.name ?? `Steam ${library.steamid.slice(-6)}`;

export default function App() {
  const shared = useMemo(() => ({
    steam: sharedSteamFromSearch(window.location.search),
    compare: sharedComparisonFromSearch(window.location.search),
  }), []);

  const [loaded, setLoaded] = useState<Loaded>(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [steamError, setSteamError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [steamProfile, setSteamProfile] = useState(shared.steam ?? "");
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [cardRendering, setCardRendering] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [compareLeft, setCompareLeft] = useState(shared.compare?.[0] ?? "");
  const [compareRight, setCompareRight] = useState(shared.compare?.[1] ?? "");
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Compared | null>(null);
  const [compareCopied, setCompareCopied] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const accept = useCallback(async (list: File[]) => {
    setError(null);
    if (!list.length) return;
    try {
      const files = await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() })));
      const next = load(files);
      if (!next.games.length) {
        // Rendering an empty library as a result is the failure: it looks like an answer.
        setError("No games in those files. Drop localconfig.vdf, or the appmanifest_*.acf files from steamapps.");
        return;
      }
      setLoaded(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const importSteam = useCallback(async () => {
    setSteamError(null);
    setImporting(true);
    try {
      const data = await fetchPublicSteamLibrary(steamProfile);
      setLoaded({
        source: data.profile.name ?? `public Steam library ${data.steamid}`,
        skipped: 0,
        kind: "steam",
        steamid: data.steamid,
        profile: data.profile,
        games: data.games,
      });
    } catch (e) {
      setSteamError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [steamProfile]);

  const runComparison = useCallback(async () => {
    setCompareError(null);
    setComparison(null);
    if (compareLeft.trim() === compareRight.trim()) {
      setCompareError("Choose two different Steam profiles to compare.");
      return;
    }
    setComparing(true);
    try {
      const [left, right] = await Promise.all([
        fetchPublicSteamLibrary(compareLeft),
        fetchPublicSteamLibrary(compareRight),
      ]);
      if (left.steamid === right.steamid) throw new Error("Those inputs resolve to the same Steam profile.");
      setComparison({ left, right, result: compareLibraries(left.games, right.games) });
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e));
    } finally {
      setComparing(false);
    }
  }, [compareLeft, compareRight]);

  const stats = useMemo(() => summarise(loaded.games), [loaded]);
  const shelf = useMemo(() => shelve(loaded.games), [loaded]);
  const nine = useMemo(() => topNine(loaded.games), [loaded]);
  const familiar = useMemo(() => familiarFor(loaded.games), [loaded]);

  /** What a shelf of untouched games is holding, said once, under the shelf itself. */
  const untouchedBytes = shelf.untouched.reduce((n, s) => n + (s.game.bytes ?? 0), 0);

  const copyNine = useCallback(async () => {
    const text = [
      "My Shelfwear nine:",
      ...nine.map((game, i) => `${i + 1}. ${game.name} — ${hours(game.minutes)}h`),
      `Shelf familiar: ${familiar.name}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [nine, familiar]);

  const downloadCard = useCallback(async () => {
    setCardError(null);
    setCardRendering(true);
    try {
      const profileName = loaded.kind === "steam" ? loaded.profile?.name ?? null : null;
      const blob = await renderShareCard({
        games: nine,
        familiar,
        profileName,
        useSteamCovers: loaded.kind === "steam",
      });
      downloadBlob(blob, shareCardFilename(profileName));
    } catch (e) {
      setCardError(e instanceof Error ? e.message : String(e));
    } finally {
      setCardRendering(false);
    }
  }, [familiar, loaded.kind, loaded.profile?.name, nine]);

  const copyShelfLink = useCallback(async () => {
    if (!loaded.steamid) return;
    await navigator.clipboard.writeText(steamShareUrl(window.location.href, loaded.steamid));
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);
  }, [loaded.steamid]);

  const copyComparisonLink = useCallback(async () => {
    if (!comparison) return;
    await navigator.clipboard.writeText(comparisonShareUrl(window.location.href, comparison.left.steamid, comparison.right.steamid));
    setCompareCopied(true);
    window.setTimeout(() => setCompareCopied(false), 1600);
  }, [comparison]);

  return (
    <div className="wrap rhythm">
      <h1 className="display">shelf<span>wear</span></h1>
      <p className="tagline prose">
        See what your Steam library actually gets played, then turn the shape of it into
        something worth sharing. Local-file mode stays in this browser: nothing is uploaded
        and nothing is fetched.
      </p>
      {/* Whose library this is has to be settled before the first number is read, so it
          sits with the headline rather than down beside either import method. */}
      <p className="note source">Reading <b>{loaded.source}</b>.</p>
      {loaded.kind === "steam" && loaded.profile && (
        <div className="steam-identity">
          {loaded.profile.avatar && <img src={loaded.profile.avatar} alt="" loading="lazy" />}
          <span>{loaded.profile.name ?? loaded.profile.steamid}</span>
          <span className="note">public Steam data</span>
        </div>
      )}

      {(shelf.untouched.length > 0 || shelf.played.length > 0) && (
        <section className="panel figure">
          <h2>The shelf</h2>
          {/* Two shelves, untouched on top. Shelfwear is the trade term for what stock takes
              from sitting unsold, so the games that have never run are the ones wearing it:
              faded, with dust along the top edge. The played ones are clean because they
              have been handled. */}
          {shelf.untouched.length > 0 && (
            <Shelf
              spines={shelf.untouched}
              label={
                <>
                  <b>{shelf.untouched.length}</b> never launched, holding{" "}
                  <b>{gb(untouchedBytes)} GB</b>
                </>
              }
            />
          )}
          {shelf.played.length > 0 && (
            <Shelf spines={shelf.played} label={<><b>{shelf.played.length}</b> played</>} />
          )}
          <p className="note">
            Spine width is disk, and the figure at the foot of each is gigabytes. Only
            installed games have a size, so only local-file imports can stand here.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>What it adds up to</h2>
        <div className="grid">
          <div className="metric"><b><Ticker value={stats.games} /></b><span>games here</span></div>
          <div className="metric"><b><Ticker value={hours(stats.totalMinutes)} decimals={1} /></b><span>hours played</span></div>
          <div className="metric warn"><b><Ticker value={stats.neverPlayed} /></b><span>never launched</span></div>
          {loaded.kind === "steam" ? (
            <>
              <div className="metric"><b>—</b><span>disk data unavailable</span></div>
              <div className="metric"><b>—</b><span>unplayed disk unavailable</span></div>
            </>
          ) : (
            <>
              <div className="metric"><b><Ticker value={gb(stats.installedBytes)} decimals={1} suffix=" GB" /></b><span>installed</span></div>
              <div className="metric warn"><b><Ticker value={gb(stats.unplayedBytes)} decimals={1} suffix=" GB" /></b><span>held by unplayed</span></div>
            </>
          )}
          <div className="metric">
            <b><Ticker value={stats.halfOfHoursIn} /></b>
            <span>{stats.halfOfHoursIn === 1 ? "title is" : "titles are"} half your hours</span>
          </div>
        </div>
        <p className="note prose">
          {loaded.kind === "steam" ? (
            <>Steam mode reflects the games Steam returned for this public profile. Steam does not expose local disk size or last-played timestamps through this import.</>
          ) : (
            <>
              These are the apps this client has a record of, which is not the same as everything
              you own. A library you have never launched on this machine leaves no local trace at
              all, so treat every count here as a floor.
              {stats.sizeIsPartial && (
                <> <b>{stats.unknownSize}</b> installed game
                  {stats.unknownSize === 1 ? " reports" : "s report"} no size, so the disk figures
                  are a floor rather than a total.</>
              )}
              {loaded.kind === "sample" && <> This screen uses synthetic sample data.</>}
            </>
          )}
        </p>
      </section>

      {nine.length > 0 && (
        <section className="panel social-panel">
          <div className="social-heading">
            <div>
              <h2>Your nine</h2>
              <p className="note">The nine games with the most recorded playtime.</p>
            </div>
            <div className="social-actions">
              <button disabled={cardRendering} onClick={() => void downloadCard()}>{cardRendering ? "Making card…" : "Download card"}</button>
              <button onClick={() => void copyNine()}>{copied ? "Copied" : "Copy summary"}</button>
              {loaded.kind === "steam" && loaded.steamid && (
                <button onClick={() => void copyShelfLink()}>{shareCopied ? "Link copied" : "Share shelf"}</button>
              )}
            </div>
          </div>
          {cardError && <p className="err">{cardError}</p>}
          <div className="nine-grid" aria-label="Top nine games by recorded playtime">
            {nine.map((game, i) => (
              <article className="nine-tile" key={game.appid}>
                {loaded.kind === "steam" && <img src={steamCover(game.appid)} alt="" loading="lazy" />}
                <div className="nine-shade" />
                <span className="nine-rank">{i + 1}</span>
                <div className="nine-copy"><b>{game.name}</b><span>{hours(game.minutes)}h</span></div>
              </article>
            ))}
          </div>
          <p className="note">Download card exports a 1080×1350 PNG using the current Shelfwear palette. Missing cover art falls back to a typographic tile.</p>
          <div className="familiar">
            <span className="familiar-mark" aria-hidden="true">{familiar.animal}</span>
            <div>
              <p className="eyebrow">Shelf familiar</p>
              <h3>{familiar.name}</h3>
              <p>{familiar.description}</p>
              <p className="note">{familiar.evidence} A playful description of the library pattern, not a personality test.</p>
            </div>
          </div>
        </section>
      )}

      <section className="panel import-panel" id="steam">
        <h2>Bring in a Steam library</h2>
        <p className="prose">
          Paste a public Steam profile URL or 64-bit SteamID. The Worker asks Steam for public
          game/playtime data; your Steam password is never requested.
        </p>
        {shared.steam && <p className="share-hint">A friend shared this public SteamID. Read it to rebuild their shelf live.</p>}
        <div className="profile-form">
          <input
            value={steamProfile}
            onChange={(e) => setSteamProfile(e.target.value)}
            placeholder="https://steamcommunity.com/id/..."
            aria-label="Steam profile URL or SteamID"
          />
          <button disabled={importing || !steamProfile.trim()} onClick={() => void importSteam()}>
            {importing ? "Reading…" : shared.steam ? "Load shared shelf" : "Read public profile"}
          </button>
        </div>
        {steamError && <p className="err">{steamError}</p>}
        <p className="note">
          If Steam says the library is unavailable, set Profile → Privacy Settings → Game
          details to Public, or use the local-file method below. Share links contain only a
          public SteamID; Shelfwear does not store a library snapshot.
        </p>
      </section>

      <section className="panel compare-panel" id="compare">
        <h2>Compare two shelves</h2>
        <p className="prose">
          Put two public Steam profiles side by side. Overlap is the intersection divided by
          the combined unique library; played-together counts only games with recorded time on both profiles.
        </p>
        {shared.compare && <p className="share-hint">This comparison came from a stateless link. Load it to rebuild both public libraries live.</p>}
        <div className="compare-form">
          <input value={compareLeft} onChange={(e) => setCompareLeft(e.target.value)} placeholder="First Steam profile" aria-label="First Steam profile" />
          <span aria-hidden="true">×</span>
          <input value={compareRight} onChange={(e) => setCompareRight(e.target.value)} placeholder="Second Steam profile" aria-label="Second Steam profile" />
          <button disabled={comparing || !compareLeft.trim() || !compareRight.trim()} onClick={() => void runComparison()}>
            {comparing ? "Comparing…" : shared.compare ? "Load comparison" : "Compare"}
          </button>
        </div>
        {compareError && <p className="err">{compareError}</p>}

        {comparison && (
          <div className="comparison-result">
            <div className="compare-heading">
              <SteamPerson library={comparison.left} />
              <span className="compare-cross">×</span>
              <SteamPerson library={comparison.right} />
              <button onClick={() => void copyComparisonLink()}>{compareCopied ? "Link copied" : "Share comparison"}</button>
            </div>
            <div className="compare-metrics">
              <div className="metric"><b>{Math.round(comparison.result.overlapPercent)}%</b><span>library overlap</span></div>
              <div className="metric"><b>{comparison.result.sharedCount}</b><span>owned by both</span></div>
              <div className="metric"><b>{comparison.result.mutuallyPlayedCount}</b><span>played by both</span></div>
            </div>
            <div className="compare-signature familiar">
              <span className="familiar-mark" aria-hidden="true">{comparison.result.signature.object}</span>
              <div>
                <p className="eyebrow">Shared shelf signature</p>
                <h3>{comparison.result.signature.name}</h3>
                <p>{comparison.result.signature.description}</p>
                <p className="note">{comparison.result.signature.evidence} This describes the two public libraries, not the people.</p>
              </div>
            </div>
            {comparison.result.mutuallyPlayed.length > 0 ? (
              <div className="shared-games">
                <h3>Games both actually played</h3>
                {comparison.result.mutuallyPlayed.slice(0, 8).map((game) => (
                  <div className="shared-game" key={game.appid}>
                    <b>{game.name ?? `app ${game.appid}`}</b>
                    <span>{displayName(comparison.left)} {hours(game.leftMinutes)}h · {displayName(comparison.right)} {hours(game.rightMinutes)}h</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">The profiles share no game with recorded playtime on both sides.</p>
            )}
          </div>
        )}
      </section>

      {/* The local picker remains available even after the Worker path exists. It is the only
          mode that can say anything about the machine's disk, and it sends nothing away. */}
      <section className="panel">
        <h2>Or keep it completely local</h2>
        <div
          className={over ? "drop over" : "drop"}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void accept([...e.dataTransfer.files]); }}
        >
          Drop <code>localconfig.vdf</code> and your <code>appmanifest_*.acf</code> files here
        </div>
        <div className="actions">
          <button onClick={() => picker.current?.click()}>Choose files</button>
          <button onClick={() => { setError(null); setLoaded(SAMPLE); }}>Back to the sample</button>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => void accept([...(e.target.files ?? [])])}
          />
        </div>
        {error && <p className="err">{error}</p>}
        {loaded.skipped > 0 && (
          <p className="note">{loaded.skipped} file{loaded.skipped === 1 ? "" : "s"} skipped: not a manifest.</p>
        )}
        <p className="note prose">
          <b>localconfig.vdf</b> is in <code>userdata/&lt;id&gt;/config/</code>, and the
          <b> appmanifest</b> files are in <code>steamapps/</code>. The first knows your hours,
          the second knows the names and sizes. Either alone still works, with less to show.
          These files are parsed only in this browser.
        </p>
      </section>

      <section className="panel">
        <h2>Everything ({loaded.games.length})</h2>
        <div className="rows">
          {loaded.games.map((g) => (
            <div className={g.minutes === 0 ? "row cold" : "row"} key={g.appid}>
              <span className="hrs">{hours(g.minutes)}h</span>
              <span className="name">{g.name ?? <em>app {g.appid}</em>}</span>
              <span className="sz">
                {g.bytes === null
                  ? (g.installed ? "size unknown" : loaded.kind === "steam" ? "Steam profile" : "not installed")
                  : `${gb(g.bytes)} GB`}
                {loaded.kind !== "steam" ? ` · ${ago(g.lastPlayed)}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <Palette themes={palettes} storageKey="shelfwear:theme" />
    </div>
  );
}

function SteamPerson({ library }: { library: PublicSteamLibrary }) {
  return (
    <div className="steam-person">
      {library.profile.avatar && <img src={library.profile.avatar} alt="" loading="lazy" />}
      <div><b>{displayName(library)}</b><span>{library.gameCount} public games</span></div>
    </div>
  );
}

/**
 * One shelf: a run of spines stood on a plank, with a label under it.
 *
 * The title runs up the spine because that is the thing that makes a spine read as a spine,
 * and it is free - a rotated line of text needs no illustration and no image.
 */
function Shelf({ spines, label }: { spines: Spine[]; label: React.ReactNode }) {
  return (
    <div className="shelf">
      <div className="shelf-run">
        {spines.map(({ game, width, untouched }, i) => (
          <div
            key={game.appid}
            className={untouched ? "spine worn rise" : "spine rise"}
            style={{ width, ...stagger(i) }}
            title={`${game.name ?? game.appid} - ${gb(game.bytes ?? 0)} GB, ${hours(game.minutes)}h`}
          >
            <span className="spine-title">{game.name ?? `app ${game.appid}`}</span>
            <span className="spine-size">{gb(game.bytes ?? 0)}</span>
          </div>
        ))}
      </div>
      <p className="shelf-label">{label}</p>
    </div>
  );
}
