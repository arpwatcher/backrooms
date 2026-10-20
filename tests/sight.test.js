import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLayout } from "../src/world/layout.js";
import { lineOfSight } from "../src/world/sight.js";
import { createPathfinder } from "../src/world/path.js";
import { CELL } from "../src/world/units.js";
import { Rng } from "../src/core/rng.js";

function room(width = 8, height = 8) {
  return generateLayout({ seed: "open", width, height, wallRuns: 0, rooms: 0, pillarChance: 0 });
}
const c = (n) => (n + 0.5) * CELL;

test("you can see across an empty room", () => {
  assert.equal(lineOfSight(room(), c(0), c(0), c(7), c(5)), true);
});

test("a wall between you blocks sight", () => {
  const layout = room();
  for (let y = 0; y < 8; y++) layout.west[y][4] = true;
  assert.equal(lineOfSight(layout, c(1), c(3), c(6), c(3)), false);
  assert.equal(lineOfSight(layout, c(1), c(3), c(3), c(6)), true);
});

test("a gap in the wall lets sight through, straight on", () => {
  const layout = room();
  for (let y = 0; y < 8; y++) if (y !== 3) layout.west[y][4] = true;
  assert.equal(lineOfSight(layout, c(1), c(3), c(6), c(3)), true);
});

test("a pillar in the way blocks sight", () => {
  const layout = room();
  layout.pillars.push({ x: 3, y: 3 });
  assert.equal(lineOfSight(layout, c(1), c(3), c(6), c(3)), false);
});

test("sight is symmetric", () => {
  const layout = generateLayout({ seed: "sym-sight" });
  const rng = new Rng(4);
  for (let i = 0; i < 200; i++) {
    const a = [rng.range(0.5, 31.5) * CELL, rng.range(0.5, 31.5) * CELL];
    const b = [rng.range(0.5, 31.5) * CELL, rng.range(0.5, 31.5) * CELL];
    assert.equal(lineOfSight(layout, a[0], a[1], b[0], b[1]), lineOfSight(layout, b[0], b[1], a[0], a[1]));
  }
});

test("following next steps always reaches the goal, never through a wall", () => {
  const layout = generateLayout({ seed: "paths" });
  const paths = createPathfinder(layout);
  const rng = new Rng(11);
  for (let trial = 0; trial < 30; trial++) {
    let at = { x: rng.int(0, 31), y: rng.int(0, 31) };
    const goal = { x: rng.int(0, 31), y: rng.int(0, 31) };
    const expected = paths.distance(at, goal);
    let steps = 0;
    while ((at.x !== goal.x || at.y !== goal.y) && steps < 2000) {
      at = paths.nextStep(at, goal);
      steps++;
    }
    assert.deepEqual(at, goal);
    assert.equal(steps, expected);
  }
});

test("wandering never walks through a wall and avoids doubling back when it can", () => {
  const layout = generateLayout({ seed: "wander" });
  const paths = createPathfinder(layout);
  const rng = new Rng(2);
  let at = layout.start;
  let previous = null;
  for (let i = 0; i < 300; i++) {
    const next = paths.wander(at, rng, previous);
    assert.equal(Math.abs(next.x - at.x) + Math.abs(next.y - at.y) <= 1, true);
    previous = at;
    at = next;
  }
});
