import { test } from "node:test";
import assert from "node:assert/strict";
import { pickShift, shiftChance, SHIFTS, createTrail, stepTrail } from "../src/game/shifts.js";
import { Rng } from "../src/core/rng.js";

test("no rule shifts before level 3, and more of them deeper", () => {
  for (let i = 0; i < 50; i++) assert.equal(pickShift(2, new Rng(`s${i}`)), null);
  assert.ok(shiftChance(10) > shiftChance(4));
  assert.ok(shiftChance(100) <= 0.6, "never every level");
  let shifted = 0;
  for (let i = 0; i < 400; i++) if (pickShift(6, new Rng(`t${i}`))) shifted++;
  assert.ok(shifted > 80 && shifted < 260, `shifted ${shifted} of 400`);
});

test("a shift is never picked before its depth", () => {
  for (let i = 0; i < 300; i++) {
    const s = pickShift(4, new Rng(`u${i}`));
    if (s) assert.ok(s.minDepth <= 4, s.id);
  }
});

test("every shift has a note so the level can tell you about it", () => {
  for (const s of SHIFTS) assert.ok(s.note.length > 10, s.id);
});

test("lights behind you die a while after you pass under them, once each", () => {
  const lights = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 5, y: 5 }];
  const trail = createTrail();
  assert.deepEqual(stepTrail(trail, lights, { x: 1, y: 1 }, 0, 10), []);
  assert.deepEqual(stepTrail(trail, lights, { x: 2, y: 1 }, 4, 10), []);
  assert.deepEqual(stepTrail(trail, lights, { x: 3, y: 1 }, 10, 10), [0]);
  assert.deepEqual(stepTrail(trail, lights, { x: 1, y: 1 }, 14, 10), [1], "walking back under a dead one does nothing");
  assert.deepEqual(stepTrail(trail, lights, { x: 1, y: 1 }, 40, 10), []);
});
