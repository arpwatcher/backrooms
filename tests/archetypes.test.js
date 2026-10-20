import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHETYPES, pickArchetype, archetypeFor } from "../src/world/archetypes.js";
import { generateLayout, distancesFrom } from "../src/world/layout.js";
import { Rng } from "../src/core/rng.js";

test("the first level is always the lobby", () => {
  for (let i = 0; i < 10; i++) assert.equal(pickArchetype(0, new Rng(`a${i}`)).id, "lobby");
});

test("never the same kind of place twice in a row, and nothing before its depth", () => {
  let previous = null;
  for (let depth = 1; depth < 60; depth++) {
    const a = pickArchetype(depth, new Rng(`d${depth}`), previous);
    assert.notEqual(a.id, previous);
    assert.ok(a.minDepth <= depth);
    previous = a.id;
  }
});

test("every archetype makes a level where every cell can be reached", () => {
  for (const a of ARCHETYPES) {
    for (const seed of ["x", "y", "z"]) {
      const layout = generateLayout({ seed: `${a.id}-${seed}`, ...a.layout });
      const dist = distancesFrom(layout, layout.start);
      for (let y = 0; y < layout.height; y++) {
        for (let x = 0; x < layout.width; x++) assert.ok(dist[y][x] >= 0, `${a.id} ${seed}: cell ${x},${y} is sealed off`);
      }
      assert.ok(layout.exits.length >= 1);
    }
  }
});

test("the archetypes really differ: the pillar hall is open, the maze is dense", () => {
  const count = (layout) => layout.north.flat().filter(Boolean).length + layout.west.flat().filter(Boolean).length;
  const hall = generateLayout({ seed: "cmp", ...ARCHETYPES.find((a) => a.id === "pillars").layout });
  const maze = generateLayout({ seed: "cmp", ...ARCHETYPES.find((a) => a.id === "cubicles").layout });
  assert.ok(count(maze) > count(hall) * 1.5, `maze ${count(maze)} vs hall ${count(hall)}`);
  assert.ok(hall.pillars.length > maze.pillars.length);
});

test("the archetype of a depth is the same no matter how you got there", () => {
  const rngFor = (d) => new Rng(`run/L${d}/archetype`);
  const walked = [];
  let previous = null;
  for (let d = 0; d < 12; d++) {
    const a = pickArchetype(d, rngFor(d), previous);
    walked.push(a.id);
    previous = a.id;
  }
  for (let d = 0; d < 12; d++) assert.equal(archetypeFor(d, rngFor).id, walked[d]);
});
