// Player settings, kept in this browser between visits.

const KEY = "noclip.settings.v1";
export const DEFAULTS = { sensitivity: 1, volume: 0.9 };

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "{}");
    return {
      sensitivity: clamp(Number(saved.sensitivity ?? DEFAULTS.sensitivity), 0.2, 3, DEFAULTS.sensitivity),
      volume: clamp(Number(saved.volume ?? DEFAULTS.volume), 0, 1, DEFAULTS.volume),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage blocked: settings last this visit only
  }
}

function clamp(value, lo, hi, fallback) {
  return Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
}
