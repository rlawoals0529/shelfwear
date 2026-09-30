import { useCallback, useMemo, useRef, useState } from "react";
import { readLocalConfig, readManifest, buildLibrary, summarise, shelve, hours, gb, type Game, type Spine } from "./lib/library.js";
import { familiarFor, steamCover, topNine } from "./lib/profile.js";
import { SAMPLE_CONFIG, SAMPLE_MANIFESTS } from "./lib/sample.js";
import { Ticker, stagger } from "./lib/motion.js";
import { Palette } from "./lib/palette.js";
import palettes from "./theme/palettes.json";

type Manifest = NonNullable<ReturnType<typeof readManifest>>;
type SourceKind = "sample" | "local" | "steam";

interface Loaded { games: Game[]; source: string; skipped: number; kind: SourceKind }

function load(files: { name: string; text: string }[]): Loaded {
  let play = new Map<string, { minutes: number; lastPlayed: number | null }>();
  const manifests: Manifest[] = [];
  let skipped = 0;

  for (const f of files) {
    const looksLikeConfig = /localconfig\.vdf$/i.test(f.name);
    if (looksLikeConfig) {
      play = readLocalConfig(f.text);
      continue;
    }
    const m = readManifest(f.text);
    if (m) manifests.push(m);
    else skipped++;
  }

  return {
    games: buildLibrary(play, manifests),
    source: `${files.length} local file${files.length === 1 ? "" : "s"}`,
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

export default function App() {
  const [loaded, setLoaded] = useState<Loaded>(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [steamProfile, setSteamProfile] = useState("");
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const accept = useCallback(async (list: File[]) => {
    setError(null);
    if (!list.length) return;
    try {
      const files = await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() })));
      const next = load(files);
      if (!next.games.length) {
        setError("No games in those files. Drop localconfig.vdf, or the appmanifest_*.acf files from steamapps.");
        return;
      }
      setLoaded(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const importSteam = useCallback(async () => {
    setError(null);
    setImporting(true);
    try {
      const response = await fetch(`/api/steam/library?profile=${encodeURIComponent(steamProfile.trim())}`);
      const data = await response.json() as {
        steamid?: string;
        error?: string;
        games?: { appid: string; name: string | null; minutes: number }[];
      };
      if (!response.ok || !data.games || !data.steamid) throw new Error(data.error ?? "Steam import failed.");
      setLoaded({
        source: `public Steam library ${data.steamid}`,
        skipped: 0,
        kind: "steam",
        games: data.games.map((game) => ({ ...game, lastPlayed: null, bytes: null, installed: false })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [steamProfile]);

  const stats = useMemo(() => summarise(loaded.games), [loaded]);
  const shelf = useMemo(() => shelve(loaded.games), [loaded]);
  const nine = useMemo(() => topNine(loaded.games), [loaded]);
  const familiar = useMemo(() => familiarFor(loaded.games), [loaded]);
  const untouchedBytes = shelf.untouched.reduce((n, s) => n + (s.game.bytes ?? 0), 0);

  const copyNine = useCallback(async () => {
    const text = [`My Shelfwear nine:`, ...nine.map((game, i) => `${i + 1}. ${game.name} — ${hours(game.minutes)}h`), `Shelf familiar: ${familiar.name}`].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [nine, familiar]);

  return (
    <div className="wrap rhythm">
      <h1 className="display">shelf<span>wear</span></h1>
      <p className="tagline prose">
        See what your Steam library actually gets played, then turn the shape of it into something worth sharing.
        Local files stay in your browser.
      </p>
      <p className="note source">Reading <b>{loaded.source}</b>.</p>

      {(shelf.untouched.length > 0 || shelf.played.length > 0) && (
        <section className="panel figure">
          <h2>The shelf</h2>
          {shelf.untouched.length > 0 && (
            <Shelf spines={shelf.untouched} label={<><b>{shelf.untouched.length}</b> never launched, holding <b>{gb(untouchedBytes)} GB</b></>} />
          )}
          {shelf.played.length > 0 && <Shelf spines={shelf.played} label={<><b>{shelf.played.length}</b> played</>} />}
          <p className="note">Spine width is disk. Only installed games have a size, so only local-file imports can stand here.</p>
        </section>
      )}

      <section className="panel">
        <h2>What it adds up to</h2>
        <div className="grid">
          <div className="metric"><b><Ticker value={stats.games} /></b><span>games here</span></div>
          <div className="metric"><b><Ticker value={hours(stats.totalMinutes)} decimals={1} /></b><span>hours played</span></div>
          <div className="metric warn"><b><Ticker value={stats.neverPlayed} /></b><span>never launched</span></div>
          <div className="metric"><b><Ticker value={gb(stats.installedBytes)} decimals={1} suffix=" GB" /></b><span>installed known here</span></div>
          <div className="metric warn"><b><Ticker value={gb(stats.unplayedBytes)} decimals={1} suffix=" GB" /></b><span>held by unplayed</span></div>
          <div className="metric"><b><Ticker value={stats.halfOfHoursIn} /></b><span>{stats.halfOfHoursIn === 1 ? "title is" : "titles are"} half your hours</span></div>
        </div>
        <p className="note prose">
          {loaded.kind === "local"
            ? <>Local mode only knows apps this client has a record of, so counts are floors rather than your complete account library.</>
            : loaded.kind === "steam"
              ? <>Steam mode reflects the games Steam returned for this public profile. Disk size and last-played are not exposed by this import.</>
              : <>This is synthetic sample data so the page has something to show before you load a library.</>}
        </p>
      </section>

      {nine.length > 0 && (
        <section className="panel social-panel">
          <div className="social-heading">
            <div><h2>Your nine</h2><p className="note">The nine games with the most recorded playtime.</p></div>
            <button onClick={() => void copyNine()}>{copied ? "Copied" : "Copy summary"}</button>
          </div>
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
          <div className="familiar">
            <span className="familiar-mark" aria-hidden="true">{familiar.animal}</span>
            <div><p className="eyebrow">Shelf familiar</p><h3>{familiar.name}</h3><p>{familiar.description}</p><p className="note">{familiar.evidence} A playful description of the library pattern, not a personality test.</p></div>
          </div>
        </section>
      )}

      <section className="panel import-panel">
        <h2>Bring in a Steam library</h2>
        <p className="prose">Paste a public Steam profile URL or 64-bit SteamID. The Worker asks Steam for public game/playtime data; your Steam password is never requested.</p>
        <div className="profile-form">
          <input value={steamProfile} onChange={(e) => setSteamProfile(e.target.value)} placeholder="https://steamcommunity.com/id/..." aria-label="Steam profile URL or SteamID" />
          <button disabled={importing || !steamProfile.trim()} onClick={() => void importSteam()}>{importing ? "Reading…" : "Read public profile"}</button>
        </div>
        <p className="note">If Steam says the library is unavailable, set Profile → Privacy Settings → Game details to Public, or use the local-file method below.</p>
      </section>

      <section className="panel">
        <h2>Or keep it completely local</h2>
        <div className={over ? "drop over" : "drop"} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void accept([...e.dataTransfer.files]); }}>
          Drop <code>localconfig.vdf</code> and your <code>appmanifest_*.acf</code> files here
        </div>
        <div className="actions">
          <button onClick={() => picker.current?.click()}>Choose files</button>
          <button onClick={() => { setError(null); setLoaded(SAMPLE); }}>Back to the sample</button>
          <input ref={picker} type="file" multiple hidden onChange={(e) => void accept([...(e.target.files ?? [])])} />
        </div>
        {error && <p className="err">{error}</p>}
        {loaded.skipped > 0 && <p className="note">{loaded.skipped} file{loaded.skipped === 1 ? "" : "s"} skipped: not a manifest.</p>}
        <p className="note prose"><b>localconfig.vdf</b> is in <code>userdata/&lt;id&gt;/config/</code>, and the <b>appmanifest</b> files are in <code>steamapps/</code>. These files are parsed only in this browser.</p>
      </section>

      <section className="panel">
        <h2>Everything ({loaded.games.length})</h2>
        <div className="rows">
          {loaded.games.map((g) => (
            <div className={g.minutes === 0 ? "row cold" : "row"} key={g.appid}>
              <span className="hrs">{hours(g.minutes)}h</span>
              <span className="name">{g.name ?? <em>app {g.appid}</em>}</span>
              <span className="sz">{g.bytes === null ? (g.installed ? "size unknown" : loaded.kind === "steam" ? "Steam profile" : "not installed") : `${gb(g.bytes)} GB`}{g.lastPlayed !== null ? ` · ${ago(g.lastPlayed)}` : ""}</span>
            </div>
          ))}
        </div>
      </section>
      <Palette themes={palettes} storageKey="shelfwear:theme" />
    </div>
  );
}

function Shelf({ spines, label }: { spines: Spine[]; label: React.ReactNode }) {
  return (
    <div className="shelf">
      <div className="shelf-run">
        {spines.map(({ game, width, untouched }, i) => (
          <div key={game.appid} className={untouched ? "spine worn rise" : "spine rise"} style={{ width, ...stagger(i) }} title={`${game.name ?? game.appid} - ${gb(game.bytes ?? 0)} GB, ${hours(game.minutes)}h`}>
            <span className="spine-title">{game.name ?? `app ${game.appid}`}</span><span className="spine-size">{gb(game.bytes ?? 0)}</span>
          </div>
        ))}
      </div>
      <p className="shelf-label">{label}</p>
    </div>
  );
}
