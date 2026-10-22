import { test } from "node:test";
import assert from "node:assert/strict";
import { createSightings, stepSightings, STING_COOLDOWN, STING_RANGE } from "../src/game/sighting.js";

const def = { hunting: (e) => e.state === "hunt" };
const player = { x: 0, z: 0 };

test("one sting when something starts hunting you, not every frame it hunts", () => {
  const seen = createSightings();
  const e = { id: 1, x: 5, z: 0, def, state: "wander" };
  assert.equal(stepSightings(seen, [e], player, 0).length, 0);
  e.state = "hunt";
  assert.equal(stepSightings(seen, [e], player, 1).length, 1);
  assert.equal(stepSightings(seen, [e], player, 1.1).length, 0);
  assert.equal(stepSightings(seen, [e], player, 5).length, 0);
});

test("it has to calm down for a while before it can sting again", () => {
  const seen = createSightings();
  const e = { id: 1, x: 5, z: 0, def, state: "hunt" };
  assert.equal(stepSightings(seen, [e], player, 0).length, 1);
  e.state = "wander";
  stepSightings(seen, [e], player, 1);
  e.state = "hunt";
  assert.equal(stepSightings(seen, [e], player, 2).length, 0, "too soon");
  e.state = "wander";
  stepSightings(seen, [e], player, 3);
  e.state = "hunt";
  assert.equal(stepSightings(seen, [e], player, STING_COOLDOWN + 1).length, 1);
});

test("a hunt far away doesn't sting", () => {
  const seen = createSightings();
  const e = { id: 2, x: STING_RANGE + 5, z: 0, def, state: "hunt" };
  assert.equal(stepSightings(seen, [e], player, 0).length, 0);
});
