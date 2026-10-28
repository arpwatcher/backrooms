import { test } from "node:test";
import assert from "node:assert/strict";
import { stepLucidity, stageOf, LUCIDITY } from "../src/game/lucidity.js";
import { createFlashlight, toggleFlashlight, stepFlashlight, beamStrength, LOW, interference, INTERFERENCE_RANGE } from "../src/game/flashlight.js";
import { createRun, levelSeed, descend, checkpointFor, drinkAlmondWater } from "../src/game/run.js";
import { createPlayer } from "../src/game/player.js";

test("the dark drains lucidity and working lights give it back", () => {
  let dark = 1;
  let lit = 0.5;
  for (let i = 0; i < 50; i++) {
    dark = stepLucidity(dark, { light: "dark" }, 1);
    lit = stepLucidity(lit, { light: "lit" }, 1);
  }
  assert.ok(Math.abs(dark - (1 - LUCIDITY.darkDrain * 50)) < 1e-9);
  assert.ok(lit > 0.5);
});

test("a flashlight only slows the drain, it doesn't stop it", () => {
  const dim = stepLucidity(1, { light: "dim" }, 10);
  const dark = stepLucidity(1, { light: "dark" }, 10);
  assert.ok(dim < 1 && dim > dark);
});

test("something close drains far faster than something far away", () => {
  const near = stepLucidity(0.5, { light: "lit", presences: [{ distance: 2 }] }, 1);
  const far = stepLucidity(0.5, { light: "lit", presences: [{ distance: 11 }] }, 1);
  const none = stepLucidity(0.5, { light: "lit", presences: [{ distance: 20 }] }, 1);
  assert.ok(near < far && far < none);
});

test("lucidity stays between 0 and 1 and has named stages", () => {
  assert.equal(stepLucidity(0.01, { light: "dark", presences: [{ distance: 0 }] }, 100), 0);
  assert.equal(stepLucidity(0.99, { light: "lit" }, 100), 1);
  assert.equal(stageOf(1), "lucid");
  assert.equal(stageOf(0.5), "uneasy");
  assert.equal(stageOf(0.2), "slipping");
  assert.equal(stageOf(0.05), "gone");
});

test("the flashlight drains its battery and dies, and can't turn on empty", () => {
  const light = toggleFlashlight(createFlashlight());
  assert.equal(light.on, true);
  for (let i = 0; i < 300; i++) stepFlashlight(light, 1);
  assert.equal(light.battery, 0);
  assert.equal(light.on, false);
  toggleFlashlight(light);
  assert.equal(light.on, false);
});

test("a low battery browns the beam out", () => {
  const light = toggleFlashlight(createFlashlight());
  assert.equal(beamStrength(light, 0), 1);
  light.battery = LOW / 2;
  assert.ok(beamStrength(light, 0.1) < 1);
  light.on = false;
  assert.equal(beamStrength(light, 0), 0);
});

test("something hunting close by makes a full beam stutter, more the closer it is", () => {
  const light = toggleFlashlight(createFlashlight());
  const dark = (near) => {
    let n = 0;
    for (let t = 0; t < 60; t += 0.01) if (beamStrength(light, t, near) < 0.5) n++;
    return n;
  };
  assert.equal(dark(0), 0, "nothing near: a steady beam");
  assert.ok(dark(0.3) > 0, "something near: it drops out now and then");
  assert.ok(dark(0.9) > dark(0.3) * 1.5, "closer: it drops out much more");
});

test("only things hunting you, and only within range, interfere", () => {
  assert.equal(interference([{ x: 3, z: 0, hunting: false }], 0, 0), 0);
  assert.equal(interference([{ x: INTERFERENCE_RANGE + 1, z: 0, hunting: true }], 0, 0), 0);
  assert.ok(Math.abs(interference([{ x: INTERFERENCE_RANGE / 2, z: 0, hunting: true }], 0, 0) - 0.5) < 1e-9);
  assert.equal(interference([], 0, 0), 0);
});

test("each level has its own seed, chained from the run", () => {
  const run = createRun("abc");
  assert.equal(levelSeed(run), "abc/L0");
  descend(run);
  assert.equal(levelSeed(run), "abc/L1");
  assert.notEqual(levelSeed(run, 1), levelSeed(run, 2));
});

test("checkpoints every five levels", () => {
  assert.equal(checkpointFor(0), 0);
  assert.equal(checkpointFor(4), 0);
  assert.equal(checkpointFor(5), 5);
  assert.equal(checkpointFor(13), 10);
});

test("almond water restores lucidity and is used up", () => {
  const run = createRun("x");
  const player = createPlayer(0, 0);
  player.lucidity = 0.3;
  assert.equal(drinkAlmondWater(run, player), false);
  run.inventory.almondWater = 1;
  assert.equal(drinkAlmondWater(run, player), true);
  assert.ok(Math.abs(player.lucidity - 0.65) < 1e-9);
  assert.equal(run.inventory.almondWater, 0);
});
