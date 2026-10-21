import { test } from "node:test";
import assert from "node:assert/strict";
import { createPhantoms, stepPhantoms, angleTo, PHANTOM_BELOW, GLANCE, EDGE } from "../src/game/phantoms.js";
import { Rng } from "../src/core/rng.js";

const view = { x: 0, z: 0, yaw: 0 };   // looking down -z
const place = (angle, distance) => ({ x: -Math.sin(angle) * distance, z: -Math.cos(angle) * distance });

test("angles: straight ahead is 0, the sides are signed", () => {
  assert.ok(Math.abs(angleTo(view, 0, -5)) < 1e-9);
  assert.ok(angleTo(view, -5, -5) > 0);
  assert.ok(angleTo(view, 5, -5) < 0);
});

test("a lucid mind sees nothing that isn't there", () => {
  const state = createPhantoms();
  const rng = new Rng("lucid");
  for (let t = 0; t < 120; t += 0.1) assert.equal(stepPhantoms(state, { lucidity: PHANTOM_BELOW + 0.01, time: t, view, place, rng }), null);
});

test("a slipping mind sees figures at the edge of vision, never straight ahead", () => {
  const state = createPhantoms();
  const rng = new Rng("slip");
  let seen = 0;
  for (let t = 0; t < 300; t += 0.1) {
    const r = stepPhantoms(state, { lucidity: 0.1, time: t, view, place, rng });
    if (r?.appeared) {
      seen++;
      const off = Math.abs(angleTo(view, r.appeared.x, r.appeared.z));
      assert.ok(off >= EDGE[0] - 1e-9 && off <= EDGE[1] + 1e-9, `at ${off}`);
    }
  }
  assert.ok(seen >= 10, `${seen} phantoms in five minutes`);
});

test("look straight at one and it's gone", () => {
  const state = createPhantoms();
  const rng = new Rng("look");
  let t = 0;
  let r = null;
  while (!r?.appeared) r = stepPhantoms(state, { lucidity: 0.05, time: (t += 0.1), view, place, rng });
  const p = r.appeared;
  const facing = { ...view, yaw: Math.atan2(-p.x, -p.z) };
  assert.ok(Math.abs(angleTo(facing, p.x, p.z)) < GLANCE);
  assert.ok(stepPhantoms(state, { lucidity: 0.05, time: t + 0.1, view: facing, place, rng })?.vanished);
});

test("nowhere to stand in plain view means no phantom", () => {
  const state = createPhantoms();
  const rng = new Rng("blocked");
  for (let t = 0; t < 60; t += 0.1) assert.equal(stepPhantoms(state, { lucidity: 0.05, time: t, view, place: () => null, rng }), null);
});
