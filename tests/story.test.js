import { test } from "node:test";
import assert from "node:assert/strict";
import { RADIO, ENDING, radioSchedule } from "../src/game/story.js";
import { FIRST_LEVELS } from "../src/game/firstLevels.js";

test("the radio speaks on every story level, and the ending has its own words", () => {
  for (const level of FIRST_LEVELS) assert.ok(RADIO[level.depth]?.length >= 2, `level ${level.depth}`);
  assert.ok(ENDING.lines.length >= 3);
});

test("radio lines are spaced so each can be read, and only story levels talk", () => {
  const lines = radioSchedule(1, 10, 7);
  assert.deepEqual(lines.map((l) => l.at), [10, 17, 24]);
  for (const l of lines) assert.ok(l.text.length < 140, "short enough to read in a few seconds");
  assert.deepEqual(radioSchedule(40, 0), []);
});
