import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.js";
import {
  planLevel, budgetFor, TIERS, createTension, stepTension, noteContact, inMercy, synergyOf, paceFor, PACE,
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

test("pacing: peaks before checkpoints, a breather after two crowded levels, sometimes silence", () => {
  const rng = () => new Rng("pace");
  assert.equal(paceFor(2, [], rng()).kind, "normal", "nothing fancy early on");
  assert.equal(paceFor(9, [], rng()).kind, "peak");
  assert.equal(paceFor(14, [], rng()).kind, "peak");
  const crowd = { roster: ["a", "b"], pace: "normal" };
  const kinds = new Set();
  for (let i = 0; i < 40; i++) kinds.add(paceFor(7, [crowd, crowd], new Rng(`b${i}`)).kind);
  assert.ok(kinds.has("breather") && !kinds.has("normal"), [...kinds].join());
  for (let i = 0; i < 40; i++) {
    assert.notEqual(paceFor(7, [crowd, { ...crowd, pace: "breather" }], new Rng(`n${i}`)).kind, "breather", "no breather after a breather");
  }
  let silent = 0;
  const calm = { roster: ["a"], pace: "normal" };
  for (let i = 0; i < 1200; i++) if (paceFor(7, [calm, calm], new Rng(`s${i}`)).kind === "silence") silent++;
  assert.ok(silent > 50 && silent < 160, `${silent} silent of 1200`);
});

test("a silent level has nobody in it, and a peak has more than a breather", () => {
  const pool = [fake("a", 1, 1), fake("b", 1, 1), fake("c", 1, 1), fake("d", 1, 1), fake("f", 1, 1)];
  assert.equal(planLevel({ depth: 8, rng: new Rng("x"), pool, scale: 0 }).roster.length, 0);
  let peak = 0;
  let breather = 0;
  for (let i = 0; i < 50; i++) {
    peak += planLevel({ depth: 8, rng: new Rng(`p${i}`), pool, scale: PACE.peak }).roster.length;
    breather += planLevel({ depth: 8, rng: new Rng(`p${i}`), pool, scale: PACE.breather }).roster.length;
  }
  assert.ok(peak > breather, `peak ${peak} vs breather ${breather}`);
});

test("a conflicting pair never shares a level, except on noclip", () => {
  const pool = [fake("hushbaby", 1, 1), fake("hounds", 1, 1), fake("x", 1, 1)];
  let together = 0;
  for (let i = 0; i < 200; i++) {
    const ids = planLevel({ depth: 9, rng: new Rng(`c${i}`), pool, tier: TIERS.lost }).roster.map((d) => d.id);
    assert.ok(!(ids.includes("hushbaby") && ids.includes("hounds")), ids.join());
    const hard = planLevel({ depth: 9, rng: new Rng(`c${i}`), pool, tier: TIERS.noclip }).roster.map((d) => d.id);
    if (hard.includes("hushbaby") && hard.includes("hounds")) together++;
  }
  assert.ok(together > 0, "noclip asked for it");
});

test("harder tiers lean in harder, but nothing is ever sped up past a fair tell", () => {
  const order = [TIERS.lucid, TIERS.uneasy, TIERS.lost, TIERS.noclip];
  for (let i = 1; i < order.length; i++) assert.ok(order[i].drift > order[i - 1].drift);
  for (const tier of order) assert.ok(tier.pace <= 1, `${tier.name} pace ${tier.pace}`);
  assert.ok(TIERS.lucid.pace < 1, "the easiest tier is a little slower");
});
