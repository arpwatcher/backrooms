import { test } from "node:test";
import assert from "node:assert/strict";
import { itemKinds, batteryChance } from "../src/game/items.js";
import { recharge, createFlashlight } from "../src/game/flashlight.js";
import { BATTERY_CHARGE } from "../src/game/items.js";
import { Rng } from "../src/core/rng.js";

test("every level with items has at least one almond water", () => {
  for (let i = 0; i < 200; i++) {
    const kinds = itemKinds(4, 3, new Rng(`k${i}`));
    assert.equal(kinds.length, 4);
    assert.ok(kinds.includes("almondWater"));
  }
  assert.deepEqual(itemKinds(0, 3, new Rng("none")), []);
});

test("batteries turn up, less often deeper down, but never vanish", () => {
  assert.ok(batteryChance(1) > batteryChance(20));
  assert.ok(batteryChance(500) >= 0.12);
  let batteries = 0;
  for (let i = 0; i < 100; i++) batteries += itemKinds(4, 2, new Rng(`b${i}`)).filter((k) => k === "battery").length;
  assert.ok(batteries > 60 && batteries < 200, `${batteries} of 400`);
});

test("a battery tops the flashlight up, never past full", () => {
  const light = createFlashlight();
  light.battery = 0.1;
  recharge(light, BATTERY_CHARGE);
  assert.ok(Math.abs(light.battery - 0.7) < 1e-9);
  recharge(light, BATTERY_CHARGE);
  assert.equal(light.battery, 1);
});
