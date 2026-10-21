import { spawn, distanceTo, moveAlongPath, moveToward, cellAt } from "./core.js";

// Too tall for the building. It walks bent double, the back of its head
// dragging along the ceiling tiles, and from up there its eyes can only look
// out and up, never down. Anything standing in its gaze, it sees. Get below
// waist height when its head comes round, and it looks straight over you.

export const SIGHT_RANGE = 22;
export const SIGHT_HALF_ANGLE = 0.45;
export const NOTICE_TIME = 1.5;   // it stares this long before it comes

export const stilts = {
  id: "stilts",
  name: "Stilts",
  class: "watcher",
  famous: false,
  homage: "the tall thin man in a suit",
  threat: 1.25,
  minDepth: 7,
  hunting: (e) => e.state === "stride" || e.state === "notice",
  tell: "ceiling tiles rattling where its head drags along them, and a creak of long joints",
  counter: "crouch when its head turns your way - it looks straight over anything below waist height",
  rule: "it sees anything standing above waist height, and nothing below it",
  lore: "It doesn't walk the halls so much as wade through them. It has never once looked down.",
  speed: 3,
  patrolSpeed: 1,
  reach: 1.1,

  spawn(layout, rng) {
    const far = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) > 16) far.push({ x, y });
      }
    }
    if (far.length === 0) return [];
    return [spawn(stilts, rng.pick(far), { rng: rng.fork("stilts"), head: rng.range(0, Math.PI * 2), sweep: 1 })];
  },

  // does its gaze land on the player? walls block it like anything else
  sees(e, player, canSee = () => true) {
    if (player.crouching) return false;
    const dx = player.x - e.x;
    const dz = player.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT_RANGE) return false;
    if (d < 1.5) return canSee(e, SIGHT_RANGE);
    let diff = Math.atan2(dx, dz) - e.head;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return Math.abs(diff) < SIGHT_HALF_ANGLE && canSee(e, SIGHT_RANGE);
  },

  update(e, sense, dt) {
    const events = [];
    const toPlayer = distanceTo(e, sense.player);
    if (toPlayer < 26 && (e.memory.creakAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "creak", x: e.x, z: e.z, volume: e.state === "stride" ? 1 : 0.6 });
      e.memory.creakAt = sense.time + (e.state === "stride" ? 1.4 : 3);
    }
    const seen = stilts.sees(e, sense.player, sense.canSee);
    if (seen) {
      e.memory.lastSeen = { x: sense.player.x, z: sense.player.z };
      e.memory.noticedAt ??= sense.time;
      e.head = Math.atan2(sense.player.x - e.x, sense.player.z - e.z);
      if (sense.time - e.memory.noticedAt < NOTICE_TIME) {
        e.state = "notice";
        return events;
      }
      e.state = "stride";
      const goal = cellAt(sense.player.x, sense.player.z);
      const here = cellAt(e.x, e.z);
      if (here.x === goal.x && here.y === goal.y) moveToward(e, sense.player, stilts.speed, dt);
      else moveAlongPath(e, goal, stilts.speed, dt, sense.paths);
      e.head = Math.atan2(sense.player.x - e.x, sense.player.z - e.z);
      if (distanceTo(e, sense.player) < stilts.reach) events.push({ type: "contact" });
      return events;
    }
    e.memory.noticedAt = undefined;
    if (e.memory.lastSeen) {
      // wade to where it last saw you, looking around as it goes
      e.state = "search";
      e.head += dt * 0.9 * e.sweep;
      if (moveAlongPath(e, cellAt(e.memory.lastSeen.x, e.memory.lastSeen.z), stilts.patrolSpeed * 1.6, dt, sense.paths)) {
        e.memory.lastSeen = null;
      }
      return events;
    }
    // patrol: wander slowly while the head sweeps back and forth
    e.state = "patrol";
    e.memory.sweepAt ??= sense.time + 4;
    if (sense.time > e.memory.sweepAt) {
      e.sweep = -e.sweep;
      e.memory.sweepAt = sense.time + 3 + e.rng.range(0, 3);
    }
    e.head += dt * 0.5 * e.sweep;
    if (!e.goal || moveAlongPath(e, e.goal, stilts.patrolSpeed, dt, sense.paths)) {
      e.goal = sense.paths.wander(cellAt(e.x, e.z), e.rng, e.from);
    }
    return events;
  },
};
