import { spawn, distanceTo, moveAlongPath, moveToward, cellAt } from "./core.js";

// They run in twos and threes and they are nearly blind. What they have is
// hearing: a sprint carries across half the level, a walk a few rooms, a
// crouch almost nothing. Freeze and they lose you - they'll sniff the last
// place they heard you and move on. Their tell is the panting, and the claws
// on wet carpet, long before you see them.

export const HEARING = { run: 20, walk: 9, crouch: 2.5 };

export const hounds = {
  id: "hounds",
  name: "Hounds",
  class: "stalker",
  famous: true,
  threat: 1.5,
  minDepth: 1,
  hunting: (e) => e.state === "hunt",
  tell: "panting and claws ticking on damp carpet, getting louder",
  counter: "stop making noise - stand still or crouch-walk and they lose your trail",
  rule: "they hunt by sound alone - anything louder than a crouch gives you away",
  lore: "A pack that hunts the noise you make. They can barely see. You will hear them long before that matters.",
  speed: 4.2,
  wanderSpeed: 1.6,
  reach: 1.0,

  spawn(layout, rng) {
    const count = rng.int(2, 3);
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 14) far.push({ x, y });
      }
    }
    const den = rng.pick(far);
    return Array.from({ length: count }, (_, i) => spawn(hounds, den, { rng: rng.fork(`hound-${i}`) }));
  },

  heard(e, sense) {
    const p = sense.player;
    const range = p.running ? HEARING.run : p.crouching ? HEARING.crouch : p.noise > 0 ? HEARING.walk : 0;
    return range > 0 && distanceTo(e, p) <= range;
  },

  update(e, sense, dt) {
    const events = [];
    const toPlayer = distanceTo(e, sense.player);
    if (toPlayer < 16 && (e.memory.pantAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "panting", x: e.x, z: e.z, volume: e.state === "hunt" ? 1 : 0.5 });
      e.memory.pantAt = sense.time + (e.state === "hunt" ? 1.1 : 2.2);
    }
    if (hounds.heard(e, sense)) {
      e.state = "hunt";
      e.memory.lastHeard = { ...cellAt(sense.player.x, sense.player.z) };
      e.memory.lostAt = sense.time + 4;
    }
    if (e.state === "hunt") {
      if (toPlayer < 2.5) {
        moveToward(e, sense.player, hounds.speed, dt);
        if (toPlayer < hounds.reach) events.push({ type: "contact" });
      } else {
        const arrived = moveAlongPath(e, e.memory.lastHeard, hounds.speed, dt, sense.paths);
        if (arrived && sense.time > e.memory.lostAt) {
          e.state = "sniff";
          e.timer = 3;
        }
      }
      return events;
    }
    if (e.state === "sniff") {
      e.timer -= dt;
      if (e.timer <= 0) e.state = "wander";
      return events;
    }
    // wander the level, one cell at a time
    e.state = "wander";
    if (!e.goal || moveAlongPath(e, e.goal, hounds.wanderSpeed, dt, sense.paths)) {
      e.goal = sense.paths.wander(cellAt(e.x, e.z), e.rng, e.from);
    }
    return events;
  },
};
