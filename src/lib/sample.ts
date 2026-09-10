/**
 * A library to look at before you have dropped anything in.
 *
 * Invented, and shaped like the real thing: a few titles holding most of the hours, a long
 * tail of never-launched ones taking up most of the disk, one installed game whose manifest
 * has no size so the partial-total caveat has something to fire on.
 */
export const SAMPLE_CONFIG = `
"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps"
{
  "10"   { "playTime" "18240" "LastPlayed" "1735689600" }
  "20"   { "playTime" "7015"  "LastPlayed" "1730000000" }
  "30"   { "playTime" "3120"  "LastPlayed" "1712000000" }
  "40"   { "playTime" "742"   "LastPlayed" "1699000000" }
  "50"   { "playTime" "196"   "LastPlayed" "1690000000" }
  "60"   { "playTime" "41"    "LastPlayed" "1688000000" }
  "70"   { "playTime" "12"    "LastPlayed" "1670000000" }
  "80"   { "playTime" "0" }
  "90"   { "playTime" "0" }
  "100"  { "playTime" "0" }
  "110"  { "playTime" "0" }
  "120"  { "playTime" "0" }
  "130"  { "playTime" "0" }
  "140"  { "playTime" "0" }
} } } } }`;

const M = (id: string, name: string, size: string | null) =>
  `"AppState" { "appid" "${id}" "name" "${name}"${size === null ? "" : ` "SizeOnDisk" "${size}"`} }`;

export const SAMPLE_MANIFESTS = [
  M("10", "Endless Tactics", "48318382080"),
  M("20", "Harbourline", "21474836480"),
  M("30", "Nightshift Courier", "12884901888"),
  M("40", "Paper Streets", "8589934592"),
  M("60", "Six Minute Roguelike", "3221225472"),
  M("80", "The Long Ascent", "96636764160"),
  M("90", "Foundry of Small Machines", "64424509440"),
  M("100", "Cartographers of Nowhere", "53687091200"),
  M("110", "Winter Package", "42949672960"),
  M("120", "A Very Long RPG", "38654705664"),
  M("130", "Sim Something", "26843545600"),
  // Installed, and its manifest carries no size. The disk figures are a floor because of it.
  M("140", "Unlabelled Early Access Thing", null),
];
