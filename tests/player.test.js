import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLayout } from "../src/world/layout.js";
import { moveCircle } from "../src/world/collide.js";
import { CELL } from "../src/world/units.js";
import { createPlayer, stepPlayer, NOISE, WALK_SPEED, RUN_SPEED } from "../src/game/player.js";

function emptyRoom(width = 6, height = 6) {
  const layout = generateLayout({ seed: "empty", width, height, wallRuns: 0, rooms: 0, pillarChance: 0 });
  return layout;
}

test("you cannot walk through the border", () => {
  const layout = emptyRoom();
  let pos = { x: CELL * 0.5, z: CELL * 0.5 };
  for (let i = 0; i < 100; i++) pos = moveCircle(layout, pos.x, pos.z, -0.2, 0, 0.3);
  assert.ok(pos.x >= 0.3 - 1e-9);
});

test("you cannot walk through an inner wall", () => {
  const layout = emptyRoom();
  for (let y = 0; y < layout.height; y++) layout.west[y][3] = true; // full wall at x = 3 cells
  let pos = { x: CELL * 2.5, z: CELL * 2.5 };
  for (let i = 0; i < 100; i++) pos = moveCircle(layout, pos.x, pos.z, 0.2, 0, 0.3);
  assert.ok(pos.x < CELL * 3, `ended at ${pos.x}`);
});

test("you can slide along a wall instead of sticking to it", () => {
  const layout = emptyRoom();
  for (let y = 0; y < layout.height; y++) layout.west[y][3] = true;
  let pos = { x: CELL * 3 - 0.31, z: CELL * 1.5 };
  const startZ = pos.z;
  for (let i = 0; i < 10; i++) pos = moveCircle(layout, pos.x, pos.z, 0.1, 0.1, 0.3);
  assert.ok(pos.z > startZ + 0.9);
});

test("pillars block too", () => {
  const layout = emptyRoom();
  layout.pillars.push({ x: 3, y: 2 });
  let pos = { x: CELL * 1.5, z: CELL * 2.5 };
  for (let i = 0; i < 100; i++) pos = moveCircle(layout, pos.x, pos.z, 0.1, 0, 0.3);
  assert.ok(pos.x < CELL * 3.5 - 0.27, `ended at ${pos.x}`);
});

test("running is faster and louder than walking, crouching quieter", () => {
  const layout = emptyRoom(20, 20);
  const walker = createPlayer(CELL * 2, CELL * 2, Math.PI);
  const runner = createPlayer(CELL * 2, CELL * 2, Math.PI);
  const croucher = createPlayer(CELL * 2, CELL * 2, Math.PI);
  stepPlayer(walker, { forward: true }, 0.5, layout);
  stepPlayer(runner, { forward: true, run: true }, 0.5, layout);
  stepPlayer(croucher, { forward: true, crouch: true }, 0.5, layout);
  const walked = Math.abs(walker.z - CELL * 2);
  const ran = Math.abs(runner.z - CELL * 2);
  assert.ok(Math.abs(walked - WALK_SPEED * 0.5) < 1e-6);
  assert.ok(Math.abs(ran - RUN_SPEED * 0.5) < 1e-6);
  assert.equal(walker.noise, NOISE.walk);
  assert.equal(runner.noise, NOISE.run);
  assert.equal(croucher.noise, NOISE.crouch);
});

test("standing still is silent", () => {
  const player = createPlayer(5, 5);
  stepPlayer(player, {}, 0.1, emptyRoom());
  assert.equal(player.noise, 0);
});

test("running drains stamina until you are exhausted, then you walk until it comes back", () => {
  const layout = emptyRoom(40, 40);
  const player = createPlayer(CELL * 2, CELL * 2, Math.PI);
  let seconds = 0;
  while (!player.exhausted && seconds < 20) {
    stepPlayer(player, { forward: true, run: true }, 0.1, layout);
    seconds += 0.1;
  }
  assert.ok(player.exhausted && seconds > 3 && seconds < 6, `exhausted after ${seconds}s`);
  stepPlayer(player, { forward: true, run: true }, 0.1, layout);
  assert.equal(player.running, false);
  for (let i = 0; i < 40; i++) stepPlayer(player, {}, 0.1, layout);
  assert.equal(player.exhausted, false);
});

test("a level can forbid running (carrying something heavy)", () => {
  const player = createPlayer(CELL * 2, CELL * 2, Math.PI);
  stepPlayer(player, { forward: true, run: true, cannotRun: true }, 0.2, emptyRoom(20, 20));
  assert.equal(player.running, false);
});

test("footsteps are counted by distance, faster when running", () => {
  const layout = emptyRoom(40, 40);
  const player = createPlayer(CELL * 2, CELL * 2, Math.PI);
  let steps = 0;
  for (let i = 0; i < 20; i++) if (stepPlayer(player, { forward: true }, 0.1, layout).stepped) steps++;
  assert.equal(steps, Math.floor((WALK_SPEED * 2) / 1.15));
});

test("humming (V) makes a little noise even standing still", () => {
  const layout = generateLayout({ seed: "hum", width: 6, height: 6, wallRuns: 0, rooms: 0, pillarChance: 0 });
  const player = createPlayer(3, 3);
  stepPlayer(player, { hum: true }, 0.1, layout);
  assert.equal(player.noise, NOISE.hum);
  assert.ok(player.humming);
  stepPlayer(player, {}, 0.1, layout);
  assert.equal(player.noise, NOISE.still);
  stepPlayer(player, { hum: true, forward: true, run: true }, 0.1, layout);
  assert.equal(player.noise, NOISE.run, "running drowns the hum out");
});
