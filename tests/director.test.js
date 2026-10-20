import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.js";
import {
  planLevel, budgetFor, TIERS, createTension, stepTension, noteContact, inMercy, synergyOf,
} from "../src/game/director.js";
import { smiler } from "../src/entities/smiler.js";
import { hounds } from "../src/entities/hounds.js";

const fake = (id, threat, minDepth) => ({ id, threat, minDepth });
const pool = [fake("a", 1, 1), fake("b", 1, 1), fake("c", 1.5, 2), fake("d", 0.5, 2), fake("e", 2, 4)];

test("the first level is quiet and the budget grows with depth, scaled by tier", () => {
  assert.equal(budgetFor(0), 0);
  assert.ok(budgetFor(3) > budgetFor(1));
  assert.ok(budgetFor(6, TIERS.noclip) > budgetFor(6, TIERS.lucid));
  assert.equal(planLevel({ depth: 0, rng: new Rng("q"), pool }).roster.length, 0);
});

test("something new is always met alone the first time it can appear", () => {
  for (let i = 0; i < 20; i++) {
    const plan = planLevel({ depth: 4, rng: new Rng(`debut${i}`), pool });
    assert.equal(plan.reason, "debut");
    assert.deepEqual(plan.roster.map((d) => d.id), ["e"]);
  }
});

test("the roster stays inside the budget and never repeats an entity", () => {
  for (let i = 0; i < 50; i++) {
    const plan = planLevel({ depth: 7, rng: new Rng(`mix${i}`), pool });
    const ids = plan.roster.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length);
    const spent = plan.roster.reduce((sum, d) => sum + d.threat, 0);
    assert.ok(spent <= plan.budget + 0.25, `spent ${spent} of ${plan.budget}`);
    assert.ok(plan.roster.length >= 1);
  }
});

test("what you just met is less likely to come straight back", () => {
  let again = 0;
  let fresh = 0;
  const small = [fake("a", 1, 1), fake("b", 1, 1)];
  for (let i = 0; i < 400; i++) {
    const plan = planLevel({ depth: 2, tier: { ...TIERS.uneasy, budget: 0.6 }, rng: new Rng(`v${i}`), pool: small, recent: [["a"]] });
    if (plan.roster[0].id === "a") again++;
    else fresh++;
  }
  assert.ok(fresh > again * 1.5, `fresh ${fresh} vs again ${again}`);
});

test("the smiler and the hounds are a known synergy", () => {
  assert.ok(synergyOf("hounds", "smiler"));
  assert.ok(synergyOf("smiler", "hounds"));
  assert.equal(synergyOf("smiler", "smiler"), null);
  const real = planLevel({ depth: 6, rng: new Rng("real"), pool: [smiler, hounds] });
  assert.equal(real.reason, "synergy");
});

test("tension rises when things close in and hunt, and settles when they leave", () => {
  const t = createTension();
  for (let s = 0; s < 3; s += 0.1) stepTension(t, { nearest: 2, hunting: 2, time: s }, 0.1);
  const high = t.value;
  assert.ok(high > 0.7, `high ${high}`);
  for (let s = 3; s < 20; s += 0.1) stepTension(t, { nearest: Infinity, hunting: 0, time: s }, 0.1);
  assert.ok(t.value < high / 2);
});

test("held at breaking point too long, the director grants mercy, once, for a while", () => {
  const t = createTension();
  let mercyAt = null;
  for (let s = 0; s < 60 && mercyAt === null; s += 0.1) {
    if (stepTension(t, { nearest: 1, hunting: 3, time: s, tier: TIERS.uneasy }, 0.1) === "mercy") mercyAt = s;
  }
  assert.ok(mercyAt !== null && mercyAt >= TIERS.uneasy.mercyAfter, `mercy at ${mercyAt}`);
  assert.ok(inMercy(t, mercyAt + 1));
  assert.equal(stepTension(t, { nearest: 1, hunting: 3, time: mercyAt + 1 }, 0.1), null);
  assert.ok(!inMercy(t, mercyAt + TIERS.uneasy.mercyFor + 0.1));
});

test("two contacts within a minute also earn mercy", () => {
  const t = createTension();
  noteContact(t, 10);
  assert.equal(stepTension(t, { time: 10 }, 0.1), null);
  noteContact(t, 40);
  assert.equal(stepTension(t, { time: 40 }, 0.1), "mercy");
});

test("easier tiers get mercy sooner", () => {
  assert.ok(TIERS.lucid.mercyAfter < TIERS.uneasy.mercyAfter);
  assert.ok(TIERS.uneasy.mercyAfter < TIERS.noclip.mercyAfter);
});
