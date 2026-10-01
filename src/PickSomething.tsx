import { useEffect, useMemo, useState } from "react";
import { hours, type Game } from "./lib/library.js";
import { buildPickPool, drawGame, type PickPoolKind } from "./lib/pick.js";
import type { CustomShelf } from "./lib/custom-shelves.js";

interface PickSomethingProps {
  id?: string;
  games: Game[];
  hasRealLocalData: boolean;
  customShelves: CustomShelf[];
}

const poolTitle = (kind: PickPoolKind): string => {
  switch (kind) {
    case "never-played": return "Never played";
    case "under-two": return "Under 2h played";
    case "installed": return "Installed on this PC";
    case "custom-shelf": return "Custom shelf";
  }
};

const plural = (count: number, one: string, many = `${one}s`): string =>
  count === 1 ? one : many;

export default function PickSomething({
  id,
  games,
  hasRealLocalData,
  customShelves,
}: PickSomethingProps) {
  const [kind, setKind] = useState<PickPoolKind>("never-played");
  const [customShelfId, setCustomShelfId] = useState(customShelves[0]?.id ?? "");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [currentAppId, setCurrentAppId] = useState<string | null>(null);

  useEffect(() => {
    setExcluded([]);
    setCurrentAppId(null);
  }, [games]);

  useEffect(() => {
    if (!customShelves.length) {
      setCustomShelfId("");
      if (kind === "custom-shelf") setKind("never-played");
      return;
    }
    if (!customShelves.some((shelf) => shelf.id === customShelfId)) {
      setCustomShelfId(customShelves[0]!.id);
    }
  }, [customShelfId, customShelves, kind]);

  useEffect(() => {
    if (!hasRealLocalData && kind === "installed") {
      setKind("never-played");
      setCurrentAppId(null);
    }
  }, [hasRealLocalData, kind]);

  const selectedShelf = customShelves.find((shelf) => shelf.id === customShelfId) ?? null;
  const customShelfAppIds = selectedShelf?.games.map((game) => game.appid) ?? [];

  const pool = useMemo(
    () => buildPickPool(games, kind, { customShelfAppIds, excludedAppIds: excluded }),
    [customShelfAppIds, excluded, games, kind],
  );

  const current = currentAppId ? games.find((game) => game.appid === currentAppId) ?? null : null;

  const reason = useMemo(() => {
    const count = pool.baseCount;
    let text: string;
    switch (kind) {
      case "never-played":
        text = `${count} ${plural(count, "game")} with 0h recorded`;
        break;
      case "under-two":
        text = `${count} played ${plural(count, "game")} with more than 0h and under 2h recorded`;
        break;
      case "installed":
        text = `${count} ${plural(count, "game")} installed on this PC`;
        break;
      case "custom-shelf":
        text = `${count} currently loaded ${plural(count, "game")} filed on “${selectedShelf?.name ?? "this shelf"}”`;
        break;
    }
    if (pool.excludedCount > 0) {
      text += `; ${pool.excludedCount} excluded for this session`;
    }
    return text;
  }, [kind, pool.baseCount, pool.excludedCount, selectedShelf?.name]);

  const draw = () => {
    const choices = currentAppId && pool.games.length > 1
      ? pool.games.filter((game) => game.appid !== currentAppId)
      : pool.games;
    setCurrentAppId(drawGame(choices)?.appid ?? null);
  };

  const excludeCurrent = () => {
    if (!current) return;
    const nextExcluded = [...new Set([...excluded, current.appid])];
    const nextPool = buildPickPool(games, kind, {
      customShelfAppIds,
      excludedAppIds: nextExcluded,
    });
    setExcluded(nextExcluded);
    setCurrentAppId(drawGame(nextPool.games)?.appid ?? null);
  };

  const resetExclusions = () => {
    setExcluded([]);
    setCurrentAppId(null);
  };

  const changeKind = (next: PickPoolKind) => {
    setKind(next);
    setCurrentAppId(null);
  };

  return (
    <section id={id} className="panel pick-panel" aria-labelledby="pick-something-title">
      <div className="pick-heading">
        <div>
          <p className="eyebrow">Catalog drawer</p>
          <h2 id="pick-something-title">Pick something</h2>
          <p className="note">
            A transparent draw from rules you choose. It is not a taste recommendation.
          </p>
        </div>
        <span className="pick-stamp" aria-hidden="true">NO TASTE SCORE</span>
      </div>

      <div className="pick-controls">
        <label>
          <span>Drawer</span>
          <select
            value={kind}
            onChange={(event) => changeKind(event.target.value as PickPoolKind)}
            aria-label="Pick Something drawer"
          >
            <option value="never-played">Never played</option>
            <option value="under-two">Under 2h played</option>
            {hasRealLocalData && <option value="installed">Installed on this PC</option>}
            <option value="custom-shelf" disabled={!customShelves.length}>Custom shelf</option>
          </select>
        </label>

        {kind === "custom-shelf" && (
          <label>
            <span>Shelf</span>
            <select
              value={customShelfId}
              onChange={(event) => {
                setCustomShelfId(event.target.value);
                setCurrentAppId(null);
              }}
              aria-label="Custom shelf for Pick Something"
            >
              {customShelves.map((shelf) => (
                <option value={shelf.id} key={shelf.id}>{shelf.name}</option>
              ))}
            </select>
          </label>
        )}

        <button type="button" onClick={draw} disabled={!pool.games.length}>
          {current ? "Draw another" : "Draw from this drawer"}
        </button>
      </div>

      <p className="pick-pool-note">
        <b>{poolTitle(kind)}:</b> {reason}.
      </p>

      <div className="pick-ticket" aria-live="polite">
        {current ? (
          <>
            <div className="pick-ticket-meta">
              <span>SHELFWEAR / RANDOM DRAW</span>
              <span>{String(pool.baseCount).padStart(2, "0")} ELIGIBLE</span>
            </div>
            <div className="pick-ticket-main">
              <span className="pick-number" aria-hidden="true">#{current.appid.slice(-4).padStart(4, "0")}</span>
              <div>
                <small>DRAWN TITLE</small>
                <h3>{current.name ?? `app ${current.appid}`}</h3>
                <p>{hours(current.minutes)}h recorded{hasRealLocalData && current.installed ? " · installed on this PC" : ""}</p>
              </div>
            </div>
            <p className="pick-proof">Drawn from {reason}.</p>
            <div className="pick-actions">
              <button type="button" onClick={draw}>Draw another</button>
              <button type="button" className="secondary" onClick={excludeCurrent}>Exclude this game for this session</button>
            </div>
          </>
        ) : (
          <div className="pick-empty">
            <b>{pool.games.length ? "Drawer ready." : "Nothing is eligible in this drawer right now."}</b>
            <p>{pool.games.length ? `There are ${pool.games.length} available after session exclusions.` : reason + "."}</p>
          </div>
        )}
      </div>

      {excluded.length > 0 && (
        <button type="button" className="pick-reset" onClick={resetExclusions}>
          Reset {excluded.length} session {plural(excluded.length, "exclusion")}
        </button>
      )}
    </section>
  );
}
