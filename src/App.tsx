import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readLocalConfig, readManifest, buildLibrary, summarise, shelve, hours, gb, type Game, type Spine, type Stats } from "./lib/library.js";
import { analyticsFor, type LibraryAnalytics } from "./lib/analytics.js";
import { familiarFor, steamCover, steamHeader, steamIcon, topNine } from "./lib/profile.js";
import { compareLibraries, type LibraryComparison, type SharedGame } from "./lib/compare.js";
import { comparePartyLibraries, type PartyComparison, type PartyGame } from "./lib/party.js";
import { comparisonCardFilename, curatedCardFilename, downloadBlob, familiarCardFilename, historyMilestoneFilename, proxiedSteamCover, renderComparisonCard, renderCuratedCard, renderFamiliarCard, renderHistoryMilestoneCard, renderShareCard, shareCardFilename } from "./lib/share-card.js";
import { libraryExportCsv, libraryExportFilename, libraryExportJson, type LibraryExportFormat } from "./lib/export.js";
import { fillResolvedProfileSlot, findResolvedProfileSlot } from "./lib/profile-slots.js";
import { renderShelfReceipt, shelfReceiptFilename } from "./lib/receipt-card.js";
import {
  comparisonShareUrl,
  fetchPublicSteamLibrary,
  fetchSteamAchievements,
  fetchSteamRecentActivity,
  inviteShareUrl,
  partyShareUrl,
  hasSteamProfileInput,
  normaliseSteamProfileInput,
  STEAM_PROFILE_PREFIX,
  sharedComparisonFromSearch,
  sharedInviteFromSearch,
  sharedPartyFromSearch,
  sharedSteamFromSearch,
  steamShareUrl,
  type PublicSteamLibrary,
  type SteamAchievementCabinet,
  type SteamRecentActivity,
  type SteamProfileSummary,
} from "./lib/steam.js";
import { SAMPLE_CONFIG, SAMPLE_MANIFESTS } from "./lib/sample.js";
import { curatedFromSearch, curatedShareUrl, SHELF_STORY_FINISHES, SHELF_STORY_PRESETS, SHELF_STORY_STYLES, steamAppIdFromInput, type CuratedTopGames } from "./lib/top-games.js";
import {
  CUSTOM_SHELF_PRESETS,
  MAX_CUSTOM_SHELVES,
  cleanShelfName,
  customShelvesBackupFilename,
  customShelvesBackupText,
  parseCustomShelvesBackup,
  readCustomShelves,
  shelfStoryFromCustomShelf,
  writeCustomShelves,
  type CustomShelf,
  type CustomShelfGame,
} from "./lib/custom-shelves.js";
import AchievementCabinet from "./AchievementCabinet.js";
import PickSomething from "./PickSomething.js";
import ShelfMap from "./ShelfMap.js";
import {
  clearShelfHistory,
  readShelfHistory,
  recordShelfHistoryVisit,
  shelfHistoryOverview,
  shelfHistorySparklinePoints,
  startShelfHistory,
  writeShelfHistory,
  type ShelfHistoryDelta,
  type ShelfHistoryRecord,
  type ShelfHistoryThreshold,
} from "./lib/history.js";
import { Ticker, stagger } from "./lib/motion.js";
import { Palette } from "./lib/palette.js";
import palettes from "./theme/palettes.json";

type Manifest = NonNullable<ReturnType<typeof readManifest>>;
type SourceKind = "sample" | "local" | "steam";
type LibrarySort = "most-played" | "least-played" | "name-az" | "name-za" | "recent" | "largest";
type LibraryFilter = "all" | "played" | "unplayed" | "hundred-plus" | "under-two" | "installed";
type LibraryDensity = "cozy" | "compact";

const LIBRARY_SORT_KEY = "shelfwear:library-sort";
const LIBRARY_DENSITY_KEY = "shelfwear:library-density";
const LIBRARY_SORT_VALUES: LibrarySort[] = ["most-played", "least-played", "name-az", "name-za", "recent", "largest"];
const LIBRARY_DENSITY_VALUES: LibraryDensity[] = ["cozy", "compact"];

function readLocalPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored && allowed.includes(stored as T) ? stored as T : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The UI
    // should still work normally; persistence is a convenience, not a dependency.
  }
}

interface Loaded {
  games: Game[];
  source: string;
  skipped: number;
  kind: SourceKind;
  steamid?: string;
  profile?: SteamProfileSummary;
  /** The profile text used for this successful public import, only for matching friend-form aliases. */
  profileInput?: string;
}

interface Compared {
  left: PublicSteamLibrary;
  right: PublicSteamLibrary;
  result: LibraryComparison;
}

interface Partied {
  libraries: PublicSteamLibrary[];
  result: PartyComparison;
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
  | "chart"
  | "plus"
  | "up"
  | "down"
  | "close";

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
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "up":
      return <svg {...common}><path d="m7 14 5-5 5 5"/></svg>;
    case "down":
      return <svg {...common}><path d="m7 10 5 5 5-5"/></svg>;
    case "close":
      return <svg {...common}><path d="m7 7 10 10M17 7 7 17"/></svg>;
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

function SteamProfileField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const trimmed = value.trim();
  const direct = /^https?:\/\//i.test(trimmed) || /^\d{17}$/.test(trimmed);

  return (
    <label className="steam-profile-control">
      <span className="steam-profile-label">{label}</span>
      <span className={direct ? "steam-profile-combo direct" : "steam-profile-combo"}>
        {!direct && <span className="steam-profile-prefix" aria-hidden="true">steamcommunity.com/id/</span>}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={direct ? "Steam profile URL or 64-bit SteamID" : "cozyplayer"}
          aria-label="Steam username, profile URL, or SteamID"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </span>
    </label>
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

const signatureEmoji = (object: string): string =>
  ({ bookends: "📚", campfire: "🔥", bookmarks: "🔖", shelves: "🪵" } as Record<string, string>)[object] ?? "♡";

const markArtworkShape = (image: HTMLImageElement): void => {
  const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
  if (ratio >= 0.82 && ratio <= 1.18) image.dataset.fallback = "icon";
  else if (ratio > 1.18) image.dataset.fallback = "wide";
};



export default function App() {
  const shared = useMemo(() => ({
    steam: sharedSteamFromSearch(window.location.search),
    compare: sharedComparisonFromSearch(window.location.search),
    invite: sharedInviteFromSearch(window.location.search),
    party: sharedPartyFromSearch(window.location.search),
    top: curatedFromSearch(window.location.search),
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
  const [receiptRendering, setReceiptRendering] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [familiarRendering, setFamiliarRendering] = useState(false);
  const [familiarError, setFamiliarError] = useState<string | null>(null);
  const [familiarCopied, setFamiliarCopied] = useState(false);
  const [compareLeft, setCompareLeft] = useState(shared.compare?.[0] ?? shared.invite ?? STEAM_PROFILE_PREFIX);
  const [compareRight, setCompareRight] = useState(shared.compare?.[1] ?? STEAM_PROFILE_PREFIX);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Compared | null>(null);
  const [compareCopied, setCompareCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteMessageCopied, setInviteMessageCopied] = useState(false);
  const [compareCardRendering, setCompareCardRendering] = useState(false);
  const [compareCardError, setCompareCardError] = useState<string | null>(null);
  const [partyProfiles, setPartyProfiles] = useState<string[]>(() =>
    shared.party ? [...shared.party] : [STEAM_PROFILE_PREFIX, STEAM_PROFILE_PREFIX, STEAM_PROFILE_PREFIX]
  );
  const [partying, setPartying] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [partyResult, setPartyResult] = useState<Partied | null>(null);
  const [partyShareCopied, setPartyShareCopied] = useState(false);
  const [partyDrawIndex, setPartyDrawIndex] = useState(0);
  const [view, setView] = useState<"shelf" | "analytics" | "shelves" | "top">(shared.top ? "top" : "shelf");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>(() =>
    readLocalPreference(LIBRARY_SORT_KEY, LIBRARY_SORT_VALUES, "most-played"),
  );
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [libraryDensity, setLibraryDensity] = useState<LibraryDensity>(() =>
    readLocalPreference(LIBRARY_DENSITY_KEY, LIBRARY_DENSITY_VALUES, "cozy"),
  );
  const [selectedLibraryGameAppId, setSelectedLibraryGameAppId] = useState<string | null>(null);
  const [customShelves, setCustomShelves] = useState<CustomShelf[]>(() => readCustomShelves());
  const [activeShelfId, setActiveShelfId] = useState<string | null>(() => readCustomShelves()[0]?.id ?? null);
  const [drawerShelfId, setDrawerShelfId] = useState<string>(() => readCustomShelves()[0]?.id ?? "");
  const [storySeed, setStorySeed] = useState<CuratedTopGames | null>(null);
  const [achievementCache, setAchievementCache] = useState<Record<string, SteamAchievementCabinet>>({});
  const [achievementLoadingKey, setAchievementLoadingKey] = useState<string | null>(null);
  const [achievementError, setAchievementError] = useState<{ key: string; message: string } | null>(null);
  const [recentActivity, setRecentActivity] = useState<SteamRecentActivity | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [shelfHistory, setShelfHistory] = useState<ShelfHistoryRecord | null>(null);
  const [shelfHistoryDelta, setShelfHistoryDelta] = useState<ShelfHistoryDelta | null>(null);
  const [historyMilestoneRendering, setHistoryMilestoneRendering] = useState<string | null>(null);
  const [historyMilestoneError, setHistoryMilestoneError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    writeLocalPreference(LIBRARY_SORT_KEY, librarySort);
  }, [librarySort]);

  useEffect(() => {
    writeLocalPreference(LIBRARY_DENSITY_KEY, libraryDensity);
  }, [libraryDensity]);

  useEffect(() => {
    writeCustomShelves(customShelves);
  }, [customShelves]);

  useEffect(() => {
    if (!customShelves.length) {
      setActiveShelfId(null);
      setDrawerShelfId("");
      return;
    }
    if (!activeShelfId || !customShelves.some((shelf) => shelf.id === activeShelfId)) {
      setActiveShelfId(customShelves[0]!.id);
    }
    if (!drawerShelfId || !customShelves.some((shelf) => shelf.id === drawerShelfId)) {
      setDrawerShelfId(customShelves[0]!.id);
    }
  }, [activeShelfId, customShelves, drawerShelfId]);

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
    setRecentActivity(null);
    setRecentError(null);
    setShelfHistory(null);
    setShelfHistoryDelta(null);
    setHistoryMilestoneError(null);
    setHistoryMilestoneRendering(null);
    setImporting(true);
    try {
      const data = await fetchPublicSteamLibrary(steamProfile);
      setLoaded({
        source: data.profile.name ?? `public Steam library ${data.steamid}`,
        skipped: 0,
        kind: "steam",
        steamid: data.steamid,
        profile: data.profile,
        profileInput: steamProfile,
        games: data.games,
      });

      const savedHistory = readShelfHistory(data.steamid);
      if (savedHistory) {
        const visit = recordShelfHistoryVisit(savedHistory, data.games, Date.now());
        writeShelfHistory(visit.record);
        setShelfHistory(visit.record);
        setShelfHistoryDelta(visit.delta);
      }

      const equivalentInputs = [steamProfile, data.profile.profileUrl ?? ""];
      if (shared.invite) {
        if (!hasSteamProfileInput(compareRight)) setCompareRight(data.steamid);
      } else if (!shared.compare) {
        const filled = fillResolvedProfileSlot(
          [compareLeft, compareRight],
          data.steamid,
          equivalentInputs,
        );
        if (filled.changed) {
          setCompareLeft(filled.values[0] ?? STEAM_PROFILE_PREFIX);
          setCompareRight(filled.values[1] ?? STEAM_PROFILE_PREFIX);
        }
      }

      if (!shared.party) {
        setPartyProfiles((current) =>
          fillResolvedProfileSlot(current, data.steamid, equivalentInputs).values
        );
      }
    } catch (e) {
      setSteamError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [compareLeft, compareRight, shared.compare, shared.invite, shared.party, steamProfile]);

  const loadRecentActivity = useCallback(async () => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    setRecentError(null);
    setRecentLoading(true);
    try {
      setRecentActivity(await fetchSteamRecentActivity(loaded.steamid));
    } catch (error) {
      setRecentError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecentLoading(false);
    }
  }, [loaded.kind, loaded.steamid]);

  const startHistory = useCallback(() => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    const record = startShelfHistory(loaded.steamid, loaded.games, Date.now());
    writeShelfHistory(record);
    setShelfHistory(record);
    setShelfHistoryDelta(null);
    setHistoryMilestoneError(null);
  }, [loaded.games, loaded.kind, loaded.steamid]);

  const clearHistory = useCallback(() => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    clearShelfHistory(loaded.steamid);
    setShelfHistory(null);
    setShelfHistoryDelta(null);
    setHistoryMilestoneError(null);
    setHistoryMilestoneRendering(null);
  }, [loaded.kind, loaded.steamid]);

  const downloadHistoryMilestone = useCallback(async (milestone: ShelfHistoryThreshold) => {
    if (loaded.kind !== "steam" || !shelfHistoryDelta) return;
    const game = loaded.games.find((candidate) => candidate.appid === milestone.appid);
    if (!game) return;

    const key = milestone.appid + ":" + milestone.hours;
    setHistoryMilestoneError(null);
    setHistoryMilestoneRendering(key);
    try {
      const blob = await renderHistoryMilestoneCard({
        gameName: game.name ?? `app ${game.appid}`,
        appid: game.appid,
        iconHash: game.iconHash ?? null,
        profileName: loaded.profile?.name ?? null,
        milestoneHours: milestone.hours,
        fromMinutes: milestone.fromMinutes,
        toMinutes: milestone.toMinutes,
        fromAt: shelfHistoryDelta.fromAt,
        toAt: shelfHistoryDelta.toAt,
      });
      downloadBlob(blob, historyMilestoneFilename(game.name ?? `app ${game.appid}`, milestone.hours));
    } catch (error) {
      setHistoryMilestoneError(error instanceof Error ? error.message : String(error));
    } finally {
      setHistoryMilestoneRendering((current) => current === key ? null : current);
    }
  }, [loaded.games, loaded.kind, loaded.profile?.name, shelfHistoryDelta]);

  const runComparison = useCallback(async () => {
    setCompareError(null);
    setCompareCardError(null);
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

  const runPartyShelf = useCallback(async () => {
    setPartyError(null);
    setPartyResult(null);
    setPartyDrawIndex(0);

    const normalized = partyProfiles.map(normaliseSteamProfileInput);
    if (normalized.length < 3 || normalized.length > 5 || normalized.some((profile) => !profile)) {
      setPartyError("Party Shelf needs 3–5 public Steam profiles.");
      return;
    }
    if (new Set(normalized).size !== normalized.length) {
      setPartyError("Use a different Steam profile in each Party Shelf slot.");
      return;
    }

    setPartying(true);
    try {
      const libraries = await Promise.all(partyProfiles.map(fetchPublicSteamLibrary));
      const steamids = libraries.map((library) => library.steamid);
      if (new Set(steamids).size !== libraries.length) {
        throw new Error("Two Party Shelf inputs resolve to the same Steam profile.");
      }
      setPartyResult({ libraries, result: comparePartyLibraries(libraries) });
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : String(error));
    } finally {
      setPartying(false);
    }
  }, [partyProfiles]);

  const updatePartyProfile = useCallback((index: number, value: string) => {
    setPartyProfiles((current) => current.map((profile, i) => i === index ? value : profile));
  }, []);

  const addPartyProfile = useCallback(() => {
    setPartyProfiles((current) => current.length >= 5 ? current : [...current, STEAM_PROFILE_PREFIX]);
  }, []);

  const removePartyProfile = useCallback((index: number) => {
    setPartyProfiles((current) => current.length <= 3 ? current : current.filter((_, i) => i !== index));
  }, []);

  const copyPartyLink = useCallback(async () => {
    if (!partyResult) return;
    await navigator.clipboard.writeText(partyShareUrl(window.location.href, partyResult.libraries.map((library) => library.steamid)));
    setPartyShareCopied(true);
    window.setTimeout(() => setPartyShareCopied(false), 1600);
  }, [partyResult]);

  const partyDrawPool = partyResult?.result.ownedByAll ?? [];
  const partyDraw = partyDrawPool.length ? partyDrawPool[partyDrawIndex % partyDrawPool.length] ?? null : null;

  const stats = useMemo(() => summarise(loaded.games), [loaded]);
  const shelf = useMemo(() => shelve(loaded.games), [loaded]);
  const nine = useMemo(() => topNine(loaded.games), [loaded]);
  const familiar = useMemo(() => familiarFor(loaded.games), [loaded]);
  const analytics = useMemo(() => analyticsFor(loaded.games), [loaded]);
  const historyNameByAppId = useMemo(
    () => new Map(loaded.games.map((game) => [game.appid, game.name ?? `app ${game.appid}`])),
    [loaded.games],
  );

  const historyObservationOverview = useMemo(
    () => shelfHistory && loaded.kind === "steam"
      ? shelfHistoryOverview(shelfHistory, loaded.games, shelfHistory.lastCheckedAt)
      : null,
    [loaded.games, loaded.kind, shelfHistory],
  );
  const historySparkPoints = useMemo(
    () => historyObservationOverview
      ? shelfHistorySparklinePoints(historyObservationOverview.observations)
      : [],
    [historyObservationOverview],
  );
  const historySparkPolyline = historySparkPoints.map((point) => `${point.x},${point.y}`).join(" ");

  // Installation, disk size, and local recency are only trustworthy after the
  // visitor explicitly loads files from this PC. The sample contains synthetic
  // local-shaped data, so it must not unlock real-device controls.
  const hasRealLocalData = loaded.kind === "local";
  const loadedProfileAliases = loaded.kind === "steam"
    ? [loaded.profileInput ?? "", loaded.profile?.profileUrl ?? ""]
    : [];
  const compareLoadedSlot = loaded.kind === "steam" && loaded.steamid
    ? findResolvedProfileSlot([compareLeft, compareRight], loaded.steamid, loadedProfileAliases)
    : null;
  const partyLoadedSlot = loaded.kind === "steam" && loaded.steamid
    ? findResolvedProfileSlot(partyProfiles, loaded.steamid, loadedProfileAliases)
    : null;
  const compareHasOpenSlot = [compareLeft, compareRight].some((profile) => !hasSteamProfileInput(profile));
  const partyHasOpenSlot = partyProfiles.some((profile) => !hasSteamProfileInput(profile));

  const useLoadedShelfInComparison = () => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    const filled = fillResolvedProfileSlot(
      [compareLeft, compareRight],
      loaded.steamid,
      loadedProfileAliases,
    );
    if (!filled.changed) return;
    setCompareLeft(filled.values[0] ?? STEAM_PROFILE_PREFIX);
    setCompareRight(filled.values[1] ?? STEAM_PROFILE_PREFIX);
  };

  const useLoadedShelfInParty = () => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    setPartyProfiles((current) =>
      fillResolvedProfileSlot(current, loaded.steamid!, loadedProfileAliases).values
    );
  };
  const shelfMapEntries = useMemo(() => {
    const entries = [{ id: "steam", label: "Load" }];
    if (loaded.kind === "steam" && loaded.steamid) {
      entries.push(
        { id: "recent", label: "Recent" },
        { id: "history", label: "History" },
      );
    }
    if (shelf.untouched.length > 0 || shelf.played.length > 0) {
      entries.push({ id: "disk-shelf", label: "Disk shelf" });
    }
    entries.push(
      { id: "overview", label: "Overview" },
      { id: "pick", label: "Pick" },
    );
    if (nine.length > 0) entries.push({ id: "your-nine", label: "Your nine" });
    entries.push(
      { id: "compare", label: "Compare" },
      { id: "party", label: "Party" },
      { id: "local", label: "Local files" },
      { id: "library", label: "Library" },
    );
    return entries;
  }, [loaded.kind, loaded.steamid, nine.length, shelf.played.length, shelf.untouched.length]);
  const effectiveLibrarySort: LibrarySort =
    !hasRealLocalData && (librarySort === "recent" || librarySort === "largest")
      ? "most-played"
      : librarySort;
  const effectiveLibraryFilter: LibraryFilter =
    !hasRealLocalData && libraryFilter === "installed" ? "all" : libraryFilter;

  const visibleGames = useMemo(() => {
    const query = libraryQuery.trim().toLocaleLowerCase();
    const filtered = loaded.games.filter((game) => {
      if (query && !(game.name ?? `app ${game.appid}`).toLocaleLowerCase().includes(query)) return false;
      if (effectiveLibraryFilter === "played" && game.minutes <= 0) return false;
      if (effectiveLibraryFilter === "unplayed" && game.minutes !== 0) return false;
      if (effectiveLibraryFilter === "hundred-plus" && game.minutes < 6000) return false;
      if (effectiveLibraryFilter === "under-two" && !(game.minutes > 0 && game.minutes < 120)) return false;
      if (effectiveLibraryFilter === "installed" && !game.installed) return false;
      return true;
    });

    const name = (game: Game) => (game.name ?? `app ${game.appid}`).toLocaleLowerCase();
    return [...filtered].sort((a, b) => {
      switch (effectiveLibrarySort) {
        case "least-played":
          return a.minutes - b.minutes || name(a).localeCompare(name(b));
        case "name-az":
          return name(a).localeCompare(name(b));
        case "name-za":
          return name(b).localeCompare(name(a));
        case "recent":
          return (b.lastPlayed ?? -1) - (a.lastPlayed ?? -1) || b.minutes - a.minutes;
        case "largest":
          return (b.bytes ?? -1) - (a.bytes ?? -1) || b.minutes - a.minutes;
        case "most-played":
        default:
          return b.minutes - a.minutes || name(a).localeCompare(name(b));
      }
    });
  }, [effectiveLibraryFilter, effectiveLibrarySort, libraryQuery, loaded.games]);

  const selectedLibraryGame = useMemo(
    () => loaded.games.find((game) => game.appid === selectedLibraryGameAppId) ?? null,
    [loaded.games, selectedLibraryGameAppId],
  );

  const selectedAchievementKey = loaded.kind === "steam" && loaded.steamid && selectedLibraryGame
    ? loaded.steamid + ":" + selectedLibraryGame.appid
    : null;
  const selectedAchievementCabinet = selectedAchievementKey ? achievementCache[selectedAchievementKey] ?? null : null;

  const loadAchievementCabinet = useCallback(async (game: Game) => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    const key = loaded.steamid + ":" + game.appid;
    if (achievementCache[key]) {
      setAchievementError(null);
      return;
    }
    setAchievementError(null);
    setAchievementLoadingKey(key);
    try {
      const cabinet = await fetchSteamAchievements(loaded.steamid, game.appid);
      setAchievementCache((current) => ({ ...current, [key]: cabinet }));
    } catch (error) {
      setAchievementError({ key, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setAchievementLoadingKey((current) => current === key ? null : current);
    }
  }, [achievementCache, loaded.kind, loaded.steamid]);

  const createCustomShelf = useCallback((name: string): string | null => {
    const cleanName = cleanShelfName(name);
    if (!cleanName || customShelves.length >= MAX_CUSTOM_SHELVES) return null;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `shelf-${Date.now()}-${customShelves.length + 1}`;
    const now = Date.now();
    setCustomShelves((current) => [...current, { id, name: cleanName, games: [], createdAt: now, updatedAt: now }]);
    setActiveShelfId(id);
    setDrawerShelfId(id);
    return id;
  }, [customShelves.length]);

  const addGameToCustomShelf = useCallback((shelfId: string, game: Game) => {
    setCustomShelves((current) => current.map((shelf) => {
      if (shelf.id !== shelfId || shelf.games.some((entry) => entry.appid === game.appid)) return shelf;
      const next: CustomShelfGame = {
        appid: game.appid,
        name: game.name ?? `app ${game.appid}`,
        ...(game.iconHash ? { iconHash: game.iconHash } : {}),
      };
      return { ...shelf, games: [...shelf.games, next].slice(0, 50), updatedAt: Date.now() };
    }));
  }, []);

  const updateCustomShelf = useCallback((shelfId: string, updater: (shelf: CustomShelf) => CustomShelf) => {
    setCustomShelves((current) => current.map((shelf) =>
      shelf.id === shelfId ? { ...updater(shelf), updatedAt: Date.now() } : shelf
    ));
  }, []);

  const deleteCustomShelf = useCallback((shelfId: string) => {
    setCustomShelves((current) => current.filter((shelf) => shelf.id !== shelfId));
  }, []);

  const restoreCustomShelves = useCallback((next: CustomShelf[]) => {
    setCustomShelves(next);
    setActiveShelfId(next[0]?.id ?? null);
    setDrawerShelfId(next[0]?.id ?? "");
  }, []);

  const turnShelfIntoStory = useCallback((shelf: CustomShelf) => {
    const seed = shelfStoryFromCustomShelf(shelf);
    setStorySeed({
      ...seed,
      style: "scrapbook",
      finish: "archive",
    });
    setView("top");
  }, []);

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

  const downloadReceipt = useCallback(async () => {
    setReceiptError(null);
    setReceiptRendering(true);
    try {
      const profileName = loaded.kind === "steam" ? loaded.profile?.name ?? null : null;
      const blob = await renderShelfReceipt({
        games: loaded.games,
        source: loaded.kind,
        sourceLabel: loaded.source,
        profileName,
        generatedAt: Date.now(),
      });
      downloadBlob(blob, shelfReceiptFilename(profileName));
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : String(error));
    } finally {
      setReceiptRendering(false);
    }
  }, [loaded]);

  const downloadFamiliarCard = useCallback(async () => {
    setFamiliarError(null);
    setFamiliarRendering(true);
    try {
      const profileName = loaded.kind === "steam" ? loaded.profile?.name ?? null : null;
      const blob = await renderFamiliarCard({ familiar, profileName });
      downloadBlob(blob, familiarCardFilename(familiar.name));
    } catch (error) {
      setFamiliarError(error instanceof Error ? error.message : String(error));
    } finally {
      setFamiliarRendering(false);
    }
  }, [familiar, loaded.kind, loaded.profile?.name]);

  const copyFamiliar = useCallback(async () => {
    const text = [
      `My Shelfwear familiar: ${familiar.name} ${familiar.glyph}`,
      familiar.description,
      familiar.evidence,
      ...familiar.signals.map((signal) => `${signal.label}: ${signal.value}`),
      "A library pattern, not a personality test.",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setFamiliarCopied(true);
    window.setTimeout(() => setFamiliarCopied(false), 1600);
  }, [familiar]);

  const copyShelfLink = useCallback(async () => {
    if (!loaded.steamid) return;
    await navigator.clipboard.writeText(steamShareUrl(window.location.href, loaded.steamid));
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);
  }, [loaded.steamid]);

  const downloadLibraryExport = useCallback((format: LibraryExportFormat) => {
    const context = {
      kind: loaded.kind,
      sourceLabel: loaded.source,
      generatedAt: new Date().toISOString(),
      ...(loaded.steamid ? { steamid: loaded.steamid } : {}),
      ...(loaded.profile?.name ? { profileName: loaded.profile.name } : {}),
    };
    const body = format === "csv"
      ? libraryExportCsv(loaded.games, context)
      : libraryExportJson(loaded.games, context);
    const type = format === "csv"
      ? "text/csv;charset=utf-8"
      : "application/json;charset=utf-8";
    downloadBlob(new Blob([body], { type }), libraryExportFilename(format, context));
  }, [loaded]);

  const copyComparisonLink = useCallback(async () => {
    if (!comparison) return;
    await navigator.clipboard.writeText(comparisonShareUrl(window.location.href, comparison.left.steamid, comparison.right.steamid));
    setCompareCopied(true);
    window.setTimeout(() => setCompareCopied(false), 1600);
  }, [comparison]);

  const copyInviteLink = useCallback(async () => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    await navigator.clipboard.writeText(inviteShareUrl(window.location.href, loaded.steamid));
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1600);
  }, [loaded.kind, loaded.steamid]);

  const copyInviteMessage = useCallback(async () => {
    if (loaded.kind !== "steam" || !loaded.steamid) return;
    const url = inviteShareUrl(window.location.href, loaded.steamid);
    await navigator.clipboard.writeText(`Compare our Steam shelves on Shelfwear: ${url}`);
    setInviteMessageCopied(true);
    window.setTimeout(() => setInviteMessageCopied(false), 1600);
  }, [loaded.kind, loaded.steamid]);

  const downloadComparisonCard = useCallback(async () => {
    if (!comparison) return;
    setCompareCardError(null);
    setCompareCardRendering(true);
    const leftName = displayName(comparison.left);
    const rightName = displayName(comparison.right);
    try {
      const blob = await renderComparisonCard({
        leftName,
        rightName,
        comparison: comparison.result,
      });
      downloadBlob(blob, comparisonCardFilename(leftName, rightName));
    } catch (error) {
      setCompareCardError(error instanceof Error ? error.message : String(error));
    } finally {
      setCompareCardRendering(false);
    }
  }, [comparison]);

  return (
    <div className="wrap rhythm">
      <header className="hero" id="shelfwear-top">
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
          {loaded.kind === "steam" && loaded.profile ? (
            <div className="steam-identity" title={loaded.profile.name ?? loaded.profile.steamid}>
              {loaded.profile.avatar && <img src={loaded.profile.avatar} alt="" loading="lazy" />}
              <span className="steam-identity-name">{loaded.profile.name ?? loaded.profile.steamid}</span>
              <span className="steam-data-badge">public Steam data</span>
            </div>
          ) : (
            <p className="note source">
              <span>Reading</span>
              <b title={loaded.source}>{loaded.source}</b>
            </p>
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
        <button className={view === "shelves" ? "active" : ""} aria-pressed={view === "shelves"} onClick={() => setView("shelves")}>
          <CuteIcon name="archive" className="button-icon" /> My shelves
        </button>
        <button className={view === "top" ? "active" : ""} aria-pressed={view === "top"} onClick={() => setView("top")}>
          <CuteIcon name="heart" className="button-icon" /> Shelf stories
        </button>
      </nav>

      {view === "shelf" && <ShelfMap entries={shelfMapEntries} />}

      {view === "shelf" ? (
        <>
      <section className="panel import-panel" id="steam">
        <div className="import-layout">
          <div className="import-copy">
            <SectionTitle icon="steam" eyebrow="Start here">Bring in your Steam library</SectionTitle>
            <p className="prose">
              Type just the end of your Steam custom URL, like <b>cozyplayer</b>, or paste a full public Steam profile URL or 64-bit SteamID. Shelfwear fills in
              steamcommunity.com/id/ for simple usernames; your Steam password is never requested.
            </p>
            {shared.steam && <p className="share-hint">A friend shared this public SteamID. Read it to rebuild their shelf live.</p>}
          </div>
          <div className="import-action">
            <div className="profile-form">
              <SteamProfileField
                value={steamProfile}
                onChange={setSteamProfile}
                label="Steam profile"
              />
              <button disabled={importing || !hasSteamProfileInput(steamProfile)} onClick={() => void importSteam()}>
                <CuteIcon name="sparkles" className="button-icon" />
                {importing ? "Reading…" : shared.steam ? "Load shared shelf" : "Read public profile"}
              </button>
            </div>
            {steamError && <p className="err">{steamError}</p>}
            {loaded.kind === "steam" && loaded.profile && (
              <div className="import-profile-preview" aria-live="polite">
                {loaded.profile.avatar && <img src={loaded.profile.avatar} alt="" loading="lazy" />}
                <div>
                  <span className="eyebrow">Connected</span>
                  <b>{loaded.profile.name ?? loaded.profile.steamid}</b>
                  <small>{loaded.profile.steamid}</small>
                </div>
                {loaded.profile.profileUrl && (
                  <a href={loaded.profile.profileUrl} target="_blank" rel="noreferrer">View profile</a>
                )}
              </div>
            )}
            <p className="note">
              If Steam says the library is unavailable, set Profile → Privacy Settings → Game
              details to Public, or use the local-file method below. Share links contain only a
              public SteamID; Shelfwear does not store a library snapshot.
            </p>
          </div>
        </div>
      </section>

      {loaded.kind === "steam" && loaded.steamid && (
        <section className="panel recent-panel" id="recent">
          <div className="recent-heading">
            <SectionTitle
              icon="clock"
              eyebrow="Off the shelf lately"
              note="Loaded separately from Steam's recent-games endpoint."
            >
              Recently played
            </SectionTitle>
            <button type="button" disabled={recentLoading} onClick={() => void loadRecentActivity()}>
              <CuteIcon name="sparkles" className="button-icon" />
              {recentLoading ? "Checking recent activity…" : recentActivity ? "Refresh recent activity" : "Load recent activity"}
            </button>
          </div>
          <p className="note prose recent-boundary">
            This is Steam&apos;s recent-games list. Shelfwear shows the lifetime playtime and, when Steam returns it,
            playtime from the last two weeks. It does not turn this into a local last-launch timestamp.
          </p>
          {recentError && <p className="err">{recentError}</p>}
          {recentActivity && (
            recentActivity.games.length > 0 ? (
              <div className="recent-ledger" aria-label="Recently played games from Steam">
                <div className="recent-ledger-meta">
                  <span>SHELFWEAR / RECENT CHECKOUTS</span>
                  <span>{recentActivity.totalCount} RECENT {recentActivity.totalCount === 1 ? "GAME" : "GAMES"}</span>
                </div>
                <div className="recent-game-grid">
                  {recentActivity.games.map((game) => (
                    <article className="recent-game-slip" key={game.appid}>
                      <span className="recent-game-art" aria-hidden="true">
                        <span>{(game.name ?? `app ${game.appid}`).trim().charAt(0).toUpperCase() || "♡"}</span>
                        <img
                          src={proxiedSteamCover(game.appid, game.iconHash)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={(event) => { event.currentTarget.hidden = true; }}
                        />
                      </span>
                      <div className="recent-game-copy">
                        <b>{game.name ?? `app ${game.appid}`}</b>
                        <span>{hours(game.totalMinutes)}h lifetime</span>
                        <small>
                          {game.twoWeekMinutes === null
                            ? "Steam did not return a two-week playtime value"
                            : `${hours(game.twoWeekMinutes)}h in the last 2 weeks`}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="note">Steam returned no recently played games for this public profile.</p>
            )
          )}
        </section>
      )}

      {loaded.kind === "steam" && loaded.steamid && (
        <section className="panel history-panel" id="history">
          <div className="history-heading">
            <SectionTitle
              icon="archive"
              eyebrow="This browser only"
              note="Snapshots begin only after you turn history on."
            >
              Shelf history
            </SectionTitle>
            {shelfHistory ? (
              <button type="button" className="history-clear" onClick={clearHistory}>Clear local history</button>
            ) : (
              <button type="button" onClick={startHistory}>Start history on this browser</button>
            )}
          </div>

          {!shelfHistory ? (
            <div className="history-empty">
              <b>No saved baseline yet.</b>
              <p>
                Turn history on to save today&apos;s AppIDs and lifetime playtime locally in this browser.
                Future public-profile loads can then compare against that real saved state.
              </p>
              <small>Nothing before the baseline can be reconstructed.</small>
            </div>
          ) : (
            <div className="history-ledger">
              <div className="history-ledger-meta">
                <span>SHELFWEAR / LOCAL HISTORY</span>
                <span>{shelfHistory.snapshots.length} SAVED {shelfHistory.snapshots.length === 1 ? "STATE" : "STATES"}</span>
              </div>

              <div className="history-current">
                <div>
                  <small>Last checked in Shelfwear</small>
                  <b>{new Date(shelfHistory.lastCheckedAt).toLocaleString()}</b>
                </div>
                <div>
                  <small>Current public shelf</small>
                  <b>{loaded.games.length} games · {hours(loaded.games.reduce((sum, game) => sum + game.minutes, 0))}h</b>
                </div>
              </div>

              {historyObservationOverview && historyObservationOverview.observations.length > 1 && (
                <div className="history-observation-overview">
                  <div className="history-observation-copy">
                    <small>{historyObservationOverview.baselineRetained ? "Since history began" : "Since earliest retained state"}</small>
                    <b>
                      {historyObservationOverview.minutesDelta > 0 ? "+" : ""}{hours(historyObservationOverview.minutesDelta)}h
                      {" · "}
                      {historyObservationOverview.gamesDelta > 0 ? "+" : ""}{historyObservationOverview.gamesDelta} {Math.abs(historyObservationOverview.gamesDelta) === 1 ? "game" : "games"}
                      {" · "}
                      {historyObservationOverview.playedDelta > 0 ? "+" : ""}{historyObservationOverview.playedDelta} played
                    </b>
                    <span>
                      {new Date(historyObservationOverview.fromAt).toLocaleDateString()} → last check
                    </span>
                  </div>
                  <div className="history-observation-chart">
                    <svg
                      viewBox="0 0 240 56"
                      role="img"
                      aria-label={`Recorded hours across ${historySparkPoints.length} saved Shelfwear states`}
                      preserveAspectRatio="none"
                    >
                      <polyline className="history-observation-line" points={historySparkPolyline} />
                      {historySparkPoints.map((point, index) => (
                        <circle
                          className="history-observation-dot"
                          key={point.at + ":" + index}
                          cx={point.x}
                          cy={point.y}
                          r="3.5"
                        />
                      ))}
                    </svg>
                    <small>
                      Dots are saved Shelfwear states. Lines only connect observations; they do not reconstruct when play happened.
                    </small>
                  </div>
                </div>
              )}

              {shelfHistoryDelta ? (
                <div className="history-delta">
                  <div className="history-delta-metrics">
                    <span><small>Recorded hours</small><b>{shelfHistoryDelta.minutesDelta > 0 ? "+" : ""}{hours(shelfHistoryDelta.minutesDelta)}h</b></span>
                    <span><small>Library count</small><b>{shelfHistoryDelta.gamesDelta > 0 ? "+" : ""}{shelfHistoryDelta.gamesDelta}</b></span>
                    <span><small>Now newly played</small><b>{shelfHistoryDelta.newlyPlayed.length}</b></span>
                  </div>

                  {shelfHistoryDelta.changed ? (
                    <>
                      <div className="history-events">
                      {shelfHistoryDelta.newlyOwned.length > 0 && (
                        <div>
                          <small>New to the saved shelf</small>
                          <p>{shelfHistoryDelta.newlyOwned.slice(0, 5).map((appid) => historyNameByAppId.get(appid) ?? `app ${appid}`).join(" · ")}</p>
                        </div>
                      )}
                      {shelfHistoryDelta.newlyPlayed.length > 0 && (
                        <div>
                          <small>Now has recorded playtime</small>
                          <p>{shelfHistoryDelta.newlyPlayed.slice(0, 5).map((appid) => historyNameByAppId.get(appid) ?? `app ${appid}`).join(" · ")}</p>
                        </div>
                      )}
                      {shelfHistoryDelta.thresholds.length > 0 && (
                        <div className="history-milestone-block">
                          <small>Hour milestones crossed between saved states</small>
                          <div className="history-milestones">
                            {shelfHistoryDelta.thresholds.slice(0, 6).map((entry) => {
                              const key = entry.appid + ":" + entry.hours;
                              return (
                                <div className="history-milestone-row" key={key}>
                                  <span>
                                    <b>{historyNameByAppId.get(entry.appid) ?? `app ${entry.appid}`}</b>
                                    <small>{hours(entry.fromMinutes)}h → {hours(entry.toMinutes)}h · crossed {entry.hours}h</small>
                                  </span>
                                  <button
                                    type="button"
                                    disabled={historyMilestoneRendering !== null}
                                    onClick={() => void downloadHistoryMilestone(entry)}
                                  >
                                    <CuteIcon name="download" className="button-icon" />
                                    {historyMilestoneRendering === key ? "Making slip…" : `Download ${entry.hours}h slip`}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      </div>
                      {historyMilestoneError && <p className="err">{historyMilestoneError}</p>}
                    </>
                  ) : (
                    <p className="note history-no-change">No recorded library or lifetime-playtime changes since the last saved state.</p>
                  )}
                </div>
              ) : (
                <p className="note history-baseline">Baseline saved. Shelfwear can compare future loads of this public SteamID against it.</p>
              )}

              <div className="history-timeline" aria-label="Saved Shelfwear history states">
                {shelfHistory.snapshots.slice().reverse().map((snapshot, index) => (
                  <div className="history-snapshot" key={snapshot.at}>
                    <span>{String(shelfHistory.snapshots.length - index).padStart(2, "0")}</span>
                    <div>
                      <b>{new Date(snapshot.at).toLocaleString()}</b>
                      <small>{snapshot.gameCount} games · {snapshot.playedCount} played · {hours(snapshot.totalMinutes)}h recorded</small>
                    </div>
                  </div>
                ))}
              </div>

              <p className="note history-boundary">
                Saved locally under this resolved SteamID. Each state stores AppIDs and lifetime-minute totals, not a server-side library copy.
                Snapshot times mean “Shelfwear saw this state then,” not “you played then.”
              </p>
            </div>
          )}
        </section>
      )}

      {(shelf.untouched.length > 0 || shelf.played.length > 0) && (
        <section className="panel figure shelf-panel" id="disk-shelf">
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

      <section className="panel stats-panel" id="overview">
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
        {loaded.games.length > 0 && (
          <div className="receipt-callout">
            <div className="receipt-callout-copy">
              <p className="eyebrow">Takeaway slip</p>
              <b>Shelf receipt</b>
              <span>
                Current observable totals and top recorded hours, plus biggest known installs only when real local Steam files provide them.
              </span>
            </div>
            <button type="button" disabled={receiptRendering} onClick={() => void downloadReceipt()}>
              <CuteIcon name="download" className="button-icon" />
              {receiptRendering ? "Printing receipt…" : "Download shelf receipt"}
            </button>
          </div>
        )}
        {receiptError && <p className="err">{receiptError}</p>}
      </section>

      <PickSomething
        id="pick"
        games={loaded.games}
        hasRealLocalData={hasRealLocalData}
        customShelves={customShelves}
      />

      {nine.length > 0 && (
        <section className="panel social-panel" id="your-nine">
          <div className="social-heading">
            <div className="social-title-wrap">
              <SectionTitle icon="nine" eyebrow="Your little game postcard" note="The nine games with the most recorded playtime.">Your nine</SectionTitle>
              <span className="social-doodle" aria-hidden="true"><CuteIcon name="heart" /><CuteIcon name="sparkles" /></span>
            </div>
            <div className="social-actions">
              <button className="primary" disabled={cardRendering} onClick={() => void downloadCard()}><CuteIcon name="download" className="button-icon" />{cardRendering ? "Making card…" : "Download card"}</button>
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
                    src={proxiedSteamCover(game.appid, game.iconHash)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onLoad={(event) => markArtworkShape(event.currentTarget)}
                    onError={(event) => {
                      const image = event.currentTarget;
                      if (!image.dataset.fallback) {
                        image.dataset.fallback = "library";
                        image.src = steamCover(game.appid);
                      } else if (image.dataset.fallback === "library") {
                        image.dataset.fallback = "header";
                        image.src = steamHeader(game.appid);
                      } else if (image.dataset.fallback === "header" && game.iconHash) {
                        image.dataset.fallback = "icon";
                        image.src = steamIcon(game.appid, game.iconHash);
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
          <div className="familiar familiar-v2 familiar-bookplate">
            <div className="familiar-catalog-meta">
              <span>SHELFWEAR / LIBRARY SPECIMEN</span>
              <span>OBSERVED PATTERN</span>
            </div>
            <span className="familiar-mark familiar-cute" aria-hidden="true">
              <span className="familiar-emoji">{familiar.glyph}</span>
              <span className="familiar-kaomoji">♡</span>
            </span>
            <div className="familiar-copy">
              <p className="eyebrow">Shelf familiar</p>
              <h3>{familiar.name}</h3>
              <span className="familiar-classification">library pattern · evidence cataloged below</span>
              <p>{familiar.description}</p>
              <div className="familiar-signals" aria-label="Why this Shelf familiar was chosen">
                {familiar.signals.map((signal, index) => (
                  <span key={signal.label}><small>{String(index + 1).padStart(2, "0")} · {signal.label}</small><b>{signal.value}</b></span>
                ))}
              </div>
              <p className="note familiar-evidence"><b>Field note:</b> {familiar.evidence}</p>
              <div className="familiar-actions">
                <button type="button" disabled={familiarRendering} onClick={() => void downloadFamiliarCard()}>
                  <CuteIcon name="download" className="button-icon" />{familiarRendering ? "Making specimen card…" : "Download specimen card"}
                </button>
                <button type="button" onClick={() => void copyFamiliar()}>
                  <CuteIcon name="copy" className="button-icon" />{familiarCopied ? "Copied" : "Copy familiar"}
                </button>
              </div>
              {familiarError && <p className="err">{familiarError}</p>}
              <p className="note familiar-disclaimer">Cataloged from observable library patterns only. Not a personality test or a claim about you.</p>
            </div>
            <span className="familiar-catalog-stamp" aria-hidden="true">CATALOGED</span>
          </div>
        </section>
      )}

      <section className="panel compare-panel" id="compare">
        <SectionTitle icon="friends" eyebrow="For friends">Compare two shelves</SectionTitle>
        <p className="prose">
          See where two public Steam shelves meet, where they split, and which games both of you actually put time into.
          The numbers stay literal: overlap means shared games divided by the combined unique library.
        </p>
        {shared.compare && <p className="share-hint">This comparison came from a stateless link. Load it to rebuild both public libraries live.</p>}
        {shared.invite && (
          <div className="invite-arrival">
            <div className="invite-arrival-mark" aria-hidden="true">↗</div>
            <div className="invite-arrival-copy">
              <p className="eyebrow">Shelf invite</p>
              <h3>Your friend left one side of the shelf open for you.</h3>
              <p>Their public SteamID is already here. Add your public profile, then Shelfwear rebuilds both shelves live.</p>
              <div className="invite-steps" aria-label="How the Shelfwear invite works">
                <span><b>1</b>their shelf</span>
                <i aria-hidden="true">···</i>
                <span><b>2</b>add yours</span>
                <i aria-hidden="true">···</i>
                <span><b>3</b>compare</span>
              </div>
            </div>
          </div>
        )}
        {loaded.kind === "steam" && loaded.steamid && !shared.invite && (
          <div className="compare-invite">
            <div className="compare-invite-copy">
              <p className="eyebrow">Compare with me</p>
              <b>Leave one side of the shelf open.</b>
              <span>Send a friend your stateless invite. They add their public Steam profile and Shelfwear builds the rest live.</span>
              <small>Only your public SteamID is in the invite URL.</small>
            </div>
            <div className="compare-invite-actions">
              <button type="button" onClick={() => void copyInviteMessage()}>
                <CuteIcon name="copy" className="button-icon" />
                {inviteMessageCopied ? "Message copied" : "Copy invite message"}
              </button>
              <button type="button" onClick={() => void copyInviteLink()}>
                <CuteIcon name="share" className="button-icon" />
                {inviteCopied ? "Link copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}
        {loaded.kind === "steam" && loaded.steamid && !shared.compare && !shared.invite && (
          <div className="friend-shelf-shortcut" aria-label="Loaded shelf shortcut for comparison">
            <span className="friend-shelf-shortcut-mark" aria-hidden="true"><CuteIcon name="shelf" /></span>
            <span className="friend-shelf-shortcut-copy">
              <small>Loaded public shelf</small>
              <b>{loaded.profile?.name ?? `Steam ${loaded.steamid.slice(-6)}`}</b>
            </span>
            {compareLoadedSlot !== null ? (
              <span className="friend-shelf-shortcut-status">already in slot {compareLoadedSlot + 1}</span>
            ) : compareHasOpenSlot ? (
              <button type="button" onClick={useLoadedShelfInComparison}>Use loaded shelf</button>
            ) : (
              <span className="friend-shelf-shortcut-status">both slots already filled</span>
            )}
          </div>
        )}

        <div className={shared.invite ? "compare-form invited" : "compare-form"}>
          <input
            value={compareLeft}
            onChange={(e) => setCompareLeft(e.target.value)}
            readOnly={Boolean(shared.invite)}
            placeholder={`${STEAM_PROFILE_PREFIX}first-user`}
            aria-label={shared.invite ? "Inviter Steam profile" : "First Steam profile"}
          />
          <span aria-hidden="true">×</span>
          <input
            value={compareRight}
            onChange={(e) => setCompareRight(e.target.value)}
            placeholder={`${STEAM_PROFILE_PREFIX}second-user`}
            aria-label={shared.invite ? "Your Steam profile for comparison" : "Second Steam profile"}
          />
          <button disabled={comparing || !hasSteamProfileInput(compareLeft) || !hasSteamProfileInput(compareRight)} onClick={() => void runComparison()}>
            <CuteIcon name="friends" className="button-icon" />
            {comparing ? "Comparing…" : shared.compare ? "Load comparison" : shared.invite ? "Compare with friend" : "Compare"}
          </button>
        </div>
        {compareError && <p className="err">{compareError}</p>}

        {comparison && (
          <div className="comparison-result">
            <div className="compare-bookplate-header">
              <div className="compare-bookplate-kicker">
                <span aria-hidden="true">⌑</span>
                <div><small>SHELFWEAR LIBRARY CARD</small><b>shared shelf</b></div>
              </div>
              <div className="compare-heading">
                <SteamPerson library={comparison.left} />
                <span className="compare-cross">×</span>
                <SteamPerson library={comparison.right} />
                <div className="compare-actions">
                  <button disabled={compareCardRendering} onClick={() => void downloadComparisonCard()}>
                    <CuteIcon name="download" className="button-icon" />
                    {compareCardRendering ? "Making card…" : "Download library card"}
                  </button>
                  <button onClick={() => void copyComparisonLink()}><CuteIcon name="share" className="button-icon" />{compareCopied ? "Link copied" : "Share comparison"}</button>
                </div>
              </div>
            </div>
            {compareCardError && <p className="err">{compareCardError}</p>}
            <div className="compare-metrics">
              <div className="metric"><span className="metric-icon"><CuteIcon name="heart" /></span><b>{Math.round(comparison.result.overlapPercent)}%</b><span>library overlap</span></div>
              <div className="metric"><span className="metric-icon"><CuteIcon name="shelf" /></span><b>{comparison.result.sharedCount}</b><span>owned by both</span></div>
              <div className="metric"><span className="metric-icon"><CuteIcon name="friends" /></span><b>{comparison.result.mutuallyPlayedCount}</b><span>played by both</span></div>
            </div>
            <div className="compare-corners" aria-label="Games unique to each public shelf">
              <span><small>Only on {displayName(comparison.left)}’s shelf</small><b>{comparison.result.leftOnlyCount}</b></span>
              <span><small>Only on {displayName(comparison.right)}’s shelf</small><b>{comparison.result.rightOnlyCount}</b></span>
            </div>
            {comparison.result.mutuallyPlayed[0] && (
              <div className="compare-highlight">
                <div>
                  <p className="eyebrow">Deepest shared game</p>
                  <h3>{comparison.result.mutuallyPlayed[0].name ?? `app ${comparison.result.mutuallyPlayed[0].appid}`}</h3>
                </div>
                <div className="compare-highlight-hours">
                  <span><b>{hours(comparison.result.mutuallyPlayed[0].leftMinutes)}h</b>{displayName(comparison.left)}</span>
                  <span><b>{hours(comparison.result.mutuallyPlayed[0].rightMinutes)}h</b>{displayName(comparison.right)}</span>
                </div>
              </div>
            )}
            <div className="compare-signature familiar compare-stamp">
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
                <div className="shared-games-heading">
                  <div>
                    <h3>Games both actually played</h3>
                    <p>Shared ownership with recorded playtime on both profiles.</p>
                  </div>
                </div>
                {comparison.result.mutuallyPlayed.slice(0, 8).map((game) => (
                  <ComparisonGameRow
                    key={game.appid}
                    game={game}
                    leftName={displayName(comparison.left)}
                    rightName={displayName(comparison.right)}
                  />
                ))}
              </div>
            ) : (
              <p className="note">The profiles share no game with recorded playtime on both sides.</p>
            )}

            {comparison.result.oneSidedPlayed.length > 0 && (
              <div className="compare-handoffs">
                <div className="shared-games-heading">
                  <div>
                    <p className="eyebrow">Pass the controller</p>
                    <h3>One of you already knows these</h3>
                    <p>Both profiles own the game, but only one has recorded playtime.</p>
                  </div>
                </div>
                <div className="compare-handoff-grid">
                  {comparison.result.oneSidedPlayed.slice(0, 4).map((game) => {
                    const leftPlayed = game.leftMinutes > 0;
                    const playedName = leftPlayed ? displayName(comparison.left) : displayName(comparison.right);
                    const unplayedName = leftPlayed ? displayName(comparison.right) : displayName(comparison.left);
                    const playedMinutes = leftPlayed ? game.leftMinutes : game.rightMinutes;
                    return (
                      <div className="compare-handoff" key={game.appid}>
                        <ComparisonGameArt game={game} />
                        <div>
                          <b>{game.name ?? `app ${game.appid}`}</b>
                          <span>{playedName} {hours(playedMinutes)}h · {unplayedName} 0h recorded</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel party-panel" id="party">
        <SectionTitle icon="friends" eyebrow="For the group">Party Shelf</SectionTitle>
        <p className="prose">
          Put 3–5 public Steam shelves on the same table. Shelfwear shows literal shared ownership and playtime,
          then draws tonight&apos;s game only from titles everyone owns.
        </p>
        {shared.party && <p className="share-hint">This Party Shelf came from a stateless link. Load it to rebuild all public libraries live.</p>}

        {loaded.kind === "steam" && loaded.steamid && !shared.party && (
          <div className="friend-shelf-shortcut" aria-label="Loaded shelf shortcut for Party Shelf">
            <span className="friend-shelf-shortcut-mark" aria-hidden="true"><CuteIcon name="shelf" /></span>
            <span className="friend-shelf-shortcut-copy">
              <small>Loaded public shelf</small>
              <b>{loaded.profile?.name ?? `Steam ${loaded.steamid.slice(-6)}`}</b>
            </span>
            {partyLoadedSlot !== null ? (
              <span className="friend-shelf-shortcut-status">already in party slot {partyLoadedSlot + 1}</span>
            ) : partyHasOpenSlot ? (
              <button type="button" onClick={useLoadedShelfInParty}>Add loaded shelf</button>
            ) : (
              <span className="friend-shelf-shortcut-status">all party slots filled</span>
            )}
          </div>
        )}

        <div className="party-form">
          {partyProfiles.map((profile, index) => (
            <div className="party-profile-row" key={index}>
              <input
                value={profile}
                onChange={(event) => updatePartyProfile(index, event.target.value)}
                placeholder={`${STEAM_PROFILE_PREFIX}friend-${index + 1}`}
                aria-label={`Party Steam profile ${index + 1}`}
              />
              {partyProfiles.length > 3 && (
                <button type="button" className="party-remove" onClick={() => removePartyProfile(index)} aria-label={`Remove Party Steam profile ${index + 1}`}>
                  <CuteIcon name="close" />
                </button>
              )}
            </div>
          ))}
          <div className="party-form-actions">
            {partyProfiles.length < 5 && (
              <button type="button" onClick={addPartyProfile}>+ Add friend</button>
            )}
            <button
              type="button"
              disabled={partying || partyProfiles.some((profile) => !hasSteamProfileInput(profile))}
              onClick={() => void runPartyShelf()}
            >
              <CuteIcon name="friends" className="button-icon" />
              {partying ? "Building party…" : shared.party ? "Load Party Shelf" : "Build Party Shelf"}
            </button>
          </div>
        </div>
        {partyError && <p className="err">{partyError}</p>}

        {partyResult && (
          <div className="party-result">
            <div className="party-ledger-meta">
              <span>SHELFWEAR / PARTY LEDGER</span>
              <button type="button" onClick={() => void copyPartyLink()}>
                <CuteIcon name="share" className="button-icon" />{partyShareCopied ? "Link copied" : "Share party"}
              </button>
            </div>

            <div className="party-people" aria-label="Party Shelf players">
              {partyResult.libraries.map((library) => <SteamPerson key={library.steamid} library={library} />)}
            </div>

            <div className="party-metrics">
              <div><small>Unique games in group</small><b>{partyResult.result.unionCount}</b></div>
              <div><small>Owned by everyone</small><b>{partyResult.result.ownedByAllCount}</b></div>
              <div><small>Played by everyone</small><b>{partyResult.result.playedByAllCount}</b></div>
            </div>

            <div className="party-tonight">
              <div>
                <p className="eyebrow">Tonight&apos;s draw</p>
                {partyDraw ? (
                  <>
                    <h3>{partyDraw.name ?? `app ${partyDraw.appid}`}</h3>
                    <p>Drawn only from {partyDrawPool.length} game{partyDrawPool.length === 1 ? "" : "s"} owned by every shelf in this group.</p>
                  </>
                ) : (
                  <>
                    <h3>No all-owned game to draw from</h3>
                    <p>The current public libraries do not share a title across every profile.</p>
                  </>
                )}
              </div>
              {partyDraw && (
                <div className="party-tonight-actions">
                  <PartyGameArt game={partyDraw} />
                  {partyDrawPool.length > 1 && (
                    <button type="button" onClick={() => setPartyDrawIndex((current) => (current + 1) % partyDrawPool.length)}>Draw another</button>
                  )}
                </div>
              )}
            </div>

            <div className="party-corners" aria-label="Games unique to each party shelf">
              {partyResult.result.uniqueCorners.map((corner) => (
                <span key={corner.steamid}><small>Only on {corner.name}&apos;s shelf</small><b>{corner.count}</b></span>
              ))}
            </div>

            {partyResult.result.handoffs.length > 0 && (
              <div className="party-section">
                <div className="shared-games-heading">
                  <div>
                    <p className="eyebrow">Pass the controller</p>
                    <h3>Everyone owns these, but not everyone has played them</h3>
                    <p>Recorded playtime is present on some shelves and 0h on the others.</p>
                  </div>
                </div>
                <div className="party-game-grid">
                  {partyResult.result.handoffs.slice(0, 6).map((game) => (
                    <PartyGameRow key={game.appid} game={game} libraries={partyResult.libraries} />
                  ))}
                </div>
              </div>
            )}

            {partyResult.result.ownedByMost.length > 0 && (
              <div className="party-section">
                <div className="shared-games-heading">
                  <div>
                    <p className="eyebrow">Almost shared</p>
                    <h3>Most of the group owns these</h3>
                    <p>Shown with the exact owner count rather than a recommendation score.</p>
                  </div>
                </div>
                <div className="party-game-grid">
                  {partyResult.result.ownedByMost.slice(0, 6).map((game) => (
                    <PartyGameRow key={game.appid} game={game} libraries={partyResult.libraries} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* The local picker remains available even after the Worker path exists. It is the only
          mode that can say anything about the machine's disk, and it sends nothing away. */}
      <section className="panel local-panel" id="local">
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

      <section className="panel library-panel" id="library">
        <div className="library-heading">
          <SectionTitle icon="list" eyebrow="The whole shelf">Everything ({loaded.games.length})</SectionTitle>
          <div className="library-heading-meta">
            <span className="library-result-count">
              showing <b>{visibleGames.length}</b>{visibleGames.length !== loaded.games.length ? ` of ${loaded.games.length}` : ""}
            </span>
            <div className="library-export-actions" aria-label="Export the currently loaded library">
              <button type="button" onClick={() => downloadLibraryExport("csv")}>
                <CuteIcon name="download" className="button-icon" /> Export CSV
              </button>
              <button type="button" onClick={() => downloadLibraryExport("json")}>
                <CuteIcon name="download" className="button-icon" /> Export JSON
              </button>
            </div>
          </div>
        </div>

        <div className="library-tools">
          <label className="library-search">
            <span>Find a game</span>
            <input
              value={libraryQuery}
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="Search this shelf…"
              aria-label="Search games in the whole shelf"
            />
          </label>

          <div className="library-control-group library-sort">
            <span className="library-control-label">Sort by</span>
            <div className="library-chips" aria-label="Sort the whole shelf">
              {([
                ["most-played", "Most played"],
                ["least-played", "Least played"],
                ["name-az", "A–Z"],
                ["name-za", "Z–A"],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={effectiveLibrarySort === value ? "active" : ""}
                  aria-pressed={effectiveLibrarySort === value}
                  onClick={() => setLibrarySort(value)}
                >
                  {label}
                </button>
              ))}
              {hasRealLocalData && (
                <>
                  <button type="button" className={effectiveLibrarySort === "recent" ? "active" : ""} aria-pressed={effectiveLibrarySort === "recent"} onClick={() => setLibrarySort("recent")}>Recently played on this PC</button>
                  <button type="button" className={effectiveLibrarySort === "largest" ? "active" : ""} aria-pressed={effectiveLibrarySort === "largest"} onClick={() => setLibrarySort("largest")}>Largest installed</button>
                </>
              )}
            </div>
          </div>

          <div className="library-control-group library-filter">
            <span className="library-control-label">Show</span>
            <div className="library-chips" aria-label="Filter the whole shelf">
              {([
                ["all", "All"],
                ["played", "Played"],
                ["unplayed", "Never played"],
                ["hundred-plus", "100h+"],
                ["under-two", "Under 2h played"],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={effectiveLibraryFilter === value ? "active" : ""}
                  aria-pressed={effectiveLibraryFilter === value}
                  onClick={() => setLibraryFilter(value)}
                >
                  {label}
                </button>
              ))}
              {hasRealLocalData && (
                <button type="button" className={effectiveLibraryFilter === "installed" ? "active" : ""} aria-pressed={effectiveLibraryFilter === "installed"} onClick={() => setLibraryFilter("installed")}>Installed on this PC</button>
              )}
            </div>
          </div>

          <div className="library-density" aria-label="Library row size">
            <span className="library-control-label">Rows</span>
            <div className="library-chips">
              <button type="button" className={libraryDensity === "cozy" ? "active" : ""} aria-pressed={libraryDensity === "cozy"} onClick={() => setLibraryDensity("cozy")}>Cozy</button>
              <button type="button" className={libraryDensity === "compact" ? "active" : ""} aria-pressed={libraryDensity === "compact"} onClick={() => setLibraryDensity("compact")}>Compact</button>
            </div>
          </div>
        </div>

        <p className={`library-data-note ${loaded.kind}`}>
          {loaded.kind === "local"
            ? "Install state, disk size, and recency come only from the Steam files loaded from this PC. CSV/JSON exports keep those fields and label their local-file provenance."
            : loaded.kind === "sample"
              ? "Demo local data is shown in the sample. Exports are labeled synthetic demo data, not observations from this PC."
              : "Public Steam profiles show owned games and playtime. Exports intentionally omit install, disk, and local last-played fields because Steam does not provide them here."}
        </p>

        {selectedLibraryGame && (
          <aside className="library-catalog-drawer" aria-label={`Details for ${selectedLibraryGame.name ?? `app ${selectedLibraryGame.appid}`}`}>
            <div className="library-catalog-meta">
              <span>SHELF INDEX / APP {selectedLibraryGame.appid}</span>
              <button type="button" onClick={() => setSelectedLibraryGameAppId(null)} aria-label="Close game details"><CuteIcon name="close" /></button>
            </div>
            <div className="library-catalog-body">
              <div className="library-catalog-art" aria-hidden="true">
                <span>{(selectedLibraryGame.name ?? `app ${selectedLibraryGame.appid}`).trim().charAt(0).toUpperCase()}</span>
                {loaded.kind === "steam" && (
                  <img
                    src={proxiedSteamCover(selectedLibraryGame.appid, selectedLibraryGame.iconHash)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => { event.currentTarget.hidden = true; }}
                  />
                )}
              </div>
              <div className="library-catalog-copy">
                <p className="eyebrow">Catalog record</p>
                <h3>{selectedLibraryGame.name ?? `app ${selectedLibraryGame.appid}`}</h3>
                <div className="library-catalog-facts">
                  <span><small>Recorded playtime</small><b>{hours(selectedLibraryGame.minutes)}h</b></span>
                  <span><small>Library state</small><b>{selectedLibraryGame.minutes > 0 ? "Played" : "Never played"}</b></span>
                  {loaded.kind === "local" && (
                    <>
                      <span><small>Installed on this PC</small><b>{selectedLibraryGame.installed ? "Yes" : "No"}</b></span>
                      <span><small>Known size</small><b>{selectedLibraryGame.bytes === null ? "Unknown" : `${gb(selectedLibraryGame.bytes)} GB`}</b></span>
                      <span><small>Last recorded launch</small><b>{selectedLibraryGame.lastPlayed ? ago(selectedLibraryGame.lastPlayed) : "No recorded launch"}</b></span>
                    </>
                  )}
                </div>
                <div className="library-catalog-actions">
                  <a href={`https://store.steampowered.com/app/${selectedLibraryGame.appid}/`} target="_blank" rel="noreferrer">Open Steam store ↗</a>
                </div>
                <div className="library-file-to-shelf">
                  <span className="library-control-label">File on a shelf</span>
                  {customShelves.length ? (
                    <div>
                      <select value={drawerShelfId} onChange={(event) => setDrawerShelfId(event.target.value)} aria-label="Choose custom shelf for game">
                        {customShelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={!drawerShelfId || customShelves.some((shelf) => shelf.id === drawerShelfId && shelf.games.some((game) => game.appid === selectedLibraryGame.appid))}
                        onClick={() => drawerShelfId && addGameToCustomShelf(drawerShelfId, selectedLibraryGame)}
                      >
                        <CuteIcon name="plus" className="button-icon" />
                        {customShelves.some((shelf) => shelf.id === drawerShelfId && shelf.games.some((game) => game.appid === selectedLibraryGame.appid)) ? "Already filed" : "Add to shelf"}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setView("shelves")}><CuteIcon name="plus" className="button-icon" /> Create your first shelf</button>
                  )}
                </div>
                {loaded.kind === "steam" && loaded.steamid && selectedAchievementKey && (
                  <div className="achievement-cabinet-entry">
                    <div className="achievement-cabinet-entry-head">
                      <div>
                        <span className="library-control-label">Achievement Cabinet</span>
                        <b>Open this game's trophy drawer</b>
                      </div>
                      {!selectedAchievementCabinet && (
                        <button
                          type="button"
                          disabled={achievementLoadingKey === selectedAchievementKey}
                          onClick={() => void loadAchievementCabinet(selectedLibraryGame)}
                        >
                          <CuteIcon name="archive" className="button-icon" />
                          {achievementLoadingKey === selectedAchievementKey ? "Reading achievements…" : "Load achievements"}
                        </button>
                      )}
                    </div>
                    {achievementError?.key === selectedAchievementKey && <p className="err">{achievementError.message}</p>}
                    {selectedAchievementCabinet && (
                      <AchievementCabinet
                        cabinet={selectedAchievementCabinet}
                        profileName={loaded.profile?.name ?? null}
                      />
                    )}
                    <p className="note">Fetched only when you ask for this public Steam game. Shelfwear does not save achievement data.</p>
                  </div>
                )}
                <p className="note">
                  {loaded.kind === "steam"
                    ? "This record uses the same public Steam library data already loaded above."
                    : loaded.kind === "local"
                      ? "No artwork is fetched automatically in local-file mode; the files stay the source of truth."
                      : "This is synthetic demo data, so the record is only showing how the catalog drawer behaves."}
                </p>
              </div>
            </div>
          </aside>
        )}

        {visibleGames.length > 0 ? (
          <div className={`rows library-rows ${libraryDensity}`}>
            {visibleGames.map((g) => (
              <div className={g.minutes === 0 ? "row cold library-row" : "row library-row"} key={g.appid}>
                <span className="hrs">{hours(g.minutes)}h</span>
                <span className="name">{g.name ?? <em>app {g.appid}</em>}</span>
                <span className="sz">
                  {g.bytes === null
                    ? (g.installed ? "size unknown" : loaded.kind === "steam" ? "Steam profile" : "not installed")
                    : `${gb(g.bytes)} GB`}
                  {loaded.kind !== "steam" ? ` · ${ago(g.lastPlayed)}` : ""}
                </span>
                <button
                  type="button"
                  className="library-row-details"
                  aria-label={`Open details for ${g.name ?? `app ${g.appid}`}`}
                  aria-pressed={selectedLibraryGameAppId === g.appid}
                  onClick={() => setSelectedLibraryGameAppId((current) => current === g.appid ? null : g.appid)}
                >
                  index card
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="library-empty">
            <span aria-hidden="true">♡</span>
            <b>No games match this little corner of the shelf.</b>
            <button type="button" onClick={() => { setLibraryQuery(""); setLibraryFilter("all"); setLibrarySort("most-played"); }}>Clear filters</button>
          </div>
        )}
      </section>
        </>
      ) : view === "analytics" ? (
        <AnalyticsPage analytics={analytics} stats={stats} kind={loaded.kind} source={loaded.source} />
      ) : view === "shelves" ? (
        <CustomShelvesPage
          shelves={customShelves}
          activeShelfId={activeShelfId}
          loadedGames={loaded.games}
          onCreate={createCustomShelf}
          onSelect={setActiveShelfId}
          onUpdate={updateCustomShelf}
          onDelete={deleteCustomShelf}
          onRestore={restoreCustomShelves}
          onStory={turnShelfIntoStory}
        />
      ) : (
        <TopGamesPage loadedGames={loaded.games} initial={storySeed ?? shared.top} />
      )}
      <Palette themes={palettes} storageKey="shelfwear:theme:cozy-v2" initial="cherry-blossom-dusk" />
    </div>
  );
}




function CustomShelvesPage({
  shelves,
  activeShelfId,
  loadedGames,
  onCreate,
  onSelect,
  onUpdate,
  onDelete,
  onRestore,
  onStory,
}: {
  shelves: CustomShelf[];
  activeShelfId: string | null;
  loadedGames: Game[];
  onCreate: (name: string) => string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updater: (shelf: CustomShelf) => CustomShelf) => void;
  onDelete: (id: string) => void;
  onRestore: (shelves: CustomShelf[]) => void;
  onStory: (shelf: CustomShelf) => void;
}) {
  const active = shelves.find((shelf) => shelf.id === activeShelfId) ?? shelves[0] ?? null;
  const [draftName, setDraftName] = useState("");
  const [renameDraft, setRenameDraft] = useState(active?.name ?? "");
  const [gameQuery, setGameQuery] = useState("");
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const backupPicker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRenameDraft(active?.name ?? "");
    setGameQuery("");
  }, [active?.id, active?.name]);

  const suggestions = useMemo(() => {
    if (!active) return [];
    const q = gameQuery.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(active.games.map((game) => game.appid));
    return loadedGames
      .filter((game) => !chosen.has(game.appid) && (game.name ?? ("app " + game.appid)).toLowerCase().includes(q))
      .sort((a, b) => b.minutes - a.minutes || (a.name ?? "").localeCompare(b.name ?? ""))
      .slice(0, 8);
  }, [active, gameQuery, loadedGames]);

  const create = (name: string) => {
    const id = onCreate(name);
    if (id) {
      onSelect(id);
      setDraftName("");
    }
  };

  const addLoadedGame = (game: Game) => {
    if (!active) return;
    onUpdate(active.id, (shelf) => {
      if (shelf.games.some((entry) => entry.appid === game.appid) || shelf.games.length >= 50) return shelf;
      return {
        ...shelf,
        games: [...shelf.games, {
          appid: game.appid,
          name: game.name ?? ("app " + game.appid),
          ...(game.iconHash ? { iconHash: game.iconHash } : {}),
        }],
      };
    });
    setGameQuery("");
  };

  const rename = () => {
    if (!active) return;
    const clean = cleanShelfName(renameDraft);
    if (!clean) {
      setRenameDraft(active.name);
      return;
    }
    onUpdate(active.id, (shelf) => ({ ...shelf, name: clean }));
  };

  const updateNote = (index: number, value: string) => {
    if (!active) return;
    onUpdate(active.id, (shelf) => ({
      ...shelf,
      games: shelf.games.map((game, gameIndex) =>
        gameIndex === index
          ? { ...game, note: value.replace(/\s+/g, " ").slice(0, 80) || undefined }
          : game
      ),
    }));
  };

  const move = (index: number, delta: -1 | 1) => {
    if (!active) return;
    onUpdate(active.id, (shelf) => {
      const target = index + delta;
      if (target < 0 || target >= shelf.games.length) return shelf;
      const games = [...shelf.games];
      [games[index], games[target]] = [games[target]!, games[index]!];
      return { ...shelf, games };
    });
  };

  const remove = (index: number) => {
    if (!active) return;
    onUpdate(active.id, (shelf) => ({
      ...shelf,
      games: shelf.games.filter((_, gameIndex) => gameIndex !== index),
    }));
  };

  const downloadBackup = () => {
    setBackupError(null);
    const text = customShelvesBackupText(shelves);
    downloadBlob(
      new Blob([text], { type: "application/json;charset=utf-8" }),
      customShelvesBackupFilename(),
    );
    setBackupMessage(`Downloaded ${shelves.length} ${shelves.length === 1 ? "shelf" : "shelves"}.`);
  };

  const restoreBackup = async (file: File) => {
    setBackupError(null);
    setBackupMessage(null);
    try {
      const backup = parseCustomShelvesBackup(await file.text());
      const count = backup.shelves.length;
      const replacing = shelves.length > 0;
      if (replacing) {
        const confirmed = window.confirm(
          `Restore ${count} ${count === 1 ? "shelf" : "shelves"} from this backup? This replaces the ${shelves.length} currently stored ${shelves.length === 1 ? "shelf" : "shelves"} in this browser.`,
        );
        if (!confirmed) return;
      }
      onRestore(backup.shelves);
      setBackupMessage(
        count
          ? `Restored ${count} ${count === 1 ? "shelf" : "shelves"} from the backup.`
          : "Restored an empty backup. My Shelves is now empty.",
      );
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      if (backupPicker.current) backupPicker.current.value = "";
    }
  };

  return (
    <main className="custom-shelves-page">
      <section className="panel custom-shelves-intro">
        <div className="custom-shelves-catalog-meta">
          <span>SHELFWEAR / PERSONAL STACKS</span>
          <span>BROWSER-LOCAL</span>
        </div>
        <SectionTitle
          icon="archive"
          eyebrow="Curate between visits"
          note="Shelf names, order, notes, and selected games stay in this browser. The imported Steam library itself is not saved."
        >
          My shelves
        </SectionTitle>
        <p className="prose">
          Make little collections that mean something to you, then use the Shelf Index to file games into them.
          A shelf can stay private here or become a Shelf Story when you want to share it.
        </p>

        <div className="custom-shelf-presets" aria-label="Quick shelf starters">
          {CUSTOM_SHELF_PRESETS.map((preset) => {
            const exists = shelves.some((shelf) => shelf.name.toLowerCase() === preset.name.toLowerCase());
            return (
              <button
                type="button"
                key={preset.id}
                disabled={exists || shelves.length >= MAX_CUSTOM_SHELVES}
                onClick={() => create(preset.name)}
              >
                <CuteIcon name="plus" className="button-icon" />
                {exists ? preset.name + " · made" : preset.name}
              </button>
            );
          })}
        </div>

        <form className="custom-shelf-create" onSubmit={(event) => { event.preventDefault(); create(draftName); }}>
          <label>
            <span>Custom shelf name</span>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={40}
              placeholder="rainy-day games, couch co-op, someday…"
              aria-label="Custom shelf name"
            />
          </label>
          <button type="submit" disabled={!cleanShelfName(draftName) || shelves.length >= MAX_CUSTOM_SHELVES}>
            <CuteIcon name="plus" className="button-icon" /> Create shelf
          </button>
        </form>
        <p className="note">{shelves.length}/{MAX_CUSTOM_SHELVES} shelves · stored only in this browser's localStorage</p>

        <div className="custom-shelf-backup" aria-label="Back up or restore My Shelves">
          <div>
            <span className="library-control-label">Browser-local backup</span>
            <b>Take your curated shelves with you</b>
            <p>Downloads shelf names, order, selected AppIDs/names, public icon hashes, timestamps, and your private shelf notes. It does not include playtime, install state, disk data, or the imported Steam library.</p>
          </div>
          <div className="custom-shelf-backup-actions">
            <button type="button" disabled={!shelves.length} onClick={downloadBackup}>
              <CuteIcon name="download" className="button-icon" /> Download backup
            </button>
            <button type="button" onClick={() => backupPicker.current?.click()}>
              <CuteIcon name="folder" className="button-icon" /> Restore backup
            </button>
            <input
              ref={backupPicker}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label="Choose a My Shelves backup"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void restoreBackup(file);
              }}
            />
          </div>
        </div>
        {backupMessage && <p className="custom-shelf-backup-status" role="status">{backupMessage}</p>}
        {backupError && <p className="err custom-shelf-backup-status" role="alert">{backupError}</p>}
      </section>

      {shelves.length === 0 ? (
        <section className="panel custom-shelves-empty">
          <span aria-hidden="true">▤</span>
          <h3>Your personal stacks are empty.</h3>
          <p>Start with one of the shelf starters above, then file games from the Shelf Index or search your loaded library here.</p>
        </section>
      ) : (
        <section className="panel custom-shelves-workspace">
          <div className="custom-shelf-tabs" aria-label="Custom shelves">
            {shelves.map((shelf) => (
              <button
                type="button"
                key={shelf.id}
                className={active?.id === shelf.id ? "active" : ""}
                aria-pressed={active?.id === shelf.id}
                onClick={() => onSelect(shelf.id)}
              >
                <b>{shelf.name}</b>
                <span>{shelf.games.length} {shelf.games.length === 1 ? "game" : "games"}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className="custom-shelf-sheet">
              <div className="custom-shelf-sheet-meta">
                <span>SHELF FILE / {active.games.length.toString().padStart(2, "0")} ENTRIES</span>
                <button
                  type="button"
                  className="danger-subtle"
                  onClick={() => onDelete(active.id)}
                  aria-label={"Delete " + active.name}
                >
                  delete shelf
                </button>
              </div>

              <div className="custom-shelf-head">
                <label>
                  <span>Shelf name</span>
                  <input
                    value={renameDraft}
                    maxLength={40}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={rename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        rename();
                        event.currentTarget.blur();
                      }
                    }}
                    aria-label="Rename active shelf"
                  />
                </label>
                <button type="button" disabled={!active.games.length} onClick={() => onStory(active)}>
                  <CuteIcon name="heart" className="button-icon" /> Turn into Shelf Story
                </button>
              </div>

              <div className="custom-shelf-add">
                <label>
                  <span>Add from the loaded library</span>
                  <input
                    value={gameQuery}
                    onChange={(event) => setGameQuery(event.target.value)}
                    placeholder="Search this library…"
                    aria-label="Search games to add to active shelf"
                  />
                </label>
                {suggestions.length > 0 && (
                  <div className="custom-shelf-suggestions">
                    {suggestions.map((game) => (
                      <button type="button" key={game.appid} onClick={() => addLoadedGame(game)}>
                        <CuteIcon name="plus" className="button-icon" />
                        <span>{game.name ?? ("app " + game.appid)}</span>
                        <small>{hours(game.minutes)}h</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {active.games.length === 0 ? (
                <div className="custom-shelf-empty-state">
                  <span aria-hidden="true">♡</span>
                  <b>Nothing filed here yet.</b>
                  <p>Search the current library above, or open a game's Shelf Index and file it directly.</p>
                </div>
              ) : (
                <div className="custom-shelf-games">
                  {active.games.map((game, index) => (
                    <article className="custom-shelf-game" key={game.appid}>
                      <span className="custom-shelf-rank">{String(index + 1).padStart(2, "0")}</span>
                      <div className="custom-shelf-game-copy">
                        <b>{game.name}</b>
                        <span>Steam app {game.appid}{index < 9 ? " · Story-ready" : ""}</span>
                        <input
                          value={game.note ?? ""}
                          maxLength={80}
                          onChange={(event) => updateNote(index, event.target.value)}
                          placeholder="private note, optional"
                          aria-label={"Note for " + game.name + " on " + active.name}
                        />
                      </div>
                      <div className="custom-shelf-game-actions">
                        <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={"Move " + game.name + " up"}><CuteIcon name="up" /></button>
                        <button type="button" disabled={index === active.games.length - 1} onClick={() => move(index, 1)} aria-label={"Move " + game.name + " down"}><CuteIcon name="down" /></button>
                        <button type="button" onClick={() => remove(index)} aria-label={"Remove " + game.name + " from " + active.name}><CuteIcon name="close" /></button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <p className="note custom-shelf-story-note">
                Shelf Stories use the first nine games in this order. Notes are carried into the Story and remain editable there.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}


function TopGamesPage({ loadedGames, initial }: { loadedGames: Game[]; initial: CuratedTopGames | null }) {
  const [list, setList] = useState<CuratedTopGames>(() => initial ?? {
    title: "games that shaped me",
    caption: "the games that became part of my gaming history",
    games: [],
    style: "scrapbook",
    finish: "archive",
  });
  const [activePreset, setActivePreset] = useState<string | null>(() => initial ? null : "shaped-me");
  const [draftName, setDraftName] = useState("");
  const [draftApp, setDraftApp] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = draftName.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(list.games.map((game) => game.appid).filter(Boolean));
    return loadedGames
      .filter((game) => game.name && game.name.toLowerCase().includes(q) && !chosen.has(game.appid))
      .sort((a, b) => b.minutes - a.minutes || (a.name ?? "").localeCompare(b.name ?? ""))
      .slice(0, 6);
  }, [draftName, list.games, loadedGames]);

  const setMeta = (field: "title" | "caption", value: string) => {
    const max = field === "title" ? 48 : 120;
    setActivePreset(null);
    setList((current) => ({ ...current, [field]: value.slice(0, max) }));
  };

  const applyPreset = (preset: (typeof SHELF_STORY_PRESETS)[number]) => {
    setActivePreset(preset.id);
    setList((current) => ({
      ...current,
      title: preset.title,
      caption: preset.caption,
    }));
    setFormError(null);
  };

  const add = (name = draftName, appidInput = draftApp) => {
    setFormError(null);
    if (list.games.length >= 9) {
      setFormError("Your card already has nine games. Remove one before adding another.");
      return;
    }
    const cleanName = name.replace(/\s+/g, " ").trim();
    if (!cleanName) {
      setFormError("Add a game name first.");
      nameInput.current?.focus();
      return;
    }

    const exactLibraryGame = loadedGames.find((game) =>
      game.name?.localeCompare(cleanName, undefined, { sensitivity: "accent" }) === 0
    );
    const suppliedAppid = appidInput.trim() ? steamAppIdFromInput(appidInput) : null;
    if (appidInput.trim() && !suppliedAppid) {
      setFormError("For official artwork, paste a numeric Steam AppID or a store.steampowered.com/app/... link.");
      return;
    }
    const appid = suppliedAppid ?? exactLibraryGame?.appid ?? null;
    const iconHash = appid && exactLibraryGame?.appid === appid ? exactLibraryGame.iconHash ?? null : null;
    const duplicate = list.games.some((game) =>
      game.name.toLowerCase() === cleanName.toLowerCase() && game.appid === appid
    );
    if (duplicate) {
      setFormError("That game is already on this card.");
      return;
    }
    setList((current) => ({ ...current, games: [...current.games, { name: cleanName.slice(0, 80), appid, iconHash }].slice(0, 9) }));
    setDraftName("");
    setDraftApp("");
    nameInput.current?.focus();
  };

  const addSuggestion = (game: Game) => {
    if (!game.name) return;
    add(game.name, game.appid);
  };

  const updateGameNote = (index: number, value: string) => {
    setList((current) => ({
      ...current,
      games: current.games.map((game, i) =>
        i === index ? { ...game, note: value.replace(/\s+/g, " ").slice(0, 42) } : game
      ),
    }));
  };

  const setStoryStyle = (style: NonNullable<CuratedTopGames["style"]>) => {
    setList((current) => ({ ...current, style }));
  };

  const setStoryFinish = (finish: NonNullable<CuratedTopGames["finish"]>) => {
    setList((current) => ({ ...current, finish }));
  };

  const remove = (index: number) => {
    setList((current) => ({ ...current, games: current.games.filter((_, i) => i !== index) }));
  };

  const move = (index: number, delta: -1 | 1) => {
    setList((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.games.length) return current;
      const games = [...current.games];
      [games[index], games[target]] = [games[target]!, games[index]!];
      return { ...current, games };
    });
  };

  const useCurrentNine = () => {
    const games = topNine(loadedGames).map((game) => ({
      name: game.name ?? `app ${game.appid}`,
      appid: game.appid,
      iconHash: game.iconHash ?? null,
    }));
    setList((current) => ({ ...current, games: games.slice(0, 9) }));
    setFormError(null);
  };

  const copyLink = async () => {
    if (!list.games.length) {
      setFormError("Add at least one game before sharing.");
      return;
    }
    await navigator.clipboard.writeText(curatedShareUrl(window.location.href, list));
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);
  };

  const copySummary = async () => {
    if (!list.games.length) return;
    const text = [
      list.title,
      list.caption,
      ...list.games.map((game, index) => `${index + 1}. ${game.name}${game.note ? ` — ${game.note}` : ""}`),
      "made as a Shelfwear story ♡",
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    setSummaryCopied(true);
    window.setTimeout(() => setSummaryCopied(false), 1600);
  };

  const download = async () => {
    if (!list.games.length) {
      setFormError("Add at least one game before making a card.");
      return;
    }
    setRenderError(null);
    setRendering(true);
    try {
      const blob = await renderCuratedCard(list);
      downloadBlob(blob, curatedCardFilename(list.title));
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : String(error));
    } finally {
      setRendering(false);
    }
  };

  return (
    <main className="curated-page">
      <section className="panel curated-intro">
        <SectionTitle
          icon="heart"
          eyebrow={initial ? "A shared shelf story" : "Make something worth sending"}
          note="Pick a prompt, choose the games that belong in it, then turn the result into a card or share link."
        >
          Shelf stories
        </SectionTitle>
        <p className="prose curated-story-lead">
          This is the part you choose yourself. Playtime can suggest games, but it does not decide which ones mattered.
        </p>

        <div className="story-presets" aria-label="Shelf story prompts">
          {SHELF_STORY_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={activePreset === preset.id ? "active" : ""}
              aria-pressed={activePreset === preset.id}
              onClick={() => applyPreset(preset)}
            >
              <b>{preset.title}</b>
              <span>{preset.prompt}</span>
            </button>
          ))}
        </div>

        <div className="curated-meta-fields">
          <label>
            <span>Card title</span>
            <input
              value={list.title}
              maxLength={48}
              onChange={(event) => setMeta("title", event.target.value)}
              aria-label="Shelf story card title"
            />
          </label>
          <label>
            <span>Little caption</span>
            <input
              value={list.caption}
              maxLength={120}
              onChange={(event) => setMeta("caption", event.target.value)}
              placeholder="Add a short line about why these games belong together…"
              aria-label="Shelf story card caption"
            />
          </label>
        </div>

        <div className="story-style-picker">
          <span className="library-control-label">Card look</span>
          <div className="story-style-options" aria-label="Shelf story card style">
            {SHELF_STORY_STYLES.map((style) => (
              <button
                type="button"
                key={style.id}
                className={(list.style ?? "scrapbook") === style.id ? "active" : ""}
                aria-pressed={(list.style ?? "scrapbook") === style.id}
                onClick={() => setStoryStyle(style.id)}
              >
                <b>{style.label}</b>
                <span>{style.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="story-finish-picker">
          <span className="library-control-label">Finishing touch</span>
          <div className="story-finish-options" aria-label="Shelf story finishing touch">
            {SHELF_STORY_FINISHES.map((finish) => (
              <button
                type="button"
                key={finish.id}
                className={(list.finish ?? "archive") === finish.id ? "active" : ""}
                aria-pressed={(list.finish ?? "archive") === finish.id}
                onClick={() => setStoryFinish(finish.id)}
              >
                <b>{finish.label}</b>
                <span>{finish.description}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="note curated-privacy">Story links are stateless: the title, caption, card look, finishing touch, selected game names, optional notes, Steam AppIDs, and public Steam artwork references live in the URL. Shelfwear does not store the list. Old <code>?top=</code> links still open normally.</p>
      </section>

      <section className="panel curated-builder">
        <div className="curated-builder-head">
          <SectionTitle icon="plus" eyebrow="Pick up to nine">Choose the games in this story</SectionTitle>
          <button type="button" onClick={useCurrentNine} disabled={!loadedGames.length}>
            <CuteIcon name="sparkles" className="button-icon" /> Fill from playtime
          </button>
        </div>

        <form className="curated-add-form" onSubmit={(event) => { event.preventDefault(); add(); }}>
          <label className="curated-name-field">
            <span>Game name</span>
            <input
              ref={nameInput}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={80}
              placeholder="Type any game…"
              aria-label="Game name to add"
            />
          </label>
          <label className="curated-app-field">
            <span>Steam art <em>optional</em></span>
            <input
              value={draftApp}
              onChange={(event) => setDraftApp(event.target.value)}
              placeholder="AppID or Steam store link"
              aria-label="Optional Steam AppID or store link"
            />
          </label>
          <button type="submit" disabled={list.games.length >= 9}>
            <CuteIcon name="plus" className="button-icon" /> Add game
          </button>
        </form>

        {suggestions.length > 0 && (
          <div className="curated-suggestions" aria-label="Games from current shelf">
            <span>from this shelf</span>
            <div>
              {suggestions.map((game) => (
                <button type="button" key={game.appid} onClick={() => addSuggestion(game)}>
                  <CuteIcon name="plus" className="button-icon" /> {game.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {formError && <p className="err">{formError}</p>}

        <div className="curated-layout">
          <div className="curated-preview-wrap">
            <div className={`curated-card-preview story-style-${list.style ?? "scrapbook"} story-finish-${list.finish ?? "archive"}`}>
              <div className="curated-artifact-meta">
                <span>SHELFWEAR / SHELF STORY</span>
                <span>{String(list.games.length).padStart(2, "0")} PICKS</span>
              </div>
              <div className="curated-preview-heading">
                <span className="curated-sticker">
                  {(list.finish ?? "archive") === "archive" ? "hand-picked ♡" : (list.finish ?? "archive") === "doodles" ? "little story ✦" : "shelf story"}
                </span>
                {(list.finish ?? "archive") !== "clean" && <span className="curated-doodle curated-doodle-star" aria-hidden="true"><CuteIcon name="sparkles" /></span>}
                {(list.finish ?? "archive") === "doodles" && <span className="curated-doodle curated-doodle-heart" aria-hidden="true"><CuteIcon name="heart" /></span>}
                <h3>{list.title}</h3>
                {list.caption && <p>{list.caption}</p>}
              </div>
              <div className="curated-nine-grid" aria-label="Curated top games preview">
                {Array.from({ length: 9 }, (_, index) => {
                  const game = list.games[index];
                  return game ? (
                    <article className="curated-game-tile" key={`${game.name}-${index}`}>
                      {game.appid ? (
                        <img
                          src={proxiedSteamCover(game.appid, game.iconHash)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onLoad={(event) => markArtworkShape(event.currentTarget)}
                          onError={(event) => {
                            const image = event.currentTarget;
                            if (!image.dataset.fallback) {
                              image.dataset.fallback = "library";
                              image.src = steamCover(game.appid!);
                            } else if (image.dataset.fallback === "library") {
                              image.dataset.fallback = "header";
                              image.src = steamHeader(game.appid!);
                            } else if (image.dataset.fallback === "header" && game.iconHash) {
                              image.dataset.fallback = "icon";
                              image.src = steamIcon(game.appid!, game.iconHash);
                            } else {
                              image.hidden = true;
                            }
                          }}
                        />
                      ) : (
                        <span className="curated-fallback-letter" aria-hidden="true">{game.name.charAt(0).toUpperCase()}</span>
                      )}
                      <span className="curated-rank">{index + 1}</span>
                      <div className={game.note ? "curated-game-name has-note" : "curated-game-name"}>{game.name}</div>
                      {game.note && <div className="curated-game-note">{game.note}</div>}
                    </article>
                  ) : (
                    <button
                      type="button"
                      className="curated-empty-tile"
                      key={index}
                      onClick={() => nameInput.current?.focus()}
                      aria-label={`Add game in slot ${index + 1}`}
                    >
                      <span>{index + 1}</span>
                      <CuteIcon name="plus" />
                    </button>
                  );
                })}
              </div>
              <div className="curated-preview-footer">
                <span>picked for this story, not decided by playtime</span>
                <span className="curated-story-stamp">
                  {(list.finish ?? "archive") === "archive" ? "ARCHIVE COPY" : (list.finish ?? "archive") === "doodles" ? "♡  ✦  ♡" : "SHELFWEAR"}
                </span>
              </div>
            </div>
          </div>

          <div className="curated-list">
            <div className="curated-list-heading"><b>{list.games.length}/9 picked</b><span>the order becomes part of the story</span></div>
            {list.games.length === 0 ? (
              <div className="curated-empty-state"><span aria-hidden="true">૮₍ ˶•⤙•˶ ₎ა</span><p>No games yet. Start with the ones that immediately came to mind when you picked the prompt.</p></div>
            ) : list.games.map((game, index) => (
              <div className="curated-list-row" key={`${game.name}-${index}`}>
                <span className="curated-list-rank">{index + 1}</span>
                <div className="curated-list-copy">
                  <b>{game.name}</b>
                  <span>{game.appid ? `Steam art · app ${game.appid}` : "cute text tile"}</span>
                  <input
                    value={game.note ?? ""}
                    maxLength={42}
                    onChange={(event) => updateGameNote(index, event.target.value)}
                    placeholder="why this one? optional"
                    aria-label={`Why ${game.name} belongs in this story`}
                  />
                </div>
                <div className="curated-row-actions">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${game.name} up`}><CuteIcon name="up" /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === list.games.length - 1} aria-label={`Move ${game.name} down`}><CuteIcon name="down" /></button>
                  <button type="button" onClick={() => remove(index)} aria-label={`Remove ${game.name}`}><CuteIcon name="close" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel curated-share">
        <SectionTitle icon="share" eyebrow="Send it to friends">Share this shelf story</SectionTitle>
        <div className="curated-share-actions">
          <button type="button" onClick={() => void copyLink()} disabled={!list.games.length}><CuteIcon name="share" className="button-icon" />{shareCopied ? "Link copied" : "Copy story link"}</button>
          <button type="button" onClick={() => void download()} disabled={!list.games.length || rendering}><CuteIcon name="download" className="button-icon" />{rendering ? "Making card…" : "Download 1080×1350 card"}</button>
          <button type="button" onClick={() => void copySummary()} disabled={!list.games.length}><CuteIcon name="copy" className="button-icon" />{summaryCopied ? "Copied" : "Copy text list"}</button>
        </div>
        {renderError && <p className="err">{renderError}</p>}
        <p className="note">Games with a Steam AppID use official Steam artwork through Shelfwear's image proxy. Anything else gets a designed fallback tile instead of guessed artwork.</p>
      </section>
    </main>
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
      <section className="panel analytics-intro analytics-ledger-sheet">
        <div className="analytics-catalog-meta">
          <span>SHELFWEAR / READING ROOM</span>
          <span>{kind === "steam" ? "PUBLIC STEAM SHELF" : kind === "local" ? "LOCAL FILE SHELF" : "DEMO SHELF"}</span>
        </div>
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

      <section className="panel analytics-kpis analytics-ledger-sheet">
        <SectionTitle icon="sparkles" eyebrow="At a glance">The shape of the shelf</SectionTitle>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi"><i>01</i><span>Played</span><b>{analytics.utilizationPercent}%</b><small>{stats.played} titles</small></div>
          <div className="analytics-kpi"><i>02</i><span>Untouched</span><b>{analytics.untouchedPercent}%</b><small>{stats.neverPlayed} titles</small></div>
          <div className="analytics-kpi"><i>03</i><span>Median played game</span><b>{analytics.medianPlayedHours}h</b><small>among games with time</small></div>
          <div className="analytics-kpi"><i>04</i><span>Half your hours</span><b>{stats.halfOfHoursIn}</b><small>{stats.halfOfHoursIn === 1 ? "title" : "titles"}</small></div>
        </div>
      </section>

      <section className="panel analytics-distribution analytics-ledger-sheet">
        <div className="analytics-section-code">SHELF DEPTH / 01</div>
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

      <section className="panel analytics-hours analytics-ledger-sheet">
        <div className="analytics-section-code">HOUR LEDGER / 02</div>
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
        <section className="panel analytics-local analytics-ledger-sheet">
          <div className="analytics-section-code">LOCAL INSERT / 03</div>
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

function ComparisonGameArt({ game }: { game: SharedGame }) {
  const name = game.name ?? `app ${game.appid}`;
  return (
    <span className="compare-game-art" aria-hidden="true">
      <span>{name.trim().charAt(0).toUpperCase() || "♡"}</span>
      <img
        src={proxiedSteamCover(game.appid, game.iconHash)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    </span>
  );
}

function ComparisonGameRow({ game, leftName, rightName }: { game: SharedGame; leftName: string; rightName: string }) {
  return (
    <div className="shared-game">
      <ComparisonGameArt game={game} />
      <div className="shared-game-copy">
        <b>{game.name ?? `app ${game.appid}`}</b>
        <span>{leftName} {hours(game.leftMinutes)}h · {rightName} {hours(game.rightMinutes)}h</span>
      </div>
    </div>
  );
}

function PartyGameArt({ game }: { game: PartyGame }) {
  const name = game.name ?? `app ${game.appid}`;
  return (
    <span className="compare-game-art party-game-art" aria-hidden="true">
      <span>{name.trim().charAt(0).toUpperCase() || "♡"}</span>
      <img
        src={proxiedSteamCover(game.appid, game.iconHash)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    </span>
  );
}

function PartyGameRow({ game, libraries }: { game: PartyGame; libraries: PublicSteamLibrary[] }) {
  const owners = libraries.filter((library) => Object.prototype.hasOwnProperty.call(game.minutesBySteamId, library.steamid));
  const played = owners.filter((library) => (game.minutesBySteamId[library.steamid] ?? 0) > 0);
  return (
    <div className="party-game-row">
      <PartyGameArt game={game} />
      <div>
        <b>{game.name ?? `app ${game.appid}`}</b>
        <span>{owners.length} of {libraries.length} own · {played.length} have recorded playtime</span>
      </div>
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
