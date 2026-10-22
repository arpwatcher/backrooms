import { spawn, distanceTo, moveAlongPath, moveToward, cellAt } from "./core.js";

// Someone who stayed down here too long. It still walks like a person,
// mostly. It sees you if you're lit - by the panels or by your own beam -
// and hears you if you're loud, and then it runs. It runs slower than you
// can sprint, but your breath gives out and its doesn't. Break its line of
// sight and go quiet: it goes to where it last saw you, looks around for a
// while, and gives up.

export const SIGHT = { lit: 18, dark: 7 };
export const HEARS = { run: 16, walk: 6, hum: 4 };
export const NOTICE = 0.8;     // seconds of seeing you before it commits
export const LOSE_AFTER = 4;   // seconds out of its sight before it starts searching
export const SEARCH_FOR = 10;  // seconds it hunts around the last place it saw you

export const wretch = {
  id: "wretch",
  name: "The Wretch",
  class: "stalker",
  famous: true,
  threat: 1.5,
  minDepth: 8,
  hunting: (e) => e.state === "chase",
  tell: "slow bare footsteps and a wet rasping breath, then a shriek when it sees you",
  counter: "outrun it to a corner, then crouch and keep quiet in the dark - it looks where it last saw you, then gives up",
  rule: "it hunts what it can see or hear, and forgets what it can't",
  lore: "Whoever it was stayed down here too long. It still has their walk. It doesn't have anything else.",
  speed: 3.5,
  searchSpeed: 2,
  wanderSpeed: 1.1,
  reach: 0.9,
  model: "creature",

  spawn(layout, rng) {
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 14) far.push({ x, y });
      }
    }
    if (far.length === 0) return [];
    return [spawn(wretch, rng.pick(far), { rng: rng.fork("wretch"), seenFor: 0 })];
  },

  // can it see the player right now?
  sees(e, sense) {
    const p = sense.player;
    const lit = sense.lightAt(p.x, p.z) === "lit" || sense.flashlightOn;
    return sense.canSee(e, lit ? SIGHT.lit : SIGHT.dark);
  },

  hears(e, sense) {
    const p = sense.player;
    const range = p.running ? HEARS.run : p.crouching ? 0 : p.noise >= 0.4 ? HEARS.walk : p.humming ? HEARS.hum : 0;
    return range > 0 && distanceTo(e, p) <= range;
  },

  update(e, sense, dt) {
    const events = [];
    const p = sense.player;
    const toPlayer = distanceTo(e, p);
    const sees = wretch.sees(e, sense);
    if (toPlayer < 18 && (e.memory.breathAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "rasp", x: e.x, z: e.z, volume: e.state === "chase" ? 1 : 0.55 });
      e.memory.breathAt = sense.time + (e.state === "chase" ? 0.9 : 1.8);
    }
    e.seenFor = sees ? e.seenFor + dt : 0;
    if (sees) {
      e.memory.last = { x: p.x, z: p.z };
      e.memory.lastSeenAt = sense.time;
    } else if (wretch.hears(e, sense)) {
      // a sound gives it a direction, not a certainty
      e.memory.heard = { x: p.x, z: p.z };
    }

    if (e.state !== "chase" && e.seenFor >= NOTICE) {
      e.state = "chase";
      events.push({ type: "sound", sound: "shriek", x: e.x, z: e.z, volume: 1 });
    }
    if (e.state === "chase") {
      if (sense.time - (e.memory.lastSeenAt ?? -Infinity) > LOSE_AFTER) {
        e.state = "search";
        e.memory.searchUntil = sense.time + SEARCH_FOR;
        e.memory.searchGoal = null;
      } else {
        // straight at you when it can see you, along the path to where you were when it can't
        const target = sees ? p : e.memory.last;
        const goal = cellAt(target.x, target.z);
        const here = cellAt(e.x, e.z);
        if (sees && here.x === goal.x && here.y === goal.y) moveToward(e, p, wretch.speed, dt);
        else moveAlongPath(e, goal, wretch.speed, dt, sense.paths);
        e.facing = Math.atan2(target.x - e.x, target.z - e.z);
        if (toPlayer < wretch.reach && sees) events.push({ type: "contact" });
        return events;
      }
    }
    if (e.state === "search") {
      if (sense.time > e.memory.searchUntil) {
        e.state = "wander";
        e.memory.last = null;
      } else {
        // the last place it saw you first, then the cells around it
        const centre = cellAt(e.memory.last.x, e.memory.last.z);
        if (!e.memory.searchGoal) e.memory.searchGoal = centre;
        if (moveAlongPath(e, e.memory.searchGoal, wretch.searchSpeed, dt, sense.paths)) {
          e.memory.searchGoal = sense.paths.wander(e.memory.searchGoal, e.rng, null);
          const off = Math.abs(e.memory.searchGoal.x - centre.x) + Math.abs(e.memory.searchGoal.y - centre.y);
          if (off > 3) e.memory.searchGoal = centre;
        }
        return events;
      }
    }
    if (e.memory.heard) {
      e.state = "investigate";
      if (moveAlongPath(e, cellAt(e.memory.heard.x, e.memory.heard.z), wretch.searchSpeed, dt, sense.paths)) e.memory.heard = null;
      return events;
    }
    e.state = "wander";
    if (!e.goal || moveAlongPath(e, e.goal, wretch.wanderSpeed, dt, sense.paths)) {
      e.goal = sense.paths.wander(cellAt(e.x, e.z), e.rng, e.from);
    }
    return events;
  },
};
