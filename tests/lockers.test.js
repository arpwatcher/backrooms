import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLayout, hasWall, distancesFrom } from "../src/world/layout.js";
import { placeLockers, hiddenIn, lockerCount, insideOf } from "../src/game/lockers.js";
import { makeSense } from "../src/game/sense.js";
import { CELL } from "../src/world/units.js";
import { Rng } from "../src/core/rng.js";

const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];

test("lockers stand in snug spots, away from the start, spread apart", () => {
  for (let i = 0; i < 8; i++) {
    const layout = generateLayout({ seed: `lockers-${i}` });
    const lockers = placeLockers(layout, 4, new Rng(`l-${i}`));
    assert.ok(lockers.length > 0, `level ${i} has somewhere to hide`);
    assert.ok(lockers.length <= lockerCount(4));
    const dist = distancesFrom(layout, layout.start);
    for (const l of lockers) {
      const walls = sides.filter(([dx, dy]) => hasWall(layout, l.x, l.y, dx, dy)).length;
      assert.ok(walls >= 2, "a dead end or a corner");
      assert.ok(hasWall(layout, l.x, l.y, l.side.dx, l.side.dy), "against a real wall");
      assert.ok(dist[l.y][l.x] >= 4, "not right at the start");
    }
    for (const a of lockers) for (const b of lockers) if (a !== b) assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 4);
  }
});

test("the same level always has its lockers in the same places", () => {
  const layout = generateLayout({ seed: "same" });
  assert.deepEqual(placeLockers(layout, 5, new Rng("x")), placeLockers(layout, 5, new Rng("x")));
});

test("no lockers in the lobby", () => {
  assert.equal(placeLockers(generateLayout({ seed: "lobby" }), 0, new Rng("x")).length, 0);
});

test("crouched inside a locker you are hidden; standing, or just near it, you are not", () => {
  const lockers = [{ x: 3, y: 2, side: { dx: 0, dy: -1 } }];
  const at = insideOf(lockers[0]);
  assert.ok(at.z < 2.5 * CELL, "it stands against the north wall of its cell");
  assert.ok(hiddenIn(lockers, { ...at, crouching: true }));
  assert.equal(hiddenIn(lockers, { ...at, crouching: false }), null);
  assert.equal(hiddenIn(lockers, { x: 3.5 * CELL, z: 2.5 * CELL, crouching: true }), null, "the middle of the cell is out in the open");
});

test("hidden, nothing can see you, even right outside the door", () => {
  const layout = generateLayout({ seed: "see", width: 6, height: 6, wallRuns: 0, rooms: 0, pillarChance: 0 });
  const player = { x: 2.5 * CELL, z: 2.5 * CELL, yaw: 0 };
  const flashlight = { on: false, battery: 1 };
  const entity = { x: 3.5 * CELL, z: 2.5 * CELL };
  const seen = makeSense({ player, flashlight, layout, paths: null, lightAt: () => "lit", time: 0 });
  assert.ok(seen.canSee(entity, 10));
  const hidden = makeSense({ player, flashlight, layout, paths: null, lightAt: () => "lit", time: 0, hidden: true });
  assert.ok(!hidden.canSee(entity, 10));
});

test("with others in the room, each is seen for themselves; a locker hides only you", () => {
  const layout = generateLayout({ seed: "see", width: 6, height: 6, wallRuns: 0, rooms: 0, pillarChance: 0 });
  const player = { id: "p1", x: 2.5 * CELL, z: 2.5 * CELL, yaw: 0 };
  const friend = { id: "p2", x: 4.5 * CELL, z: 4.5 * CELL, yaw: 0 };
  const gone = { id: "p3", x: 1.5 * CELL, z: 1.5 * CELL, echo: { since: 0 } };
  const entity = { x: 4.5 * CELL, z: 3.5 * CELL };
  const sense = makeSense({ player, flashlight: { on: false, battery: 1 }, layout, paths: null, lightAt: () => "lit", time: 0, hidden: true, others: [friend, gone] });
  assert.deepEqual(sense.players.map((p) => p.id), ["p1", "p2"], "echoes aren't hunted");
  assert.ok(!sense.canSee(entity, 10), "you're in a locker");
  assert.ok(sense.canSee(entity, 10, friend), "your friend isn't");
});
