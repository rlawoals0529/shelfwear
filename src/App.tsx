import { useCallback, useMemo, useRef, useState } from "react";
import { readLocalConfig, readManifest, buildLibrary, summarise, hours, gb, type Game } from "./lib/library.js";
import { SAMPLE_CONFIG, SAMPLE_MANIFESTS } from "./lib/sample.js";

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

  // Area is disk. Only installed games have a size, so only they can be tiles.
  const tiles = useMemo(() => {
    const sized = loaded.games.filter((g) => g.installed && (g.bytes ?? 0) > 0);
    const total = sized.reduce((n, g) => n + (g.bytes ?? 0), 0) || 1;
    return sized
      .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
      .map((g) => ({ g, share: (g.bytes ?? 0) / total }));
  }, [loaded]);

  return (
    <div className="wrap rhythm">
      <h1 className="display">shelf<span>wear</span></h1>
      <p className="tagline prose">
        What your Steam library actually gets played, read from the files already on your
        machine. Nothing is uploaded, nothing is fetched, and no key is needed.
      </p>

      <section className="panel">
        <h2>Your files</h2>
        <div
          className={over ? "drop over" : "drop"}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void accept([...e.dataTransfer.files]); }}
        >
          Drop <code>localconfig.vdf</code> and your <code>appmanifest_*.acf</code> files here
        </div>
        <div className="row" style={{ marginTop: 14, display: "flex", gap: 10 }}>
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
        <p className="note prose">
          <b>localconfig.vdf</b> is in <code>userdata/&lt;id&gt;/config/</code>, and the
          <b> appmanifest</b> files are in <code>steamapps/</code>. The first knows your hours,
          the second knows the names and sizes. Either alone still works, with less to show.
        </p>
        {loaded.skipped > 0 && (
          <p className="note">{loaded.skipped} file{loaded.skipped === 1 ? "" : "s"} skipped: not a manifest.</p>
        )}
        {error && <p className="err">{error}</p>}
        <p className="note">Reading <b>{loaded.source}</b>.</p>
      </section>

      <section className="panel">
        <h2>The shelf</h2>
        <div className="grid">
          <div className="metric"><b>{stats.games}</b><span>games here</span></div>
          <div className="metric"><b>{hours(stats.totalMinutes).toLocaleString()}</b><span>hours played</span></div>
          <div className="metric warn"><b>{stats.neverPlayed}</b><span>never launched</span></div>
          <div className="metric"><b>{gb(stats.installedBytes)} GB</b><span>installed</span></div>
          <div className="metric warn"><b>{gb(stats.unplayedBytes)} GB</b><span>held by unplayed</span></div>
          <div className="metric">
            <b>{stats.halfOfHoursIn}</b>
            <span>{stats.halfOfHoursIn === 1 ? "title is" : "titles are"} half your hours</span>
          </div>
        </div>
        <p className="note prose">
          {stats.halfOfHoursIn > 0 && stats.games > 0 && (
            <>
              <b>{stats.halfOfHoursIn}</b> of your <b>{stats.games}</b> titles{" "}
              {stats.halfOfHoursIn === 1 ? "accounts" : "account"} for half the time you have spent,
              and <b>{gb(stats.unplayedBytes)} GB</b> is sitting on disk unplayed.{" "}
            </>
          )}
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

      {tiles.length > 0 && (
        <section className="panel">
          <h2>Disk, by game</h2>
          <div className="tree">
            {tiles.map(({ g, share }) => (
              <div
                key={g.appid}
                className={g.minutes === 0 ? "tile cold" : "tile"}
                style={{ flex: `${Math.max(share, 0.02)} 1 ${Math.max(90, share * 900)}px`, minHeight: 54 }}
                title={`${g.name ?? g.appid} - ${gb(g.bytes ?? 0)} GB, ${hours(g.minutes)}h`}
              >
                {g.name ?? g.appid}
                <small>{gb(g.bytes ?? 0)} GB · {hours(g.minutes)}h</small>
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i style={{ background: "color-mix(in srgb, var(--accent-2) 22%, var(--raised))" }} />played</span>
            <span><i style={{ background: "color-mix(in srgb, var(--warn) 26%, var(--raised))" }} />never launched</span>
          </div>
          <p className="note">Area is space on disk. Only installed games have a size, so only they appear.</p>
        </section>
      )}

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
    </div>
  );
}
