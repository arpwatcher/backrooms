import { test } from "node:test";
import assert from "node:assert/strict";
import { createHints, stepHints, HINTS } from "../src/game/hints.js";

const at = (extra) => ({ depth: 0, walked: 0, toggledLight: false, crouched: false, time: 0, ...extra });

test("level 0 walks you through it: walk, light, the exit, help - each until done", () => {
  const hints = createHints();
  assert.match(stepHints(hints, at({ time: 0 })), /walk/);
  assert.match(stepHints(hints, at({ time: 30, walked: 1 })), /walk/, "not until you've actually walked");
  assert.match(stepHints(hints, at({ time: 31, walked: 3 })), /flashlight/);
  assert.match(stepHints(hints, at({ time: 40, walked: 3, toggledLight: true })), /EXIT/);
  assert.match(stepHints(hints, at({ time: 45, walked: 3, toggledLight: true })), /EXIT/);
  assert.match(stepHints(hints, at({ time: 52, walked: 3, toggledLight: true })), /H shows/);
  assert.equal(stepHints(hints, at({ time: 60, walked: 3, toggledLight: true })), null, "then quiet");
});

test("each level gets its own hints, and a hint seen before is never shown again", () => {
  const hints = createHints();
  assert.match(stepHints(hints, at({ depth: 1, time: 0 })), /crouch/);
  assert.equal(stepHints(hints, at({ depth: 1, time: 1, crouched: true })), null);
  const again = createHints(hints.seen);
  assert.equal(stepHints(again, at({ depth: 1, time: 0 })), null);
  assert.ok(HINTS.every((h) => h.text.length < 90), "short enough to read at a glance");
});

test("leaving the level drops its hint", () => {
  const hints = createHints();
  stepHints(hints, at({ time: 0 }));
  assert.match(stepHints(hints, at({ depth: 2, time: 1 })), /flashlight/);
});
