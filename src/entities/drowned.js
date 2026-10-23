import { spawn, distanceTo, moveAlongPath, moveToward, cellAt } from "./core.js";

// A man in a fisherman's coat who has been under the water for a long
// time. He can't see and he can't hear voices. He feels the water move. While
// you move he comes, as fast as your feet tell him to: a sprint brings him
// at a run, a walk at a wade, a crouch barely at all. Stand still and he
// stops where he is, head down, dripping, waiting for the next ripple.

export const PACE = { run: 4.0, walk: 1.9, crouch: 0.7 };
export const FEELS = 30; // metres: how far away a ripple still reaches him

export const drowned = {
  id: "drowned",
  name: "The Drowned",
  class: "stalker",
  famous: false,
  threat: 1.5,
  minDepth: 6,
  hunting: (e) => e.state === "follow",
  tell: "water dripping where nothing should drip, and a slow wet retch",
  counter: "stand still and he stops - cross the room in short careful moves, crouched, and never sprint toward the exit while he is close",
  rule: "he moves only while you move, and as fast as you do",
  lore: "He went into the poolrooms looking for the way out and didn't come back up. The water brings him wherever it is disturbed.",
  wanderSpeed: 0.5,
  reach: 0.9,
  model: "drowned",

  spawn(layout, rng) {
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 14) far.push({ x, y });
      }
    }
    if (far.length === 0) return [];
    return [spawn(drowned, rng.pick(far), { rng: rng.fork("drowned") })];
  },

  // how fast the player's feet are moving the water right now
  pace(player) {
    if (player.noise <= 0) return 0;
    return player.running ? PACE.run : player.crouching ? PACE.crouch : player.noise >= 0.4 ? PACE.walk : 0;
  },

  update(e, sense, dt) {
    const events = [];
    const p = sense.player;
    const toPlayer = distanceTo(e, p);
    const speed = toPlayer <= FEELS ? drowned.pace(p) : 0;
    e.pace = speed;
    if (toPlayer < 20 && (e.memory.dripAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "gurgle", x: e.x, z: e.z, volume: speed > 0 ? 0.9 : 0.45 });
      e.memory.dripAt = sense.time + (speed > 0 ? 1.4 : 3);
    }
    if (speed > 0) {
      e.state = "follow";
      const goal = cellAt(p.x, p.z);
      const here = cellAt(e.x, e.z);
      if (here.x === goal.x && here.y === goal.y) moveToward(e, p, speed, dt);
      else moveAlongPath(e, goal, speed, dt, sense.paths);
      e.facing = Math.atan2(p.x - e.x, p.z - e.z);
      if (toPlayer < drowned.reach) events.push({ type: "contact" });
      return events;
    }
    if (toPlayer <= FEELS) {
      // still water: he stops dead and waits
      e.state = "still";
      return events;
    }
    e.state = "wander";
    if (!e.goal || moveAlongPath(e, e.goal, drowned.wanderSpeed, dt, sense.paths)) {
      e.goal = sense.paths.wander(cellAt(e.x, e.z), e.rng, e.from);
    }
    return events;
  },
};
