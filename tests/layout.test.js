import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLayout, distancesFrom, hasWall, DIRS } from "../src/world/layout.js";

const seeds = ["a", "b", "level-7", "level-99", 12345];

test("same seed, same level", () => {
  assert.deepEqual(generateLayout({ seed: "x" }), generateLayout({ seed: "x" }));
});

test("the border is closed all the way round", () => {
  const layout = generateLayout({ seed: "border", width: 20, height: 14 });
  for (let x = 0; x < 20; x++) assert.ok(layout.north[0][x] && layout.north[14][x]);
  for (let y = 0; y < 14; y++) assert.ok(layout.west[y][0] && layout.west[y][20]);
});

for (const seed of seeds) {
  test(`every cell can be walked to (seed ${seed})`, () => {
    const layout = generateLayout({ seed });
    const dist = distancesFrom(layout, layout.start);
    for (const row of dist) for (const d of row) assert.notEqual(d, -1);
  });

  test(`the exit is far from the start (seed ${seed})`, () => {
    const layout = generateLayout({ seed });
    const dist = distancesFrom(layout, layout.start);
    const [exit] = layout.exits;
    assert.ok(dist[exit.y][exit.x] >= layout.maxDistance * 0.6);
  });
}

test("walls are symmetric: blocked one way means blocked the other", () => {
  const layout = generateLayout({ seed: "sym" });
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      for (const { dx, dy } of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        assert.equal(hasWall(layout, x, y, dx, dy), hasWall(layout, nx, ny, -dx, -dy));
      }
    }
  }
});

test("several exits are spread apart", () => {
  const layout = generateLayout({ seed: "three-exits", exits: 3 });
  assert.equal(layout.exits.length, 3);
  for (const a of layout.exits) {
    for (const b of layout.exits) {
      if (a !== b) assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 6);
    }
  }
});

test("pillars never stand next to the start or seal a cell", () => {
  const layout = generateLayout({ seed: "pillars", pillarChance: 0.3 });
  assert.ok(layout.pillars.length > 0);
  for (const p of layout.pillars) {
    assert.ok(Math.abs(p.x - layout.start.x) + Math.abs(p.y - layout.start.y) >= 3);
    for (const { dx, dy } of DIRS) assert.equal(hasWall(layout, p.x, p.y, dx, dy), false);
  }
});

test("items sit between the start and the exit, not on either", () => {
  const layout = generateLayout({ seed: "items", items: 6 });
  assert.equal(layout.items.length, 6);
  const dist = distancesFrom(layout, layout.start);
  for (const item of layout.items) {
    assert.ok(dist[item.y][item.x] > 3);
    assert.ok(layout.exits.every((e) => e.x !== item.x || e.y !== item.y));
  }
});

test("lights come in three states, mostly on", () => {
  const layout = generateLayout({ seed: "lights" });
  const states = layout.lights.map((l) => l.state);
  assert.ok(states.filter((s) => s === "on").length > states.length * 0.7);
  assert.ok(new Set(states).size >= 2);
});
