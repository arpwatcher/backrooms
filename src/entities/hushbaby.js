import { spawn, distanceTo, moveToward } from "./core.js";

// A baby crying somewhere inside the walls. It is quiet while you are making
// noise. When you have been silent too long, it starts to cry; let the
// silence go on and it comes out of the wall to find out why nobody is
// talking to it. Walk, hum (V), make any sound at all, and it settles again.

export const HEARS_WITHIN = 24;  // further than this it can't hear you, and you can't hear it
export const CRY_AFTER = 8;      // seconds of silence before it starts to cry
export const COME_AFTER = 18;    // seconds of silence before it comes

export const hushbaby = {
  id: "hushbaby",
  name: "Hushbaby",
  class: "lurer",
  famous: false,
  threat: 1,
  minDepth: 11,
  hunting: (e) => e.state === "coming",
  tell: "an infant crying from inside the walls, louder the longer you stay quiet",
  counter: "keep making noise - walk, or hum (V) - and it settles back into the wall",
  rule: "it comes when you have been quiet too long",
  lore: "Nobody knows whose it is. It only wants someone to keep talking.",
  speed: 3.2,
  reach: 0.8,

  spawn(layout, rng) {
    const cells = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        const d = Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y);
        if (d > 8 && d < 18) cells.push({ x, y });
      }
    }
    if (cells.length === 0) return [];
    return [spawn(hushbaby, rng.pick(cells))];
  },

  update(e, sense, dt) {
    const events = [];
    e.home ??= { x: e.x, z: e.z };
    const toPlayer = distanceTo(e, sense.player);
    // it only counts silence it could have heard broken
    if (sense.player.noise > 0 || toPlayer > HEARS_WITHIN || e.memory.quietSince === undefined) {
      e.memory.quietSince = sense.time;
    }
    const silence = sense.time - e.memory.quietSince;
    if (silence >= COME_AFTER) {
      // out of the wall, straight through them, to you
      e.state = "coming";
      moveToward(e, sense.player, hushbaby.speed, dt);
      if ((e.memory.cryAt ?? 0) <= sense.time) {
        events.push({ type: "sound", sound: "cry", x: e.x, z: e.z, volume: 1 });
        e.memory.cryAt = sense.time + 0.9;
      }
      if (distanceTo(e, sense.player) < hushbaby.reach) events.push({ type: "contact" });
      return events;
    }
    if (silence >= CRY_AFTER) {
      e.state = "crying";
      if ((e.memory.cryAt ?? 0) <= sense.time) {
        const swell = (silence - CRY_AFTER) / (COME_AFTER - CRY_AFTER);
        events.push({ type: "sound", sound: "cry", x: e.x, z: e.z, volume: 0.35 + swell * 0.6 });
        e.memory.cryAt = sense.time + 2.6 - swell * 1.4;
      }
      return events;
    }
    // settled: back into its wall
    e.state = "settled";
    moveToward(e, e.home, hushbaby.speed * 1.5, dt);
    return events;
  },
};
