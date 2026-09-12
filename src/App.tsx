import { useCallback, useMemo, useRef, useState } from "react";
import { readLocalConfig, readManifest, buildLibrary, summarise, shelve, hours, gb, type Game, type Spine } from "./lib/library.js";
import { SAMPLE_CONFIG, SAMPLE_MANIFESTS } from "./lib/sample.js";
import { Ticker, stagger } from "./lib/motion.js";
import { Palette } from "./lib/palette.js";
import palettes from "./theme/palettes.json";

type Manifest = NonNullable<ReturnType<typeof readManifest>>;

interface Loaded { games: Game[]; source: string; skipped: number }

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
  };
}

const SAMPLE: Loaded = {
  games: buildLibrary(readLocalConfig(SAMPLE_CONFIG), SAMPLE_MANIFESTS.map((m) => readManifest(m)!)),
  source: "the sample library",
  skipped: 0,
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

  const stats = useMemo(() => summarise(loaded.games), [loaded]);

  const shelf = useMemo(() => shelve(loaded.games), [loaded]);

  /** What a shelf of untouched games is holding, said once, under the shelf itself. */
  const untouchedBytes = shelf.untouched.reduce((n, s) => n + (s.game.bytes ?? 0), 0);

  return (
    <div className="wrap rhythm">
      <h1 className="display">shelf<span>wear</span></h1>
      <p className="tagline prose">
        What your Steam library actually gets played, read from the files already on your
        machine. Nothing is uploaded, nothing is fetched, and no key is needed.
      </p>
      {/* Whose library this is has to be settled before the first number is read, so it
          sits with the headline rather than down beside the file picker. */}
      <p className="note source">Reading <b>{loaded.source}</b>.</p>

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
            installed games have a size, so only they stand here.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>What it adds up to</h2>
        <div className="grid">
          <div className="metric"><b><Ticker value={stats.games} /></b><span>games here</span></div>
          <div className="metric"><b><Ticker value={hours(stats.totalMinutes)} decimals={1} /></b><span>hours played</span></div>
          <div className="metric warn"><b><Ticker value={stats.neverPlayed} /></b><span>never launched</span></div>
          <div className="metric"><b><Ticker value={gb(stats.installedBytes)} decimals={1} suffix=" GB" /></b><span>installed</span></div>
          <div className="metric warn"><b><Ticker value={gb(stats.unplayedBytes)} decimals={1} suffix=" GB" /></b><span>held by unplayed</span></div>
          <div className="metric">
            <b><Ticker value={stats.halfOfHoursIn} /></b>
            <span>{stats.halfOfHoursIn === 1 ? "title is" : "titles are"} half your hours</span>
          </div>
        </div>
        <p className="note prose">
          These are the apps this client has a record of, which is not the same as everything
          you own. A library you have never launched on this machine leaves no local trace at
          all, so treat every count here as a floor.
          {stats.sizeIsPartial && (
            <> <b>{stats.unknownSize}</b> installed game
              {stats.unknownSize === 1 ? " reports" : "s report"} no size, so the disk figures
              are a floor rather than a total.</>
          )}
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
                {g.bytes === null ? (g.installed ? "size unknown" : "not installed") : `${gb(g.bytes)} GB`}
                {" · "}{ago(g.lastPlayed)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* The picker comes last on purpose. The page already has a library on screen, so the
          first thing a visitor meets should be the answer, not an empty box to fill. */}
      <section className="panel">
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
        </p>
      </section>
      <Palette themes={palettes} storageKey="shelfwear:theme" />
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
