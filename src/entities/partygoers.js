import { spawn, distanceTo, moveAlongPath, moveToward, cellAt, cellCenterXZ } from "./core.js";
import { CELL } from "../world/units.js";

// Somewhere on the level there is a party. You hear it first: music through
// the walls, too cheerful, a little slow. Then a balloon at the end of a
// hall, and a sign taped up that just says =). They are very glad you came.
// They will not come looking for you. You have to go to them.

export function inRoom(room, x, z, cellSize = CELL) {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(z / cellSize);
  return cx >= room.x && cx < room.x + room.w && cy >= room.y && cy < room.y + room.h;
}

export const partygoers = {
  id: "partygoers",
  name: "Partygoers",
  class: "lurer",
  famous: true,
  threat: 1,
  minDepth: 5,
  hunting: (e) => e.state === "chase",
  tell: "party music through the walls, a balloon at the end of a hall, a sign that says =)",
  counter: "never go into the room the music comes from - they only chase guests",
  rule: "they only come for you if you go to the party",
  lore: "They have been waiting a long time for someone to arrive. They would hate for you to leave early.",
  speed: 3.4,
  reach: 0.9,
  // how far from the party they will follow before they go back to it
  leash: 20,

  spawn(layout, rng) {
    const far = (r) => Math.abs(r.x + r.w / 2 - layout.start.x) + Math.abs(r.y + r.h / 2 - layout.start.y) > 10;
    let room = rng.shuffle(layout.rooms.filter(far))[0];
    if (!room) {
      const cells = [];
      for (let y = 1; y < layout.height - 3; y++) {
        for (let x = 1; x < layout.width - 3; x++) if (far({ x, y, w: 3, h: 3 })) cells.push({ x, y });
      }
      if (cells.length === 0) return [];
      const c = rng.pick(cells);
      room = { x: c.x, y: c.y, w: 3, h: 3 };
    }
    const count = rng.int(2, 3);
    return Array.from({ length: count }, (_, i) =>
      spawn(partygoers, { x: room.x + rng.int(0, room.w - 1), y: room.y + rng.int(0, room.h - 1) }, {
        room, host: i === 0, rng: rng.fork(`guest-${i}`),
      }),
    );
  },

  update(e, sense, dt) {
    const cellSize = CELL;
    const events = [];
    const room = e.room;
    const center = cellCenterXZ({ x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) });
    const fromParty = distanceTo(sense.player, center);
    if (e.host && fromParty < 30 && (e.memory.musicAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "party", x: center.x, z: center.z, volume: 1 });
      e.memory.musicAt = sense.time + 1.9;
    }
    if (inRoom(room, sense.player.x, sense.player.z, cellSize) && !e.memory.invitedAt) {
      e.memory.invitedAt = sense.time;
    }
    if (e.memory.invitedAt !== undefined && fromParty > partygoers.leash) e.memory.invitedAt = undefined;

    if (e.memory.invitedAt !== undefined) {
      // a moment to turn toward the new guest and wave
      if (sense.time - e.memory.invitedAt < 1.2) {
        e.state = "greet";
        e.facing = Math.atan2(sense.player.x - e.x, sense.player.z - e.z);
        return events;
      }
      e.state = "chase";
      const goal = cellAt(sense.player.x, sense.player.z);
      const here = cellAt(e.x, e.z);
      if (here.x === goal.x && here.y === goal.y) moveToward(e, sense.player, partygoers.speed, dt);
      else moveAlongPath(e, goal, partygoers.speed, dt, sense.paths);
      if (distanceTo(e, sense.player) < partygoers.reach) events.push({ type: "contact" });
      return events;
    }
    // mingle: drift between cells of the room, and back to it if they left
    e.state = inRoom(room, e.x, e.z, cellSize) ? "mingle" : "return";
    if (!e.goal || !inRoom(room, (e.goal.x + 0.5) * cellSize, (e.goal.y + 0.5) * cellSize, cellSize) || moveAlongPath(e, e.goal, e.state === "return" ? 2.2 : 0.7, dt, sense.paths)) {
      e.goal = { x: room.x + e.rng.int(0, room.w - 1), y: room.y + e.rng.int(0, room.h - 1) };
    }
    return events;
  },
};
