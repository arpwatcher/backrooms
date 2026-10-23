import { spawn, cellCenterXZ, cellAt } from "./core.js";
import { distancesFrom } from "../world/layout.js";

// Some time after you arrive, the lights at the start of the level go out.
// Then the ones next to them. Then the next. A line of dark comes through the
// level at a walking pace, from where you came in, and it does not stop.
// Whatever is in the dark behind it, you don't want to find out.

export const START_DELAY = 20;  // seconds before the first light goes
export const SPEED = 0.42;      // cells of path per second - slower than you walk
export const PUSHED_BACK = 6;   // cells it loses when it gets you the first time

export const deadline = {
  id: "deadline",
  name: "Deadline",
  class: "herder",
  famous: false,
  threat: 1.25,
  minDepth: 13,
  hunting: (e) => e.gap !== undefined && e.gap < 6,
  tell: "the lights where you came in go out, one after another in a line, and a low tone climbs",
  counter: "keep moving toward the exit - it is slower than walking, but it never stops",
  rule: "it comes from where you came in, at a steady pace, and never stops",
  lore: "Every level has a closing time. Nobody has ever seen what does the closing.",

  spawn(layout) {
    const dist = distancesFrom(layout, layout.start);
    return [spawn(deadline, layout.start, { dist, front: -START_DELAY * SPEED, darkened: -1 })];
  },

  // the first touch pushes it back a little way, it doesn't go home
  retreat(e) {
    e.front -= PUSHED_BACK;
    e.darkened = Math.floor(e.front);
  },

  update(e, sense, dt) {
    const events = [];
    e.front += SPEED * dt;
    const here = cellAt(sense.player.x, sense.player.z);
    const yours = e.dist[here.y]?.[here.x] ?? 0;
    e.gap = yours - e.front;
    e.state = e.front < 0 ? "waiting" : "coming";
    // a new ring of the level goes dark
    const reached = Math.floor(e.front);
    if (reached > e.darkened) {
      e.darkened = reached;
      events.push({ type: "darken", front: reached });
      // stand at the edge of the dark, as near to you as it gets
      let best = null;
      for (let y = 0; y < e.dist.length; y++) {
        for (let x = 0; x < e.dist[y].length; x++) {
          if (e.dist[y][x] !== reached) continue;
          const c = cellCenterXZ({ x, y });
          const d = Math.hypot(c.x - sense.player.x, c.z - sense.player.z);
          if (!best || d < best.d) best = { ...c, d };
        }
      }
      if (best) {
        e.x = best.x;
        e.z = best.z;
      }
    }
    // the wall of it always faces you
    e.facing = Math.atan2(sense.player.x - e.x, sense.player.z - e.z);
    if (e.front >= 0 && (e.memory.toneAt ?? 0) <= sense.time) {
      const near = Math.max(0, Math.min(1, 1 - e.gap / 20));
      events.push({ type: "sound", sound: "tone", x: e.x, z: e.z, volume: 0.3 + near * 0.7 });
      e.memory.toneAt = sense.time + 3 - near * 1.8;
    }
    if (e.gap < 0) events.push({ type: "contact" });
    return events;
  },
};
