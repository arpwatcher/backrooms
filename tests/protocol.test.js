import { test } from "node:test";
import assert from "node:assert/strict";
import { quantize, unquantize, packAngle, unpackAngle, snapshot, readSnapshot, parse, hello, start, SPAN } from "../src/net/protocol.js";

test("positions survive the trip to 16 bits within a couple of millimetres", () => {
  for (const m of [0, 1.2, 37.4, 76.8, SPAN]) assert.ok(Math.abs(unquantize(quantize(m)) - m) < 0.002, `${m}`);
  assert.equal(quantize(-5), 0, "clamped, never negative");
  assert.equal(quantize(SPAN * 2), 65535);
});

test("angles survive too, wrapped into -pi..pi", () => {
  for (const a of [0, 1, -1, 3, -3, 7]) {
    const back = unpackAngle(packAngle(a));
    const diff = Math.atan2(Math.sin(back - a), Math.cos(back - a));
    assert.ok(Math.abs(diff) < 0.001, `${a} -> ${back}`);
  }
});

test("a snapshot round-trips through json", () => {
  const players = [{ id: "p1", x: 10.5, z: 3.25, yaw: 1.2, noise: 0.45, echo: null }];
  const entities = [{ id: 7, x: 30, z: 41.6, facing: -2, state: "chase" }];
  const back = readSnapshot(parse(JSON.stringify(snapshot(12.5, players, entities))));
  assert.equal(back.t, 12.5);
  assert.ok(Math.abs(back.players[0].x - 10.5) < 0.002 && back.players[0].noise === 0.45 && back.players[0].echo === false);
  assert.equal(back.entities[0].state, "chase");
  assert.ok(Math.abs(back.entities[0].z - 41.6) < 0.002);
});

test("anything malformed or from another version is dropped", () => {
  assert.equal(parse("not json"), null);
  assert.equal(parse({ type: "nope" }), null);
  assert.equal(parse({ type: "start", seed: "x" }), null, "missing fields");
  assert.equal(parse({ ...hello("a", "b"), v: 999 }), null);
  assert.deepEqual(parse(JSON.stringify(start("s", 3, "uneasy"))), start("s", 3, "uneasy"));
});
