import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRecords, recordDepth, describeRecords } from "../src/game/records.js";

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test("only a deeper level is a new record, per tier, and it survives a reload", () => {
  const store = memory();
  const records = loadRecords(store);
  assert.equal(recordDepth(records, "uneasy", 3, store), true);
  assert.equal(recordDepth(records, "uneasy", 2, store), false);
  assert.equal(recordDepth(records, "uneasy", 3, store), false);
  assert.equal(recordDepth(records, "noclip", 1, store), true);
  assert.deepEqual(loadRecords(store), { uneasy: 3, noclip: 1 });
});

test("the title line lists tiers in order and says nothing when there's nothing", () => {
  assert.equal(describeRecords({}), "");
  assert.equal(describeRecords({ noclip: 2, lucid: 7 }), "deepest: lucid 7 · noclip 2");
});

test("junk in storage is ignored", () => {
  const store = memory();
  store.setItem("noclip.records.v1", JSON.stringify({ uneasy: "deep", lost: -4, lucid: 5 }));
  assert.deepEqual(loadRecords(store), { lucid: 5 });
  const broken = memory();
  broken.setItem("noclip.records.v1", "nope{");
  assert.deepEqual(loadRecords(broken), {});
});
