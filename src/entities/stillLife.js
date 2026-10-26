import { spawn, distanceTo, moveAlongPath, moveToward, cellAt } from "./core.js";

// A grey office mannequin, the kind left in the corner of a closed shop. It
// is never seen moving. Every time you look back it is closer, and turned a
// little more toward you. It wakes slowly - you hear stone dragging on carpet
// for a while before it ever starts to come - and from then on the rule is
// simple: someone has to be looking at it. Low lucidity makes you blink.

export const AWAKE_RANGE = 20;   // metres at which it notices you
export const WAKE_TIME = 6;      // seconds of scraping before it moves

export const stillLife = {
  id: "stillLife",
  name: "Still Life",
  class: "watcher",
  famous: false,
  homage: "the statue that only moves when unobserved",
  threat: 1.25,
  minDepth: 7,
  hunting: (e) => e.state === "close",
  tell: "stone scraping over carpet somewhere near, and a grey figure that is never where it was",
  counter: "keep it in view and back away - it cannot move while anyone is looking at it",
  rule: "it only moves while nobody is looking at it",
  lore: "Nobody has seen it move. Everybody who has turned around has seen that it did.",
  // drawn exactly where it is, never easing into place (encounter.js place)
  snap: true,
  speed: 5,
  reach: 0.8,

  spawn(layout, rng) {
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 12) far.push({ x, y });
      }
    }
    if (far.length === 0) return [];
    return [spawn(stillLife, rng.pick(far), { facing: rng.range(0, Math.PI * 2) })];
  },

  update(e, sense, dt) {
    const events = [];
    const toPlayer = distanceTo(e, sense.player);
    if (e.memory.wakeAt === undefined) {
      if (toPlayer < AWAKE_RANGE) e.memory.wakeAt = sense.time + WAKE_TIME;
      else {
        e.state = "dormant";
        return events;
      }
    }
    const watched = sense.watching(e.x, e.z);
    const awake = sense.time >= e.memory.wakeAt;
    // the scrape: slow while it wakes, then every time it has moved unseen
    const moved = e.memory.movedSinceSound ?? 0;
    if ((!awake && (e.memory.scrapeAt ?? 0) <= sense.time) || (awake && moved > 1.5 && watched)) {
      events.push({ type: "sound", sound: "scrape", x: e.x, z: e.z, volume: awake ? 1 : 0.55 });
      e.memory.scrapeAt = sense.time + 1.6;
      e.memory.movedSinceSound = 0;
    }
    if (!awake || watched) {
      e.state = awake ? "frozen" : "waking";
      return events;
    }
    e.state = toPlayer < 6 ? "close" : "stalk";
    const before = { x: e.x, z: e.z };
    const goal = cellAt(sense.player.x, sense.player.z);
    const here = cellAt(e.x, e.z);
    if (here.x === goal.x && here.y === goal.y) moveToward(e, sense.player, stillLife.speed, dt);
    else moveAlongPath(e, goal, stillLife.speed, dt, sense.paths);
    // whatever it did, it always ends up facing you
    e.facing = Math.atan2(sense.player.x - e.x, sense.player.z - e.z);
    e.memory.movedSinceSound = moved + Math.hypot(e.x - before.x, e.z - before.z);
    if (distanceTo(e, sense.player) < stillLife.reach) events.push({ type: "contact" });
    return events;
  },
};
