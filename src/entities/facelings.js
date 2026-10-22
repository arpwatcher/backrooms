import { spawn, distanceTo, moveAlongPath, moveToward, cellAt } from "./core.js";

// People. Office clothes, ordinary hands, and where the face should be,
// nothing - smooth skin. They wander and mind their own business. The one
// thing they cannot stand is being looked at: keep your eyes on that blank
// face for a few seconds and it notices, and it does not like it.

export const STARE_LIMIT = 3;   // seconds of looking before it turns on you
export const STARE_RANGE = 10;  // further than this it can't tell you're looking

export const facelings = {
  id: "facelings",
  name: "Facelings",
  class: "watcher",
  famous: true,
  threat: 0.75,
  minDepth: 4,
  hunting: (e) => e.state === "offended",
  tell: "a person standing too still at the edge of a room, and no face",
  counter: "look away - pass them with your eyes on the floor, and they leave you alone",
  rule: "they do nothing unless you look them in the face for more than three seconds",
  lore: "They were people once, or they are trying to be. Either way, they hate being stared at.",
  speed: 3.6,
  wanderSpeed: 0.8,
  reach: 0.9,

  spawn(layout, rng) {
    const cells = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 8) cells.push({ x, y });
      }
    }
    if (cells.length === 0) return [];
    const count = rng.int(3, 5);
    return rng.shuffle(cells).slice(0, count).map((cell, i) => spawn(facelings, cell, { rng: rng.fork(`face-${i}`), stare: 0 }));
  },

  update(e, sense, dt) {
    const events = [];
    const toPlayer = distanceTo(e, sense.player);
    if (e.state === "offended") {
      // it gives up once you have been out of its sight for a while
      if (sense.canSee(e, 30)) e.memory.lostAt = sense.time + 4;
      if (sense.time > (e.memory.lostAt ?? 0)) {
        e.state = "wander";
        e.stare = 0;
        return events;
      }
      const goal = cellAt(sense.player.x, sense.player.z);
      const here = cellAt(e.x, e.z);
      if (here.x === goal.x && here.y === goal.y) moveToward(e, sense.player, facelings.speed, dt);
      else moveAlongPath(e, goal, facelings.speed, dt, sense.paths);
      if (distanceTo(e, sense.player) < facelings.reach) events.push({ type: "contact" });
      return events;
    }
    const looked = toPlayer < STARE_RANGE && sense.watching(e.x, e.z);
    e.stare = looked ? e.stare + dt : Math.max(0, e.stare - dt * 0.5);
    if (looked) {
      // it stops and turns its blank face to you; past halfway it starts to whine
      e.state = "noticed";
      e.facing = Math.atan2(sense.player.x - e.x, sense.player.z - e.z);
      if (e.stare > STARE_LIMIT / 2 && (e.memory.whineAt ?? 0) <= sense.time) {
        events.push({ type: "sound", sound: "whine", x: e.x, z: e.z, volume: e.stare / STARE_LIMIT });
        e.memory.whineAt = sense.time + 0.5;
      }
      if (e.stare >= STARE_LIMIT) {
        e.state = "offended";
        e.memory.lostAt = sense.time + 4;
      }
      return events;
    }
    e.state = "wander";
    if (!e.goal || moveAlongPath(e, e.goal, facelings.wanderSpeed, dt, sense.paths)) {
      e.goal = sense.paths.wander(cellAt(e.x, e.z), e.rng, e.from);
    }
    return events;
  },
};
