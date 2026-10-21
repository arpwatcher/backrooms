import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTask, placeTask, interact, doneCount, TASKS, taskChance } from "../src/game/tasks.js";
import { generateLayout, hasWall, distancesFrom } from "../src/world/layout.js";
import { Rng } from "../src/core/rng.js";

const power = TASKS.find((t) => t.id === "power");

test("no tasks on the first levels; some levels deeper down have one", () => {
  for (let i = 0; i < 40; i++) assert.equal(pickTask(1, new Rng(`t${i}`)), null);
  assert.ok(taskChance(8) > taskChance(3));
  let some = 0;
  for (let i = 0; i < 200; i++) if (pickTask(5, new Rng(`p${i}`))) some++;
  assert.ok(some > 30 && some < 140, `${some} of 200`);
});

test("breakers sit on walls, away from the start and the exit, spread apart", () => {
  for (const seed of ["a", "b", "c", "d"]) {
    const layout = generateLayout({ seed });
    const state = placeTask(power, layout, new Rng(seed));
    assert.equal(state.targets.length, 3, seed);
    const dist = distancesFrom(layout, layout.start);
    for (const t of state.targets) {
      assert.ok(hasWall(layout, t.x, t.y, t.side.dx, t.side.dy), "mounted on a real wall");
      assert.ok(dist[t.y][t.x] >= 5, "not by the start");
      assert.ok(!layout.exits.some((e) => e.x === t.x && e.y === t.y), "not on the exit");
    }
    for (const a of state.targets) {
      for (const b of state.targets) if (a !== b) assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 2);
    }
  }
});

test("flipping every breaker completes the task, each one counts once", () => {
  const layout = generateLayout({ seed: "flip" });
  const state = placeTask(power, layout, new Rng("flip"));
  const [a, b, c] = state.targets;
  assert.equal(interact(state, (t) => t === a), a);
  assert.equal(interact(state, (t) => t === a), null, "already done");
  assert.equal(doneCount(state), 1);
  interact(state, (t) => t === b);
  assert.equal(state.complete, false);
  interact(state, (t) => t === c);
  assert.equal(state.complete, true);
  assert.match(power.progress(3, 3), /exit/);
});
