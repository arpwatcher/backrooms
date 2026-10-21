import { test } from "node:test";
import assert from "node:assert/strict";
import { generateEntity, SENSES, MOVEMENT } from "../src/entities/generator.js";
import { Rng } from "../src/core/rng.js";

test("the same seed always generates the same entity", () => {
  assert.deepEqual(generateEntity(new Rng("gen")), generateEntity(new Rng("gen")));
  assert.notDeepEqual(generateEntity(new Rng("gen-a")), generateEntity(new Rng("gen-b")));
});

test("a generated card is always solvable: the counter matches what it senses", () => {
  for (let i = 0; i < 300; i++) {
    const e = generateEntity(new Rng(`g${i}`));
    const sense = SENSES.find((s) => s.id === e.sense);
    assert.equal(e.counter, sense.counter);
    assert.ok(e.rule.startsWith(sense.rule));
    assert.ok(!/[.;]\s/.test(e.rule), `one sentence: ${e.rule}`);
    assert.ok(e.tell.length > 20 && e.name.startsWith("The "));
    assert.ok(e.threat >= 0.5 && e.threat <= 2.5, `${e.threat}`);
  }
});

test("nonsense pairings never come out", () => {
  for (let i = 0; i < 500; i++) {
    const e = generateEntity(new Rng(`p${i}`));
    assert.ok(!(e.movement === "ceiling" && e.sense === "height"));
    assert.ok(!(e.movement === "blink" && e.sense === "gaze"));
    assert.ok(!(e.movement === "drift" && e.sense === "motion"));
    assert.ok(MOVEMENT.some((m) => m.id === e.movement));
  }
});

test("the tables are big enough to rarely repeat", () => {
  const names = new Set();
  const combos = new Set();
  for (let i = 0; i < 200; i++) {
    const e = generateEntity(new Rng(`r${i}`));
    names.add(e.name);
    combos.add(`${e.sense}|${e.movement}|${e.body}`);
  }
  assert.ok(names.size > 150, `${names.size} names`);
  assert.ok(combos.size > 180, `${combos.size} combos`);
});
