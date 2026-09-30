/**
 * A library to look at before you have dropped anything in.
 *
 * The Steam app IDs and titles are real so the demo can use official Steam artwork. Every
 * usage figure below (hours, dates, and disk sizes) is deliberately synthetic; the UI labels
 * the sample as synthetic so a real game's name is never mistaken for measured user data.
 */
export const SAMPLE_CONFIG = `
"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps"
{
  "730"     { "playTime" "18240" "LastPlayed" "1735689600" }
  "413150"  { "playTime" "7015"  "LastPlayed" "1730000000" }
  "367520"  { "playTime" "3120"  "LastPlayed" "1712000000" }
  "620"     { "playTime" "742"   "LastPlayed" "1699000000" }
  "1145360" { "playTime" "196"   "LastPlayed" "1690000000" }
  "105600"  { "playTime" "41"    "LastPlayed" "1688000000" }
  "550"     { "playTime" "12"    "LastPlayed" "1670000000" }
  "1086940" { "playTime" "120"   "LastPlayed" "1668000000" }
  "1091500" { "playTime" "0" }
  "1245620" { "playTime" "90"    "LastPlayed" "1664000000" }
  "289070"  { "playTime" "0" }
  "292030"  { "playTime" "0" }
  "440"     { "playTime" "0" }
  "570"     { "playTime" "0" }
} } } } }`;

const M = (id: string, name: string, size: string | null) =>
  `"AppState" { "appid" "${id}" "name" "${name}"${size === null ? "" : ` "SizeOnDisk" "${size}"`} }`;

export const SAMPLE_MANIFESTS = [
  M("730", "Counter-Strike 2", "48318382080"),
  M("413150", "Stardew Valley", "21474836480"),
  M("367520", "Hollow Knight", "12884901888"),
  M("620", "Portal 2", "8589934592"),
  M("1145360", "Hades", "12884901888"),
  M("105600", "Terraria", "3221225472"),
  M("550", "Left 4 Dead 2", "13958643712"),
  M("1086940", "Baldur's Gate 3", "96636764160"),
  M("1091500", "Cyberpunk 2077", "64424509440"),
  M("1245620", "ELDEN RING", "53687091200"),
  M("289070", "Sid Meier's Civilization VI", "42949672960"),
  M("292030", "The Witcher 3: Wild Hunt", "38654705664"),
  M("440", "Team Fortress 2", "26843545600"),
  // Installed, and its manifest carries no size. The disk figures are a floor because of it.
  M("570", "Dota 2", null),
];
