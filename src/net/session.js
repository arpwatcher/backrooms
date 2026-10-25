// Host and peer for co-op over any transport with send(to, message) and
// onMessage(fn(from, text)). The host is authoritative: it answers hellos with
// the run's seed, keeps every peer's latest input, and sends snapshots of
// players and entities. A peer builds the level from the seed itself and
// keeps the newest snapshot it has seen (older ones that arrive late are
// ignored).

import { parse, hello, start, input as inputMessage, snapshot, readSnapshot } from "./protocol.js";

export const SNAPSHOT_EVERY = 1 / 15;

export function createHost(endpoint, { seed, depth, tier, build = "dev" }) {
  const peers = new Map();
  const run = { seed, depth, tier };
  // things a peer did that the host has to know about (a breaker thrown)
  const events = [];
  let lastSnapshot = -Infinity;
  endpoint.onMessage((from, text) => {
    const m = parse(text);
    if (!m) return;
    if (m.type === "hello") {
      if (m.build !== build) return;
      peers.set(from, { name: m.name, input: null });
      // the start tells each peer the run, and which of the players is them
      endpoint.send(from, { ...start(run.seed, run.depth, run.tier), you: from });
    } else if (m.type === "event" && peers.has(from)) {
      events.push({ ...m, from });
    } else if (m.type === "input" && peers.has(from)) {
      const p = peers.get(from);
      if (!p.input || m.t > p.input.t) p.input = m;
    }
  });
  return {
    peers,
    events,
    inputOf: (name) => peers.get(name)?.input ?? null,
    // a new level (or the checkpoint): everyone goes there together
    restart(depth, tier = run.tier) {
      Object.assign(run, { depth, tier });
      lastSnapshot = -Infinity;
      for (const name of peers.keys()) endpoint.send(name, { ...start(run.seed, run.depth, run.tier), you: name });
    },
    send(name, message) {
      endpoint.send(name, message);
    },
    // call every frame; sends a snapshot fifteen times a second
    tick(t, players, entities) {
      if (t - lastSnapshot < SNAPSHOT_EVERY) return false;
      lastSnapshot = t;
      const s = snapshot(t, players, entities);
      for (const name of peers.keys()) endpoint.send(name, s);
      return true;
    },
  };
}

export function createPeer(endpoint, { host, name, build = "dev" }) {
  const state = { start: null, view: null, events: [] };
  endpoint.onMessage((from, text) => {
    if (from !== host) return;
    const m = parse(text);
    if (!m) return;
    if (m.type === "start") {
      state.start = m;
      // a new level: the old world's snapshots mean nothing now
      state.view = null;
    } else if (m.type === "event") state.events.push(m);
    else if (m.type === "snapshot" && state.start && (!state.view || m.t > state.view.t)) state.view = readSnapshot(m);
  });
  endpoint.send(host, hello(name, build));
  return {
    state,
    sendInput(t, keys) {
      endpoint.send(host, inputMessage(name, t, keys));
    },
    send(message) {
      endpoint.send(host, message);
    },
  };
}
