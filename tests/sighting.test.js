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

test("the chase is as intense as the nearest thing hunting you is close", async () => {
  const { chaseIntensity, heartRate, CHASE_RANGE } = await import("../src/game/sighting.js");
  const near = { x: 2, z: 0, def, state: "hunt" };
  const far = { x: 18, z: 0, def, state: "hunt" };
  const calm = { x: 1, z: 0, def, state: "wander" };
  assert.equal(chaseIntensity([calm], player), 0, "something close but not hunting isn't a chase");
  assert.ok(chaseIntensity([far], player) < chaseIntensity([near, far], player));
  assert.equal(chaseIntensity([{ ...far, x: CHASE_RANGE + 1 }], player), 0);
  assert.ok(heartRate(1) > 140 && heartRate(0) < 70);
});

test("a hunt ends in a lunge: one short surge when it gets close, then not again for a while", async () => {
  const { lungeScale, LUNGE } = await import("../src/game/sighting.js");
  const e = { id: 9, def, state: "hunt" };
  assert.equal(lungeScale(e, 10, 0), 1, "too far to lunge");
  assert.equal(lungeScale(e, 2, 1), LUNGE.burst);
  assert.equal(lungeScale(e, 2, 1 + LUNGE.lasts / 2), LUNGE.burst, "the surge lasts a moment");
  assert.equal(lungeScale(e, 2, 1 + LUNGE.lasts + 0.1), 1, "then it's spent");
  assert.equal(lungeScale(e, 2, 1 + LUNGE.every + 0.1), LUNGE.burst, "and comes again later");
  assert.equal(lungeScale({ id: 10, def, state: "wander" }, 1, 0), 1, "nothing lunges unless it's hunting");
});
