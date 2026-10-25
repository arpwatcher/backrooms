import { spawn, distanceTo, moveAlongPath, moveToward, cellAt, cellCenterXZ } from "./core.js";

// Where it is, the colour goes. The carpet greys first, then the walls, a
// ring at a time around it, and the grey creeps toward you. It cannot set
// foot outside its grey, and a working panel's warm light never greys. Out
// in the colour you are safe; standing in the grey, you are in its world.

export const DRAIN_EVERY = 1.6;  // seconds between rings of grey
export const MAX_REACH = 4;      // cells: how far the grey spreads around it
export const CREEP = 0.7;        // m/s it drifts toward you through its grey
export const HUNT = 3.2;         // m/s once you're standing in the grey
export const FADE = 14;          // seconds a cell stays grey after it leaves

const key = (c) => `${c.x},${c.y}`;

export const monochrome = {
  id: "monochrome",
  name: "Monochrome",
  class: "stalker",
  famous: true,
  threat: 1.5,
  minDepth: 10,
  hunting: (e) => e.state === "hunt",
  tell: "the colour drains out of the room around it, ring by ring, and a thin static rises",
  counter: "get back into the colour - stand under a working panel, whose warm light it can never grey",
  rule: "it only exists in the grey, and the grey can't touch warm light",
  lore: "Old footage of the Backrooms is black and white. People assume that's the camera.",
  reach: 0.9,
  model: "monochrome",

  spawn(layout, rng) {
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 14) far.push({ x, y });
      }
    }
    if (far.length === 0) return [];
    return [spawn(monochrome, rng.pick(far), { rng: rng.fork("monochrome"), grey: new Map(), ring: 0 })];
  },

  // is this cell grey right now
  isGrey(e, cell, time) {
    return (e.grey.get(key(cell)) ?? -Infinity) > time;
  },

  // spread the grey one ring further around where it stands; panels' light
  // keeps its colour. Cells it has left fade back after a while.
  drain(e, sense) {
    const here = cellAt(e.x, e.z);
    e.ring = Math.min(MAX_REACH, e.ring + 1);
    for (let dy = -e.ring; dy <= e.ring; dy++) {
      for (let dx = -e.ring; dx <= e.ring; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > e.ring) continue;
        const cell = { x: here.x + dx, y: here.y + dy };
        const c = cellCenterXZ(cell);
        if (sense.lightAt(c.x, c.z) === "lit") continue;
        e.grey.set(key(cell), sense.time + FADE);
      }
    }
  },

  // on a co-op peer it only stands where the host says, but its grey follows
  // from where it stands and where the panels are, so the peer drains it too
  mirror(e, { time, lightAt }) {
    if ((e.memory.drainAt ?? 0) > time) return;
    monochrome.drain(e, { time, lightAt });
    e.memory.drainAt = time + DRAIN_EVERY;
  },

  update(e, sense, dt) {
    const events = [];
    const p = sense.player;
    if ((e.memory.drainAt ?? 0) <= sense.time) {
      monochrome.drain(e, sense);
      e.memory.drainAt = sense.time + DRAIN_EVERY;
    }
    const toPlayer = distanceTo(e, p);
    if (toPlayer < 22 && (e.memory.staticAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "static", x: e.x, z: e.z, volume: e.state === "hunt" ? 1 : 0.5 });
      e.memory.staticAt = sense.time + (e.state === "hunt" ? 1.2 : 2.6);
    }
    const yours = cellAt(p.x, p.z);
    const inGrey = monochrome.isGrey(e, yours, sense.time);
    e.state = inGrey ? "hunt" : "creep";
    const speed = inGrey ? HUNT : CREEP;
    // it moves, but never out of its grey: a step that would leave it is undone
    const before = { x: e.x, z: e.z };
    const here = cellAt(e.x, e.z);
    if (here.x === yours.x && here.y === yours.y) moveToward(e, p, speed, dt);
    else moveAlongPath(e, yours, speed, dt, sense.paths);
    if (!monochrome.isGrey(e, cellAt(e.x, e.z), sense.time)) {
      e.x = before.x;
      e.z = before.z;
    } else if (e.x !== before.x || e.z !== before.z) {
      // a new cell to drain from: the rings start over around it
      const now = cellAt(e.x, e.z);
      if (now.x !== here.x || now.y !== here.y) e.ring = Math.max(1, e.ring - 1);
    }
    e.facing = Math.atan2(p.x - e.x, p.z - e.z);
    if (inGrey && toPlayer < monochrome.reach) events.push({ type: "contact" });
    return events;
  },
};
