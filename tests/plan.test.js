import { test } from "node:test";
import assert from "node:assert/strict";
import { levelPlan } from "../src/game/plan.js";
import { TIERS } from "../src/game/director.js";

const summary = (p) => `${p.archetype.id}|${p.roster.map((e) => e.id).join()}|${p.shift?.id}|${p.task?.id}`;

test("plans hold the run's shape: a quiet lobby first, no place twice in a row", () => {
  const first = levelPlan("shape", 0);
  assert.equal(first.archetype.id, "lobby");
  assert.equal(first.roster.length, 0);
  assert.equal(first.shift, null);
  assert.equal(first.task, null);
  for (let d = 1; d < 30; d++) assert.notEqual(levelPlan("shape", d).archetype.id, levelPlan("shape", d - 1).archetype.id);
});

test("same seed, same plans; another seed, other plans", () => {
  const a = Array.from({ length: 15 }, (_, d) => summary(levelPlan("same", d)));
  const b = Array.from({ length: 15 }, (_, d) => summary(levelPlan("same", d)));
  const c = Array.from({ length: 15 }, (_, d) => summary(levelPlan("other", d)));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("tiers plan separately: the hardest tier never meets fewer things", () => {
  let easy = 0;
  let hard = 0;
  for (let d = 0; d < 30; d++) {
    easy += levelPlan("tiers", d, TIERS.lucid).roster.length;
    hard += levelPlan("tiers", d, TIERS.noclip).roster.length;
  }
  assert.ok(hard > easy, `noclip ${hard} vs lucid ${easy}`);
});

test("every entity still debuts alone on its own level, whatever the pacing", async () => {
  const { ENTITIES } = await import("../src/entities/index.js");
  for (const seed of ["debut-a", "debut-b", "debut-c"]) {
    for (const def of ENTITIES) {
      const p = levelPlan(seed, def.minDepth);
      assert.deepEqual(p.roster.map((e) => e.id), [def.id], `${seed} level ${def.minDepth}`);
    }
  }
});

test("some deep levels are silent, and silent levels are empty", () => {
  let silent = 0;
  for (let d = 7; d < 120; d++) {
    const p = levelPlan("quiet-run", d);
    if (p.pace === "silence") {
      silent++;
      assert.equal(p.roster.length, 0);
    }
  }
  assert.ok(silent >= 2, `${silent} silent levels`);
});
