import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMilestones, checkMilestones, MILESTONES } from "../src/game/milestones.js";

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}
const left = (extra) => ({ type: "left", depth: 3, touchesThisRun: 1, pace: "normal", roster: [], enteredParty: false, ...extra });

test("each milestone is earned once, by the event it describes, and remembered", () => {
  const store = memory();
  const earned = loadMilestones(store);
  assert.deepEqual(checkMilestones(earned, { type: "survived" }, store).map((m) => m.id), ["first-contact"]);
  assert.deepEqual(checkMilestones(earned, { type: "survived" }, store), [], "only once");
  assert.deepEqual(checkMilestones(earned, left({ depth: 9, touchesThisRun: 0 }), store).map((m) => m.id), ["clean-nine"]);
  assert.deepEqual(checkMilestones(earned, left({ depth: 24 }), store).map((m) => m.id), ["depth-25"]);
  assert.deepEqual(checkMilestones(earned, left({ pace: "silence" }), store).map((m) => m.id), ["silent"]);
  assert.deepEqual(checkMilestones(earned, left({ roster: ["partygoers"], enteredParty: true }), store), []);
  assert.deepEqual(checkMilestones(earned, left({ roster: ["partygoers"] }), store).map((m) => m.id), ["party"]);
  assert.deepEqual(checkMilestones(earned, { type: "task", roster: ["hounds"] }, store), []);
  assert.deepEqual(checkMilestones(earned, { type: "task", roster: ["smiler"] }, store).map((m) => m.id), ["power-smiler"]);
  assert.deepEqual(checkMilestones(earned, { type: "met", known: 9, total: 10 }, store), []);
  assert.deepEqual(checkMilestones(earned, { type: "met", known: 10, total: 10 }, store).map((m) => m.id), ["met-all"]);
  assert.deepEqual(checkMilestones(earned, { type: "ending" }, store).map((m) => m.id), ["out"]);
  assert.equal(loadMilestones(store).size, MILESTONES.length);
});

test("being touched before level 9 rules out the clean run", () => {
  const earned = loadMilestones(memory());
  assert.deepEqual(checkMilestones(earned, left({ depth: 9, touchesThisRun: 2 }), memory()), []);
});

test("unknown or broken saved milestones are dropped", () => {
  const store = memory();
  store.setItem("noclip.milestones.v1", JSON.stringify(["silent", "made-up"]));
  assert.deepEqual([...loadMilestones(store)], ["silent"]);
  const broken = memory();
  broken.setItem("noclip.milestones.v1", "{");
  assert.equal(loadMilestones(broken).size, 0);
});
