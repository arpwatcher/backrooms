import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLayout } from "../src/world/layout.js";
import { createPathfinder } from "../src/world/path.js";
import { lineOfSight } from "../src/world/sight.js";
import { CELL } from "../src/world/units.js";
import { Rng } from "../src/core/rng.js";
import { contact, spawn } from "../src/entities/core.js";
import { smiler } from "../src/entities/smiler.js";
import { hounds } from "../src/entities/hounds.js";

function open(width = 12, height = 12) {
  return generateLayout({ seed: "arena", width, height, wallRuns: 0, rooms: 0, pillarChance: 0 });
}
const c = (n) => (n + 0.5) * CELL;

function senseFor(layout, player, { light = () => "dark", beam = () => false, time = 0 } = {}) {
  return {
    player: { noise: 0, running: false, crouching: false, ...player },
    lightAt: light,
    beamOn: beam,
    canSee: (e, range) => Math.hypot(e.x - player.x, e.z - player.z) <= range && lineOfSight(layout, e.x, e.z, player.x, player.z),
    paths: createPathfinder(layout),
    time,
  };
}

function run(def, entity, sense, seconds, dt = 0.05) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    sense.time += dt;
    events.push(...def.update(entity, sense, dt));
  }
  return events;
}

test("first contact marks you, the second with the same thing kills", () => {
  const marks = new Set();
  assert.deepEqual(contact(marks, "smiler"), { fatal: false, first: true });
  assert.deepEqual(contact(marks, "hounds"), { fatal: false, first: true });
  assert.deepEqual(contact(marks, "smiler"), { fatal: true, first: false });
});

test("the smiler closes in while you stand in the dark", () => {
  const layout = open();
  const e = spawn(smiler, { x: 8, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) });
  const before = Math.abs(e.x - c(2));
  const events = run(smiler, e, sense, 2);
  assert.ok(Math.abs(e.x - c(2)) < before - 2);
  assert.ok(events.some((ev) => ev.type === "sound" && ev.sound === "teeth"), "you hear it first");
});

test("the smiler does not move while you stand in the light", () => {
  const layout = open();
  const e = spawn(smiler, { x: 8, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) }, { light: (x) => (x < c(4) ? "lit" : "dark") });
  const startX = e.x;
  run(smiler, e, sense, 3);
  assert.ok(Math.abs(e.x - startX) < 0.01);
});

test("a flashlight on the smiler pushes it back and costs battery", () => {
  const layout = open();
  const e = spawn(smiler, { x: 6, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) }, { beam: () => true });
  const startX = e.x;
  const events = run(smiler, e, sense, 1);
  assert.ok(e.x > startX + 1);
  assert.ok(events.some((ev) => ev.type === "drain" && ev.what === "battery"));
});

test("a smiler that reaches you in the dark makes contact", () => {
  const layout = open();
  const e = spawn(smiler, { x: 4, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) });
  const events = run(smiler, e, sense, 5);
  assert.ok(events.some((ev) => ev.type === "contact"));
});

test("hounds hear a runner from far away but not a crouching player", () => {
  const e = spawn(hounds, { x: 9, y: 2 });
  const far = { x: c(2), z: c(2), noise: 1, running: true };
  assert.equal(hounds.heard(e, { player: far }), true);
  assert.equal(hounds.heard(e, { player: { ...far, running: false, crouching: true, noise: 0.15 } }), false);
  assert.equal(hounds.heard(e, { player: { ...far, running: false, noise: 0 } }), false);
});

test("hounds run to where they heard you, then lose you if you go quiet", () => {
  const layout = open(20, 12);
  // 7 cells = 16.8 m: inside a sprint's 20 m, outside a walk's 9 m
  const e = spawn(hounds, { x: 10, y: 5 }, { rng: new Rng(1) });
  const sense = senseFor(layout, { x: c(3), z: c(5), noise: 1, running: true });
  const player = sense.player;
  run(hounds, e, sense, 0.1);
  assert.equal(e.state, "hunt");
  // the player stops dead and slips a few cells away
  player.noise = 0;
  player.running = false;
  player.z = c(10);
  run(hounds, e, sense, 8);
  assert.notEqual(e.state, "hunt");
  assert.ok(Math.hypot(e.x - player.x, e.z - player.z) > 2, "it lost you");
});

test("a hound that catches a noisy player makes contact", () => {
  const layout = open(14, 8);
  // 3 cells = 7.2 m, inside walking earshot
  const e = spawn(hounds, { x: 6, y: 3 }, { rng: new Rng(2) });
  const sense = senseFor(layout, { x: c(3), z: c(3), noise: 0.45 });
  const events = run(hounds, e, sense, 6);
  assert.ok(events.some((ev) => ev.type === "contact"));
  assert.ok(events.some((ev) => ev.sound === "panting"), "the panting comes first");
});

test("idle hounds wander instead of standing still", () => {
  const layout = open();
  const e = spawn(hounds, { x: 6, y: 6 }, { rng: new Rng(5) });
  const sense = senseFor(layout, { x: c(0), z: c(0), noise: 0 });
  const start = { x: e.x, z: e.z };
  run(hounds, e, sense, 6);
  assert.ok(Math.hypot(e.x - start.x, e.z - start.z) > 1);
});
