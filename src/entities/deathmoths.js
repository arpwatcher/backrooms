import { spawn, distanceTo, moveToward, moveAlongPath, cellAt } from "./core.js";

// A swarm the size of a coat, pale and papery. They go to the brightest light
// near them, every time. A working panel is brighter than any flashlight, so
// under one you are just a person standing beneath the thing they want. In
// the dark, with your beam on, you are the brightest thing there is.

export const SIGHT = 18;

export const deathmoths = {
  id: "deathmoths",
  name: "Deathmoths",
  class: "stalker",
  famous: true,
  threat: 1,
  minDepth: 5,
  hunting: (e) => e.state === "swarm",
  tell: "a papery fluttering that thickens, and pale dust drifting through your beam",
  counter: "turn your flashlight off, or stand under a working panel - it is brighter than you",
  rule: "they fly to the brightest light near them",
  lore: "They do not want you. They want the light you are holding, and they do not care what is holding it.",
  speed: 3.1,
  reach: 0.9,

  spawn(layout, rng) {
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 14) far.push({ x, y });
      }
    }
    if (far.length === 0) return [];
    return [spawn(deathmoths, rng.pick(far), { rng: rng.fork("drift") })];
  },

  update(e, sense, dt) {
    const events = [];
    const toPlayer = distanceTo(e, sense.player);
    if (toPlayer < 16 && (e.memory.flutterAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "flutter", x: e.x, z: e.z, volume: e.state === "swarm" ? 1 : 0.5 });
      e.memory.flutterAt = sense.time + (e.state === "swarm" ? 0.5 : 1.2);
    }
    const playerLit = sense.lightAt(sense.player.x, sense.player.z) === "lit";
    const beamVisible = sense.flashlightOn && !playerLit && toPlayer < SIGHT && sense.canSee(e, SIGHT);
    if (beamVisible) {
      // a moment to notice the light, then all at once
      e.memory.noticedAt ??= sense.time;
      if (sense.time - e.memory.noticedAt < 1.5) {
        e.state = "notice";
        return events;
      }
      e.state = "swarm";
      e.memory.lastLight = { x: sense.player.x, z: sense.player.z };
      moveToward(e, sense.player, deathmoths.speed, dt);
      if (toPlayer < deathmoths.reach) events.push({ type: "contact" });
      return events;
    }
    e.memory.noticedAt = undefined;
    if (e.memory.lastLight) {
      // fly on to where the light was, then lose interest
      e.state = "search";
      const goal = cellAt(e.memory.lastLight.x, e.memory.lastLight.z);
      if (moveAlongPath(e, goal, deathmoths.speed * 0.6, dt, sense.paths)) e.memory.lastLight = null;
      return events;
    }
    // otherwise drift until they find a working panel and circle under it
    if (sense.lightAt(e.x, e.z) === "lit") {
      e.state = "circle";
      return events;
    }
    e.state = "drift";
    if (!e.goal || moveAlongPath(e, e.goal, 1.2, dt, sense.paths)) {
      e.goal = sense.paths.wander(cellAt(e.x, e.z), e.rng, e.from);
    }
    return events;
  },
};
