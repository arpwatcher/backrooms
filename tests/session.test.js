import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoopback } from "../src/net/loopback.js";
import { createHost, createPeer } from "../src/net/session.js";
import { buildLevel } from "../src/game/build.js";
import { TIERS } from "../src/game/director.js";
import { Rng } from "../src/core/rng.js";

function room({ drop = 0, delay = 1 } = {}) {
  const rng = new Rng("net");
  const net = createLoopback({ drop, delay, rng: () => rng.next() });
  const host = createHost(net.endpoint("host"), { seed: "coop-run", depth: 4, tier: "uneasy" });
  const a = createPeer(net.endpoint("a"), { host: "host", name: "a" });
  const b = createPeer(net.endpoint("b"), { host: "host", name: "b" });
  return { net, host, a, b };
}

const settle = (net, n = 5) => { for (let i = 0; i < n; i++) net.pump(); };

test("both peers are told the same run, and build the same level from it", () => {
  const { net, a, b } = room();
  settle(net);
  const run = (s) => ({ seed: s.seed, depth: s.depth, tier: s.tier });
  assert.deepEqual(run(a.state.start), run(b.state.start));
  const { seed, depth, tier } = a.state.start;
  const one = buildLevel(seed, depth, TIERS[tier]);
  const two = buildLevel(b.state.start.seed, b.state.start.depth, TIERS[b.state.start.tier]);
  assert.equal(JSON.stringify(one.layout), JSON.stringify(two.layout));
  assert.deepEqual(one.plan.roster.map((d) => d.id), two.plan.roster.map((d) => d.id));
});

test("a peer from another build is not let in", () => {
  const net = createLoopback();
  const host = createHost(net.endpoint("host"), { seed: "s", depth: 1, tier: "uneasy", build: "v2" });
  const old = createPeer(net.endpoint("old"), { host: "host", name: "old", build: "v1" });
  settle(net);
  assert.equal(host.peers.size, 0);
  assert.equal(old.state.start, null);
});

test("the host keeps each peer's newest input, even if they arrive out of order", () => {
  const { net, host, a } = room({ delay: 1 });
  settle(net);
  a.sendInput(2, { forward: 1 });
  a.sendInput(1, { forward: -1 });
  settle(net);
  assert.equal(host.inputOf("a").t, 2);
  assert.equal(host.inputOf("a").forward, 1);
});

test("with a third of the snapshots lost, both peers still converge on the host's world", () => {
  const { net, host, a, b } = room({ drop: 0.33 });
  settle(net);
  const entity = { id: 1, x: 10, z: 10, facing: 0, state: "wander" };
  const player = { id: "host", x: 5, z: 5, yaw: 0, noise: 0 };
  for (let frame = 0; frame < 120; frame++) {
    const t = frame / 30;
    entity.x = 10 + t;
    entity.state = t > 2 ? "chase" : "wander";
    host.tick(t, [player], [entity]);
    net.pump();
  }
  settle(net);
  for (const peer of [a, b]) {
    const seen = peer.state.view.entities[0];
    assert.ok(Math.abs(seen.x - entity.x) < 0.3, `${seen.x} vs ${entity.x}`);
    assert.equal(seen.state, "chase");
  }
});

test("each peer is told which player it is, and a new level moves everyone", () => {
  const { net, host, a, b } = room();
  settle(net);
  assert.equal(a.state.start.you, "a");
  assert.equal(b.state.start.you, "b");
  host.tick(1, [{ id: "host", x: 1, z: 1, yaw: 0 }], []);
  settle(net);
  assert.ok(a.state.view);
  host.restart(5);
  settle(net);
  assert.equal(a.state.start.depth, 5);
  assert.equal(b.state.start.depth, 5);
  assert.equal(a.state.view, null, "the old level's snapshot is dropped");
});

test("events from the host reach the peer in order", () => {
  const { net, host, a } = room();
  settle(net);
  host.send("a", { type: "event", kind: "contact", entity: "hounds", fatal: false });
  host.send("a", { type: "event", kind: "contact", entity: "hounds", fatal: true });
  settle(net);
  assert.deepEqual(a.state.events.map((e) => e.fatal), [false, true]);
});
