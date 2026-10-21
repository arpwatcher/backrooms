import { spawn, distanceTo, moveAlongPath, moveToward, cellAt } from "./core.js";

// A janitor with his back to you, mopping a floor that never gets dry. He
// doesn't hunt. He cleans. Every wet footprint is a mess to be followed and
// mopped up, one after another, all the way to whoever left them. Walk
// around the puddles, or stop and let your shoes dry, and the trail ends.

export const attendant = {
  id: "attendant",
  name: "The Attendant",
  class: "hazard",
  famous: false,
  threat: 1,
  minDepth: 12,
  hunting: (e) => e.state === "follow",
  tell: "a wet mop slapping on carpet, the smell of cleaning fluid, and your own shoes squelching",
  counter: "walk around the puddles, or wait for your shoes to dry - no prints, no trail",
  rule: "it follows every wet footprint you leave",
  lore: "Someone has to clean up after you. He has been doing it for a very long time.",
  speed: 2.6,
  mopSpeed: 0.7,
  reach: 1,
  // he needs a wet floor to work on
  layout: { puddles: true },

  spawn(layout, rng) {
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 12) far.push({ x, y });
      }
    }
    if (far.length === 0) return [];
    return [spawn(attendant, rng.pick(far), { rng: rng.fork("attendant"), followed: -Infinity })];
  },

  update(e, sense, dt) {
    const events = [];
    const toPlayer = distanceTo(e, sense.player);
    if (toPlayer < 18 && (e.memory.slapAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "mop", x: e.x, z: e.z, volume: e.state === "follow" ? 1 : 0.6 });
      e.memory.slapAt = sense.time + (e.state === "follow" ? 1.2 : 2.2);
    }
    // the oldest print he hasn't mopped yet: he cleans the trail in order
    const next = (sense.prints ?? []).filter((p) => p.t > e.followed).sort((a, b) => a.t - b.t)[0];
    if (next) {
      e.state = "follow";
      if (moveAlongPath(e, { x: next.x, y: next.y }, attendant.speed, dt, sense.paths)) e.followed = next.t;
      // at the end of a fresh trail stands the person who made it
      const here = cellAt(e.x, e.z);
      const there = cellAt(sense.player.x, sense.player.z);
      if (Math.abs(here.x - there.x) + Math.abs(here.y - there.y) <= 1) moveToward(e, sense.player, attendant.speed, dt);
      if (distanceTo(e, sense.player) < attendant.reach) events.push({ type: "contact" });
      return events;
    }
    e.state = "mop";
    if (!e.goal || moveAlongPath(e, e.goal, attendant.mopSpeed, dt, sense.paths)) {
      e.goal = sense.paths.wander(cellAt(e.x, e.z), e.rng, e.from);
    }
    return events;
  },
};
