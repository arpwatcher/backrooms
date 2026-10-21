import { test } from "node:test";
import assert from "node:assert/strict";
import { placeNotes, TEACHING, LORE } from "../src/game/notes.js";
import { generateLayout, hasWall, distancesFrom } from "../src/world/layout.js";
import { Rng } from "../src/core/rng.js";

test("the first level teaches, in order: the first note is by the start", () => {
  for (const seed of ["n1", "n2", "n3", "smoke/L0", "open"]) {
    const layout = generateLayout({ seed });
    const notes = placeNotes(layout, 0, new Rng(seed));
    assert.equal(notes.length, TEACHING[0].length);
    assert.deepEqual(notes.map((n) => n.text), TEACHING[0]);
    const dist = distancesFrom(layout, layout.start);
    const nearest = Math.min(...notes.map((n) => dist[n.y][n.x]));
    assert.equal(dist[notes[0].y][notes[0].x], nearest, "the first note is the nearest one");
    assert.ok(dist[notes[0].y][notes[0].x] <= 3, "and it is close to the start");
    for (let i = 1; i < notes.length; i++) {
      assert.ok(dist[notes[i].y][notes[i].x] >= dist[notes[i - 1].y][notes[i - 1].x], "later notes further along");
    }
  }
});

test("every note is taped to a real wall", () => {
  for (let depth = 0; depth < 12; depth++) {
    const layout = generateLayout({ seed: `w${depth}` });
    for (const n of placeNotes(layout, depth, new Rng(`w${depth}`))) {
      assert.ok(hasWall(layout, n.x, n.y, n.side.dx, n.side.dy));
    }
  }
});

test("deeper levels sometimes carry lore instead", () => {
  let lore = 0;
  for (let i = 0; i < 40; i++) {
    const layout = generateLayout({ seed: `l${i}` });
    const notes = placeNotes(layout, 9, new Rng(`l${i}`));
    for (const n of notes) assert.ok(LORE.includes(n.text));
    lore += notes.length;
  }
  assert.ok(lore > 10);
});
