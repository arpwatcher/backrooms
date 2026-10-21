import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSettings, saveSettings, DEFAULTS } from "../src/game/settings.js";

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test("settings survive a reload", () => {
  const store = memory();
  saveSettings({ sensitivity: 1.8, volume: 0.4 }, store);
  assert.deepEqual(loadSettings(store), { sensitivity: 1.8, volume: 0.4 });
});

test("missing, broken or silly settings fall back to sane values", () => {
  assert.deepEqual(loadSettings(memory()), DEFAULTS);
  const broken = memory();
  broken.setItem("noclip.settings.v1", "{not json");
  assert.deepEqual(loadSettings(broken), DEFAULTS);
  const silly = memory();
  silly.setItem("noclip.settings.v1", JSON.stringify({ sensitivity: 99, volume: "loud" }));
  assert.deepEqual(loadSettings(silly), { sensitivity: 3, volume: DEFAULTS.volume });
  assert.deepEqual(loadSettings(null), DEFAULTS);
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadSettings(throwing), DEFAULTS);
  saveSettings(DEFAULTS, throwing);
});
