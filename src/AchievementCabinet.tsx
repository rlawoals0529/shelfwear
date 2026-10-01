import { useEffect, useMemo, useState } from "react";
import {
  achievementCabinetFilename,
  downloadBlob,
  renderAchievementCabinetCard,
} from "./lib/share-card.js";
import type { SteamAchievement, SteamAchievementCabinet } from "./lib/steam.js";

const formatUnlock = (unlockTime: number | null): string => {
  if (!unlockTime) return "unlock date unavailable";
  return new Date(unlockTime * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function AchievementCabinet({
  cabinet,
  profileName,
}: {
  cabinet: SteamAchievementCabinet;
  profileName: string | null;
}) {
  const unlocked = useMemo(() => cabinet.achievements
    .filter((achievement) => achievement.achieved)
    .sort((a, b) => {
      const aRarity = a.globalPercent ?? Number.POSITIVE_INFINITY;
      const bRarity = b.globalPercent ?? Number.POSITIVE_INFINITY;
      return aRarity - bRarity
        || (b.unlockTime ?? 0) - (a.unlockTime ?? 0)
        || a.name.localeCompare(b.name);
    }), [cabinet.achievements]);

  const rarest = useMemo(
    () => unlocked.find((achievement) => achievement.globalPercent !== null) ?? null,
    [unlocked],
  );
  const latest = useMemo(
    () => [...unlocked]
      .filter((achievement) => achievement.unlockTime !== null)
      .sort((a, b) => (b.unlockTime ?? 0) - (a.unlockTime ?? 0))[0] ?? null,
    [unlocked],
  );

  const [selectedApis, setSelectedApis] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedApis(unlocked.slice(0, Math.min(3, unlocked.length)).map((achievement) => achievement.apiName));
    setRenderError(null);
  }, [cabinet.appid, unlocked]);

  const selectedAchievements = useMemo(
    () => selectedApis
      .map((apiName) => unlocked.find((achievement) => achievement.apiName === apiName))
      .filter((achievement): achievement is SteamAchievement => Boolean(achievement)),
    [selectedApis, unlocked],
  );

  const toggleAchievement = (apiName: string) => {
    setSelectedApis((current) => {
      if (current.includes(apiName)) return current.filter((item) => item !== apiName);
      if (current.length >= 6) return current;
      return [...current, apiName];
    });
  };

  const download = async () => {
    if (!selectedAchievements.length) return;
    setRenderError(null);
    setRendering(true);
    try {
      const gameName = cabinet.gameName ?? ("Steam app " + cabinet.appid);
      const blob = await renderAchievementCabinetCard({
        gameName,
        profileName,
        unlocked: cabinet.unlocked,
        total: cabinet.total,
        completionPercent: cabinet.completionPercent,
        achievements: selectedAchievements,
      });
      downloadBlob(blob, achievementCabinetFilename(gameName));
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : String(error));
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="achievement-cabinet">
      <div className="achievement-cabinet-meta">
        <span>SHELFWEAR / TROPHY DRAWER</span>
        <span>{cabinet.unlocked}/{cabinet.total} UNLOCKED</span>
      </div>

      <div className="achievement-cabinet-summary">
        <div className="achievement-completion" aria-label={cabinet.completionPercent + "% achievement completion"}>
          <b>{cabinet.completionPercent}%</b>
          <span>complete</span>
        </div>
        <div className="achievement-cabinet-facts">
          <span>
            <small>Rarest unlocked</small>
            <b>{rarest?.name ?? "Rarity unavailable"}</b>
            {rarest && rarest.globalPercent !== null && <em>{rarest.globalPercent.toFixed(2)}% global</em>}
          </span>
          <span>
            <small>Latest recorded unlock</small>
            <b>{latest?.name ?? "No unlock date available"}</b>
            {latest && <em>{formatUnlock(latest.unlockTime)}</em>}
          </span>
        </div>
      </div>

      {unlocked.length === 0 ? (
        <div className="achievement-empty">
          <span aria-hidden="true">◇</span>
          <b>No unlocked achievements came back from Steam.</b>
          <p>The game may have no achievements, or this public response may not expose any unlocked ones.</p>
        </div>
      ) : (
        <>
          <div className="achievement-picker-head">
            <div>
              <b>Pin trophies to the card</b>
              <span>Select up to six unlocked achievements · {selectedApis.length}/6 selected</span>
            </div>
            <button type="button" disabled={!selectedAchievements.length || rendering} onClick={() => void download()}>
              <span aria-hidden="true">↓</span>
              {rendering ? "Making cabinet…" : "Download Trophy Cabinet"}
            </button>
          </div>

          <div className="achievement-list">
            {unlocked.slice(0, 24).map((achievement) => {
              const selected = selectedApis.includes(achievement.apiName);
              const limitReached = selectedApis.length >= 6 && !selected;
              return (
                <button
                  type="button"
                  key={achievement.apiName}
                  className={selected ? "achievement-slip selected" : "achievement-slip"}
                  aria-pressed={selected}
                  disabled={limitReached}
                  onClick={() => toggleAchievement(achievement.apiName)}
                >
                  <span className="achievement-icon" aria-hidden="true">
                    <span>✦</span>
                    {achievement.icon && <img src={achievement.icon} alt="" loading="lazy" />}
                  </span>
                  <span className="achievement-slip-copy">
                    <b>{achievement.name}</b>
                    <small>{achievement.description ?? "Steam provided no public description."}</small>
                  </span>
                  <span className="achievement-slip-meta">
                    <em>{achievement.globalPercent === null ? "rarity —" : achievement.globalPercent.toFixed(2) + "%"}</em>
                    <small>{formatUnlock(achievement.unlockTime)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {renderError && <p className="err">{renderError}</p>}
    </div>
  );
}
