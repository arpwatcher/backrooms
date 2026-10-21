import { test } from "node:test";
import assert from "node:assert/strict";
import { puddleCells, createTracks, stepTracks, shoesWet, SHOES_DRY_AFTER, PRINTS_LAST } from "../src/game/wet.js";
import { generateLayout } from "../src/world/layout.js";
import { Rng } from "../src/core/rng.js";

test("puddles are clustered, inside the level, and never by the start", () => {
  const layout = generateLayout({ seed: "puddles" });
  const cells = puddleCells(layout, new Rng("puddles"));
  assert.ok(cells.length >= 6);
  for (const c of cells) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x < layout.width && c.y < layout.height);
  }
  assert.ok(!cells.some((c) => c.x === layout.start.x && c.y === layout.start.y));
});

test("dry shoes leave no prints; a puddle wets them and every new cell gets one until they dry", () => {
  const tracks = createTracks([{ x: 2, y: 0 }]);
  assert.equal(stepTracks(tracks, { x: 0, y: 0 }, 0), null);
  assert.equal(stepTracks(tracks, { x: 1, y: 0 }, 1), null);
  assert.equal(stepTracks(tracks, { x: 2, y: 0 }, 2), null, "no print in the puddle itself");
  assert.ok(shoesWet(tracks, 2.1));
  assert.deepEqual(stepTracks(tracks, { x: 3, y: 0 }, 3), { x: 3, y: 0, t: 3 });
  assert.equal(stepTracks(tracks, { x: 3, y: 0 }, 3.5), null, "standing still doesn't print twice");
  assert.ok(stepTracks(tracks, { x: 4, y: 0 }, 4));
  assert.equal(stepTracks(tracks, { x: 5, y: 0 }, 2 + SHOES_DRY_AFTER + 0.1), null, "dry again");
  assert.ok(!shoesWet(tracks, 2 + SHOES_DRY_AFTER + 0.1));
  assert.equal(tracks.prints.length, 2);
});

test("prints dry out on their own", () => {
  const tracks = createTracks([{ x: 0, y: 0 }]);
  stepTracks(tracks, { x: 0, y: 0 }, 0);
  stepTracks(tracks, { x: 1, y: 0 }, 1);
  assert.equal(tracks.prints.length, 1);
  stepTracks(tracks, { x: 1, y: 0 }, 1 + PRINTS_LAST + 0.1);
  assert.equal(tracks.prints.length, 0);
});
