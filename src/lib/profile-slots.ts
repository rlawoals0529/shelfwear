import { hasSteamProfileInput, normaliseSteamProfileInput } from "./steam.js";

export interface FilledProfileSlots {
  values: string[];
  slotIndex: number | null;
  changed: boolean;
}

const comparableProfile = (value: string): string =>
  normaliseSteamProfileInput(value).replace(/\/+$/, "");

export function findResolvedProfileSlot(
  values: readonly string[],
  steamid: string,
  equivalentInputs: readonly string[] = [],
): number | null {
  if (!/^\d{17}$/.test(steamid)) return null;
  const equivalents = new Set(
    [steamid, ...equivalentInputs]
      .map(comparableProfile)
      .filter(Boolean),
  );

  const index = values.findIndex((value) => equivalents.has(comparableProfile(value)));
  return index >= 0 ? index : null;
}

export function fillResolvedProfileSlot(
  values: readonly string[],
  steamid: string,
  equivalentInputs: readonly string[] = [],
): FilledProfileSlots {
  const currentSlot = findResolvedProfileSlot(values, steamid, equivalentInputs);
  if (currentSlot !== null) {
    return { values: [...values], slotIndex: currentSlot, changed: false };
  }
  if (!/^\d{17}$/.test(steamid)) {
    return { values: [...values], slotIndex: null, changed: false };
  }

  const openSlot = values.findIndex((value) => !hasSteamProfileInput(value));
  if (openSlot < 0) {
    return { values: [...values], slotIndex: null, changed: false };
  }

  const next = [...values];
  next[openSlot] = steamid;
  return { values: next, slotIndex: openSlot, changed: true };
}
