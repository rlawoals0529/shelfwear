import { useCallback, useMemo, useRef, useState } from "react";
import { readLocalConfig, readManifest, buildLibrary, summarise, shelve, hours, gb, type Game, type Spine, type Stats } from "./lib/library.js";
import { analyticsFor, type LibraryAnalytics } from "./lib/analytics.js";
import { familiarFor, steamCover, steamHeader, topNine } from "./lib/profile.js";
import { compareLibraries, type LibraryComparison } from "./lib/compare.js";
import { downloadBlob, proxiedSteamCover, renderShareCard, shareCardFilename } from "./lib/share-card.js";
import {
  comparisonShareUrl,
  fetchPublicSteamLibrary,
  hasSteamProfileInput,
  normaliseSteamProfileInput,
  STEAM_PROFILE_PREFIX,
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

type CuteIconName =
  | "steam"
  | "shelf"
  | "sparkles"
  | "nine"
  | "friends"
  | "folder"
  | "list"
  | "clock"
  | "archive"
  | "download"
  | "copy"
  | "share"
  | "heart"
  | "chart";

function CuteIcon({ name, className = "" }: { name: CuteIconName; className?: string }) {
  const common = {
    className: `cute-icon ${className}`.trim(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "steam":
      return <svg {...common}><path d="M7.2 8.2h9.6a4.2 4.2 0 0 1 4 5.6l-.9 2.5a2.1 2.1 0 0 1-3.5.8l-1.8-1.8H9.4l-1.8 1.8a2.1 2.1 0 0 1-3.5-.8l-.9-2.5a4.2 4.2 0 0 1 4-5.6Z"/><path d="M8.4 11.1v4.2M6.3 13.2h4.2"/><circle cx="16.3" cy="12.2" r=".8" fill="currentColor" stroke="none"/><circle cx="18.3" cy="14.3" r=".8" fill="currentColor" stroke="none"/></svg>;
    case "shelf":
      return <svg {...common}><path d="M4 18.5h16M6 6.2v10.3M10 4.5v12M14 7.2v9.3M18 5.5v11"/><path d="M5.2 6.2h1.6M9.2 4.5h1.6M13.2 7.2h1.6M17.2 5.5h1.6"/></svg>;
    case "sparkles":
      return <svg {...common}><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m18.5 14 .7 2 .8.7-.8.7-.7 2-.7-2-.8-.7.8-.7.7-2ZM5 14.5l.5 1.4 1.4.5-1.4.5L5 18.3l-.5-1.4-1.4-.5 1.4-.5.5-1.4Z"/></svg>;
    case "nine":
      return <svg {...common}><rect x="4" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="16" y="4" width="4" height="4" rx="1"/><rect x="4" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="16" y="10" width="4" height="4" rx="1"/><rect x="4" y="16" width="4" height="4" rx="1"/><rect x="10" y="16" width="4" height="4" rx="1"/><rect x="16" y="16" width="4" height="4" rx="1"/></svg>;
    case "friends":
      return <svg {...common}><circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.5"/><path d="M3.8 19c.5-3.1 2.4-5 5.2-5s4.8 1.9 5.2 5M14.2 15.2c2.7-.5 5 .9 5.8 3.8"/></svg>;
    case "folder":
      return <svg {...common}><path d="M3.5 7.5h6l1.8 2H20a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5Z"/><path d="M3.5 10h18"/></svg>;
    case "list":
      return <svg {...common}><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 1.8"/></svg>;
    case "archive":
      return <svg {...common}><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M3.5 6h17V3.8H3.5V6ZM9 10.5h6"/></svg>;
    case "download":
      return <svg {...common}><path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M5 19h14"/></svg>;
    case "copy":
      return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
    case "share":
      return <svg {...common}><circle cx="6" cy="12" r="2"/><circle cx="17.5" cy="6" r="2"/><circle cx="17.5" cy="18" r="2"/><path d="m7.8 11 7.9-4M7.8 13l7.9 4"/></svg>;
    case "heart":
      return <svg {...common}><path d="M12 20s-7-4.2-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.8 12 20 12 20Z"/></svg>;
    case "chart":
      return <svg {...common}><path d="M5 19V11M10 19V5M15 19v-8M20 19V8"/><path d="M3.5 19.5h18"/></svg>;
  }
}

function SectionTitle({
  icon,
  eyebrow,
  children,
  note,
}: {
  icon: CuteIconName;
  eyebrow?: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <span className="section-icon"><CuteIcon name={icon} /></span>
      <div className="section-title-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{children}</h2>
        {note && <p className="note">{note}</p>}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  value,
  unit,
  label,
  warn = false,
}: {
  icon: CuteIconName;
  value: React.ReactNode;
  unit?: string;
  label: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={warn ? "metric metric-card warn" : "metric metric-card"}>
      <span className="metric-icon"><CuteIcon name={icon} /></span>
      <div className="metric-value-row">
        <b className="metric-value">{value}</b>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      <span className="metric-label">{label}</span>
    </div>
  );
}

const familiarEmoji = (animal: string): string =>
  ({ cat: "🐱", moth: "🦋", magpie: "🐦", fox: "🦊" } as Record<string, string>)[animal] ?? "✨";

const signatureEmoji = (object: string): string =>
  ({ bookends: "📚", campfire: "🔥", bookmarks: "🔖", shelves: "🪵" } as Record<string, string>)[object] ?? "♡";


export default function App() {
  const shared = useMemo(() => ({
    steam: sharedSteamFromSearch(window.location.search),
    compare: sharedComparisonFromSearch(window.location.search),
  }), []);

  const [loaded, setLoaded] = useState<Loaded>(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [steamError, setSteamError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [steamProfile, setSteamProfile] = useState(shared.steam ?? STEAM_PROFILE_PREFIX);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [cardRendering, setCardRendering] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [compareLeft, setCompareLeft] = useState(shared.compare?.[0] ?? STEAM_PROFILE_PREFIX);
  const [compareRight, setCompareRight] = useState(shared.compare?.[1] ?? STEAM_PROFILE_PREFIX);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Compared | null>(null);
  const [compareCopied, setCompareCopied] = useState(false);
  const [view, setView] = useState<"shelf" | "analytics">("shelf");
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
    if (normaliseSteamProfileInput(compareLeft) === normaliseSteamProfileInput(compareRight)) {
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
  const analytics = useMemo(() => analyticsFor(loaded.games), [loaded]);

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
        useSteamCovers: loaded.kind !== "local",
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
      <header className="hero">
        <div className="hero-charm" aria-hidden="true">
          <span className="hero-charm-spark">✦</span>
          <span className="hero-charm-face">૮₍ ˶ᵔ ᵕ ᵔ˶ ₎ა</span>
          <span className="hero-charm-label">your shelf buddy</span>
        </div>
        <p className="hero-kicker"><CuteIcon name="heart" /> a cozy look at your Steam shelf</p>
        <h1 className="display">shelf<span>wear</span></h1>
        <p className="tagline prose">
          See what your Steam library actually gets played, then turn the shape of it into
          something worth sharing. Local-file mode stays in this browser: nothing is uploaded
          and nothing is fetched.
        </p>
        {/* Whose library this is has to be settled before the first number is read, so it
            sits with the headline rather than down beside either import method. */}
        <div className="hero-meta">
          <p className="note source">Reading <b>{loaded.source}</b>.</p>
          {loaded.kind === "steam" && loaded.profile && (
            <div className="steam-identity">
              {loaded.profile.avatar && <img src={loaded.profile.avatar} alt="" loading="lazy" />}
              <span>{loaded.profile.name ?? loaded.profile.steamid}</span>
              <span className="note">public Steam data</span>
            </div>
          )}
        </div>
      </header>

      <nav className="view-tabs" aria-label="Shelfwear views">
        <button className={view === "shelf" ? "active" : ""} aria-pressed={view === "shelf"} onClick={() => setView("shelf")}>
          <CuteIcon name="shelf" className="button-icon" /> Shelf
        </button>
        <button className={view === "analytics" ? "active" : ""} aria-pressed={view === "analytics"} onClick={() => setView("analytics")}>
          <CuteIcon name="chart" className="button-icon" /> Analytics
        </button>
      </nav>

      {view === "shelf" ? (
        <>
      <section className="panel import-panel" id="steam">
        <div className="import-layout">
          <div className="import-copy">
            <SectionTitle icon="steam" eyebrow="Start here">Bring in your Steam library</SectionTitle>
            <p className="prose">
              Type your Steam vanity name after the prefilled URL, or paste a full public Steam profile URL or 64-bit SteamID. The Worker asks Steam for public
              game/playtime data; your Steam password is never requested.
            </p>
            {shared.steam && <p className="share-hint">A friend shared this public SteamID. Read it to rebuild their shelf live.</p>}
          </div>
          <div className="import-action">
            <div className="profile-form">
              <input
                value={steamProfile}
                onChange={(e) => setSteamProfile(e.target.value)}
                onFocus={(e) => {
                  if (e.currentTarget.value === STEAM_PROFILE_PREFIX) {
                    const end = e.currentTarget.value.length;
                    e.currentTarget.setSelectionRange(end, end);
                  }
                }}
                placeholder="https://steamcommunity.com/id/yourname"
                aria-label="Steam username, profile URL, or SteamID"
              />
              <button disabled={importing || !hasSteamProfileInput(steamProfile)} onClick={() => void importSteam()}>
                <CuteIcon name="sparkles" className="button-icon" />
                {importing ? "Reading…" : shared.steam ? "Load shared shelf" : "Read public profile"}
              </button>
            </div>
            {steamError && <p className="err">{steamError}</p>}
            <p className="note">
              If Steam says the library is unavailable, set Profile → Privacy Settings → Game
              details to Public, or use the local-file method below. Share links contain only a
              public SteamID; Shelfwear does not store a library snapshot.
            </p>
          </div>
        </div>
      </section>

      {(shelf.untouched.length > 0 || shelf.played.length > 0) && (
        <section className="panel figure shelf-panel">
          <SectionTitle icon="shelf" eyebrow="Little shelf view">The shelf</SectionTitle>
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

      <section className="panel stats-panel">
        <SectionTitle icon="sparkles" eyebrow="Tiny stats">What it adds up to</SectionTitle>
        <div className="grid stats-grid">
          <MetricCard icon="list" value={<Ticker value={stats.games} />} label="games here" />
          <MetricCard icon="clock" value={<Ticker value={hours(stats.totalMinutes)} decimals={1} />} label="hours played" />
          <MetricCard icon="heart" value={<Ticker value={stats.neverPlayed} />} label="never launched" warn />
          {loaded.kind === "steam" ? (
            <>
              <MetricCard icon="archive" value="—" label="disk data unavailable" />
              <MetricCard icon="folder" value="—" label="unplayed disk unavailable" />
            </>
          ) : (
            <>
              <MetricCard icon="archive" value={<Ticker value={gb(stats.installedBytes)} decimals={1} />} unit="GB" label="installed" />
              <MetricCard icon="folder" value={<Ticker value={gb(stats.unplayedBytes)} decimals={1} />} unit="GB" label="held by unplayed" warn />
            </>
          )}
          <MetricCard
            icon="sparkles"
            value={<Ticker value={stats.halfOfHoursIn} />}
            label={<>{stats.halfOfHoursIn === 1 ? "title makes up" : "titles make up"} half your hours</>}
          />
        </div>
        <p className="note prose stats-note">
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
              {loaded.kind === "sample" && <> The demo uses real Steam game artwork, but its playtime, dates, and disk figures are synthetic.</>}
            </>
          )}
        </p>
      </section>

      {nine.length > 0 && (
        <section className="panel social-panel">
          <div className="social-heading">
            <SectionTitle icon="nine" eyebrow="Your little game postcard" note="The nine games with the most recorded playtime.">Your nine</SectionTitle>
            <div className="social-actions">
              <button disabled={cardRendering} onClick={() => void downloadCard()}><CuteIcon name="download" className="button-icon" />{cardRendering ? "Making card…" : "Download card"}</button>
              <button onClick={() => void copyNine()}><CuteIcon name="copy" className="button-icon" />{copied ? "Copied" : "Copy summary"}</button>
              {loaded.kind === "steam" && loaded.steamid && (
                <button onClick={() => void copyShelfLink()}><CuteIcon name="share" className="button-icon" />{shareCopied ? "Link copied" : "Share shelf"}</button>
              )}
            </div>
          </div>
          {cardError && <p className="err">{cardError}</p>}
          <div className="nine-grid" aria-label="Top nine games by recorded playtime">
            {nine.map((game, i) => (
              <article className="nine-tile" key={game.appid}>
                {loaded.kind !== "local" && (
                  <img
                    src={proxiedSteamCover(game.appid)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      const image = event.currentTarget;
                      if (!image.dataset.fallback) {
                        image.dataset.fallback = "library";
                        image.src = steamCover(game.appid);
                      } else if (image.dataset.fallback === "library") {
                        image.dataset.fallback = "header";
                        image.src = steamHeader(game.appid);
                      } else {
                        image.hidden = true;
                      }
                    }}
                  />
                )}
                <div className="nine-shade" />
                <span className="nine-rank">{i + 1}</span>
                <div className="nine-copy"><b>{game.name}</b><span>{hours(game.minutes)}h</span></div>
              </article>
            ))}
          </div>
          <p className="note">Download card exports a 1080×1350 PNG using the current Shelfwear palette. Missing cover art falls back to a typographic tile.</p>
          <div className="familiar">
            <span className="familiar-mark familiar-cute" aria-hidden="true">
              <span className="familiar-emoji">{familiarEmoji(familiar.animal)}</span>
              <span className="familiar-kaomoji">♡</span>
            </span>
            <div>
              <p className="eyebrow">Shelf familiar</p>
              <h3>{familiar.name}</h3>
              <p>{familiar.description}</p>
              <p className="note">{familiar.evidence} A playful description of the library pattern, not a personality test.</p>
            </div>
          </div>
        </section>
      )}

      <section className="panel compare-panel" id="compare">
        <SectionTitle icon="friends" eyebrow="For friends">Compare two shelves</SectionTitle>
        <p className="prose">
          Put two public Steam profiles side by side. Overlap is the intersection divided by
          the combined unique library; played-together counts only games with recorded time on both profiles.
        </p>
        {shared.compare && <p className="share-hint">This comparison came from a stateless link. Load it to rebuild both public libraries live.</p>}
        <div className="compare-form">
          <input value={compareLeft} onChange={(e) => setCompareLeft(e.target.value)} placeholder={`${STEAM_PROFILE_PREFIX}first-user`} aria-label="First Steam profile" />
          <span aria-hidden="true">×</span>
          <input value={compareRight} onChange={(e) => setCompareRight(e.target.value)} placeholder={`${STEAM_PROFILE_PREFIX}second-user`} aria-label="Second Steam profile" />
          <button disabled={comparing || !hasSteamProfileInput(compareLeft) || !hasSteamProfileInput(compareRight)} onClick={() => void runComparison()}>
            <CuteIcon name="friends" className="button-icon" />
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
              <button onClick={() => void copyComparisonLink()}><CuteIcon name="share" className="button-icon" />{compareCopied ? "Link copied" : "Share comparison"}</button>
            </div>
            <div className="compare-metrics">
              <div className="metric"><span className="metric-icon"><CuteIcon name="heart" /></span><b>{Math.round(comparison.result.overlapPercent)}%</b><span>library overlap</span></div>
              <div className="metric"><span className="metric-icon"><CuteIcon name="shelf" /></span><b>{comparison.result.sharedCount}</b><span>owned by both</span></div>
              <div className="metric"><span className="metric-icon"><CuteIcon name="friends" /></span><b>{comparison.result.mutuallyPlayedCount}</b><span>played by both</span></div>
            </div>
            <div className="compare-signature familiar">
              <span className="familiar-mark familiar-cute" aria-hidden="true">
                <span className="familiar-emoji">{signatureEmoji(comparison.result.signature.object)}</span>
                <span className="familiar-kaomoji">✦</span>
              </span>
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
      <section className="panel local-panel">
        <SectionTitle icon="folder" eyebrow="Private mode">Or keep it completely local</SectionTitle>
        <div
          className={over ? "drop over" : "drop"}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void accept([...e.dataTransfer.files]); }}
        >
          Drop <code>localconfig.vdf</code> and your <code>appmanifest_*.acf</code> files here
        </div>
        <div className="actions">
          <button onClick={() => picker.current?.click()}><CuteIcon name="folder" className="button-icon" />Choose files</button>
          <button onClick={() => { setError(null); setLoaded(SAMPLE); }}><CuteIcon name="sparkles" className="button-icon" />Back to the sample</button>
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

      <section className="panel library-panel">
        <SectionTitle icon="list" eyebrow="The whole shelf">Everything ({loaded.games.length})</SectionTitle>
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
        </>
      ) : (
        <AnalyticsPage analytics={analytics} stats={stats} kind={loaded.kind} source={loaded.source} />
      )}
      <Palette themes={palettes} storageKey="shelfwear:theme:cozy-v2" initial="cherry-blossom-dusk" />
    </div>
  );
}


function AnalyticsPage({
  analytics,
  stats,
  kind,
  source,
}: {
  analytics: LibraryAnalytics;
  stats: Stats;
  kind: SourceKind;
  source: string;
}) {
  const maxBucket = Math.max(1, ...analytics.playtimeBuckets.map((bucket) => bucket.count));
  const maxTopShare = Math.max(1, ...analytics.topGames.map((game) => game.sharePercent));

  return (
    <main className="analytics-page">
      <section className="panel analytics-intro">
        <SectionTitle
          icon="chart"
          eyebrow="A closer look"
          note="Calculated only from the library currently loaded into Shelfwear."
        >
          Library analytics
        </SectionTitle>
        <div className="analytics-summary">
          <div className="analytics-donut-wrap">
            <div
              className="analytics-donut"
              aria-hidden="true"
              style={{ background: `conic-gradient(var(--accent) 0 ${analytics.utilizationPercent}%, var(--raised) ${analytics.utilizationPercent}% 100%)` }}
            >
              <div><b>{analytics.utilizationPercent}%</b><span>played</span></div>
            </div>
          </div>
          <div className="analytics-lead">
            <p className="eyebrow">Library use</p>
            <h3>{stats.played} of {stats.games} games have recorded playtime</h3>
            <p>
              {analytics.untouchedPercent}% of this library has no recorded playtime.
              {stats.totalMinutes > 0 && <> The most-played game accounts for <b>{analytics.topGameSharePercent}%</b> of all recorded hours.</>}
            </p>
            <p className="note">Reading {source}. This describes the data Shelfwear can see, not your tastes or personality.</p>
          </div>
        </div>
      </section>

      <section className="panel analytics-kpis">
        <SectionTitle icon="sparkles" eyebrow="At a glance">The shape of the shelf</SectionTitle>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi"><span>Played</span><b>{analytics.utilizationPercent}%</b><small>{stats.played} titles</small></div>
          <div className="analytics-kpi"><span>Untouched</span><b>{analytics.untouchedPercent}%</b><small>{stats.neverPlayed} titles</small></div>
          <div className="analytics-kpi"><span>Median played game</span><b>{analytics.medianPlayedHours}h</b><small>among games with time</small></div>
          <div className="analytics-kpi"><span>Half your hours</span><b>{stats.halfOfHoursIn}</b><small>{stats.halfOfHoursIn === 1 ? "title" : "titles"}</small></div>
        </div>
      </section>

      <section className="panel analytics-distribution">
        <SectionTitle icon="clock" eyebrow="Playtime">How deep the library goes</SectionTitle>
        <div className="analytics-bars">
          {analytics.playtimeBuckets.map((bucket) => (
            <div className="analytics-bar-row" key={bucket.label}>
              <span>{bucket.label}</span>
              <div className="analytics-bar-track"><i style={{ width: `${(bucket.count / maxBucket) * 100}%` }} /></div>
              <b>{bucket.count}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="panel analytics-hours">
        <SectionTitle icon="chart" eyebrow="Concentration">Where the hours go</SectionTitle>
        <div className="concentration-grid">
          <div><span>Top game</span><b>{analytics.topGameSharePercent}%</b></div>
          <div><span>Top 3 games</span><b>{analytics.topThreeSharePercent}%</b></div>
          <div><span>Top 9 games</span><b>{analytics.topNineSharePercent}%</b></div>
        </div>
        <div className="top-games-analytics">
          {analytics.topGames.map((game, index) => (
            <div className="top-game-row" key={game.appid}>
              <span className="top-game-rank">{index + 1}</span>
              <div className="top-game-copy">
                <b>{game.name ?? `app ${game.appid}`}</b>
                <div className="top-game-track"><i style={{ width: `${(game.sharePercent / maxTopShare) * 100}%` }} /></div>
              </div>
              <span className="top-game-hours">{game.hours}h</span>
              <span className="top-game-share">{game.sharePercent}%</span>
            </div>
          ))}
        </div>
      </section>

      {(analytics.knownDiskShareUntouchedPercent !== null || analytics.recentActivity) && (
        <section className="panel analytics-local">
          <SectionTitle icon="folder" eyebrow="Local-only detail">What your files add</SectionTitle>
          <div className="analytics-local-grid">
            {analytics.knownDiskShareUntouchedPercent !== null && (
              <div className="local-insight">
                <span>Known installed space held by unplayed games</span>
                <b>{analytics.knownDiskShareUntouchedPercent}%</b>
                <small>{stats.sizeIsPartial ? "Known-size games only; this is a floor." : "Based on installed-size records."}</small>
              </div>
            )}
            {analytics.recentActivity && (
              <div className="activity-insight">
                <span>Played games by last recorded launch</span>
                <div className="activity-chips">
                  {analytics.recentActivity.map((bucket) => <span key={bucket.label}><b>{bucket.count}</b>{bucket.label}</span>)}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {kind === "steam" && (
        <section className="analytics-footnote">
          <CuteIcon name="steam" />
          <p>Public Steam imports include owned games and lifetime playtime. Steam does not provide Shelfwear with local disk size or last-played timestamps through this import, so those analytics stay hidden rather than guessed.</p>
        </section>
      )}
    </main>
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
