import { test } from "node:test";
import assert from "node:assert/strict";
import { createBuffer, push, sample, BEHIND } from "../src/net/interpolate.js";

const snap = (t, x, yaw = 0) => ({ t, players: [{ id: "a", x, z: 0, yaw }], entities: [{ id: 1, x: x * 2, z: 0, facing: yaw }] });

test("between two snapshots, positions blend smoothly", () => {
  const b = createBuffer();
  push(b, snap(0, 0));
  push(b, snap(1, 10));
  const s = sample(b, 0.5 + BEHIND);
  assert.ok(Math.abs(s.players[0].x - 5) < 1e-9);
  assert.ok(Math.abs(s.entities[0].x - 10) < 1e-9);
});

test("angles turn the short way round", () => {
  const b = createBuffer();
  push(b, snap(0, 0, 3.0));
  push(b, snap(1, 0, -3.0));
  const yaw = sample(b, 0.5 + BEHIND).players[0].yaw;
  assert.ok(Math.abs(Math.abs(yaw) - Math.PI) < 0.2, `${yaw} should be near pi, not near 0`);
});

test("a late snapshot slots into place, and past the newest we hold still", () => {
  const b = createBuffer();
  push(b, snap(0, 0));
  push(b, snap(2, 20));
  push(b, snap(1, 4));
  assert.ok(Math.abs(sample(b, 0.5 + BEHIND).players[0].x - 2) < 1e-9, "uses the late one");
  assert.equal(sample(b, 10).players[0].x, 20);
  assert.equal(sample(createBuffer(), 1), null);
});
