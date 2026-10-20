import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng, hashString } from "../src/core/rng.js";

test("the same seed gives the same sequence", () => {
  const a = new Rng("level-12");
  const b = new Rng("level-12");
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
});

test("different seeds diverge", () => {
  assert.notEqual(new Rng("a").next(), new Rng("b").next());
  assert.notEqual(hashString("a"), hashString("b"));
});

test("int stays inside its bounds and reaches both ends", () => {
  const rng = new Rng(7);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const value = rng.int(1, 4);
    assert.ok(value >= 1 && value <= 4);
    seen.add(value);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test("weighted pick follows the weights", () => {
  const rng = new Rng(3);
  let heavy = 0;
  for (let i = 0; i < 4000; i++) if (rng.weighted([["heavy", 9], ["light", 1]]) === "heavy") heavy++;
  assert.ok(heavy > 3400 && heavy < 3800, `heavy picked ${heavy} times`);
});

test("shuffle keeps every item and does not touch the input", () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = new Rng(9).shuffle(input);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

test("forked streams are independent of each other and of later calls", () => {
  const root = new Rng("run");
  const layout = root.fork("layout").next();
  const again = new Rng("run").fork("layout").next();
  assert.equal(layout, again);
  assert.notEqual(new Rng("run").fork("layout").next(), new Rng("run").fork("entities").next());
});

test("pick from an empty list is an error, not undefined", () => {
  assert.throws(() => new Rng(1).pick([]), /empty/);
});
