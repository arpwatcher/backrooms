import { spawn, distanceTo, moveToward, cellCenterXZ } from "./core.js";

// Everyone knows the rule: it can't stand the light. What nobody tells you is
// that it is patient. It waits in the patches where the panels died, a grin
// and two pinpricks hanging at head height, and it only ever moves while you
// are standing in the dark with it. Keep your light on it and it backs away.
// Your light does not last forever.

export const smiler = {
  id: "smiler",
  name: "Smiler",
  class: "stalker",
  famous: true,
  tell: "a grin and two pale points in a dark patch, and a faint wet clicking, like teeth",
  counter: "stay under working lights, or hold your flashlight on it - it flinches back from the beam",
  rule: "it only moves in the dark, and only while you are in the dark too",
  lore: "It waits where the panels have died. It does not chase. It just gets closer whenever you stop being lit.",
  speed: 1.6,
  reach: 0.9,

  // in the darkest places of the level
  spawn(layout, rng, sense) {
    const dark = sense.darkCells.filter((c) => Math.abs(c.x - layout.start.x) + Math.abs(c.y - layout.start.y) > 8);
    if (dark.length === 0) return [];
    return [spawn(smiler, rng.pick(dark), { home: null })];
  },

  update(e, sense, dt) {
    const events = [];
    e.home ??= { x: e.x, z: e.z };
    const toPlayer = distanceTo(e, sense.player);
    const playerInDark = sense.lightAt(sense.player.x, sense.player.z) !== "lit";
    const meInDark = sense.lightAt(e.x, e.z) !== "lit";
    const lit = sense.beamOn(e.x, e.z);

    if (toPlayer < 14 && (e.memory.clickAt ?? 0) <= sense.time) {
      events.push({ type: "sound", sound: "teeth", x: e.x, z: e.z, volume: 0.6 });
      e.memory.clickAt = sense.time + 2.5;
    }
    if (lit) {
      // flinch: back off along the line from the player, and the beam pays for it
      e.state = "flinch";
      const away = { x: e.x + (e.x - sense.player.x), z: e.z + (e.z - sense.player.z) };
      moveToward(e, away, 2.4, dt);
      events.push({ type: "drain", what: "battery", amount: 0.03 * dt });
      return events;
    }
    if (playerInDark && toPlayer < 16 && sense.canSee(e, 16)) {
      e.state = "approach";
      // it will not step into light to reach you
      const step = { x: e.x, z: e.z };
      moveToward(step, sense.player, smiler.speed, dt);
      if (sense.lightAt(step.x, step.z) !== "lit" || !meInDark) {
        e.x = step.x;
        e.z = step.z;
      }
      if (toPlayer < smiler.reach) events.push({ type: "contact" });
    } else {
      e.state = "wait";
      moveToward(e, e.home, 0.6, dt);
    }
    return events;
  },
};

export function placeAt(cell) {
  return cellCenterXZ(cell);
}
