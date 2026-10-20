// A level's entities: spawning them, giving each its sense of the world, and
// turning what they do into events for the game (sounds, contact, drains).

import { MESHES } from "../render/entities.js";
import { cellAt } from "../entities/core.js";
import { lineOfSight } from "../world/sight.js";
import { darkCells } from "../world/layout.js";
import { CELL } from "../world/units.js";

export function createEncounter({ scene, layout, roster, rng, paths, lightAt }) {
  const dark = darkCells(layout);
  const entities = [];
  for (const def of roster) {
    for (const entity of def.spawn(layout, rng.fork(def.id), { darkCells: dark })) {
      entity.spawnCell = cellAt(entity.x, entity.z);
      entity.mesh = MESHES[def.id]();
      entity.mesh.position.set(entity.x, 0, entity.z);
      scene.add(entity.mesh);
      entities.push(entity);
    }
  }
  return {
    entities,
    darkCells: dark,
    update(sense, dt) {
      const events = [];
      for (const entity of entities) {
        if ((entity.stunnedUntil ?? 0) > sense.time) continue;
        for (const event of entity.def.update(entity, sense, dt)) events.push({ ...event, entity });
      }
      for (const entity of entities) {
        entity.mesh.position.set(entity.x, 0, entity.z);
        if (entity.facing !== undefined) entity.mesh.rotation.y = entity.facing;
        entity.mesh.userData.animate?.(sense.time, entity, lightAt(entity.x, entity.z));
      }
      return events;
    },
    // after a first contact the thing backs off to where it started, so the
    // player gets a moment to stand up and think about what they did wrong
    retreat(entity, time) {
      entity.x = (entity.spawnCell.x + 0.5) * CELL;
      entity.z = (entity.spawnCell.y + 0.5) * CELL;
      entity.state = "wait";
      entity.goal = null;
      entity.stunnedUntil = time + 8;
    },
    // mercy: everything freezes for a while, and whatever you can't see
    // right now quietly goes home
    calm(sense, seconds) {
      for (const entity of entities) {
        if (!sense.canSee(entity, 40)) this.retreat(entity, sense.time);
        entity.stunnedUntil = sense.time + seconds;
      }
    },
    dispose() {
      for (const entity of entities) scene.remove(entity.mesh);
    },
  };
}

// a little inside the real edge of the screen, so "I could see it" is true
export const WATCH_HALF_ANGLE = 0.8;

export function makeSense({ player, flashlight, camera, layout, paths, lightAt, time, darkCells: dark }) {
  const forward = { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
  return {
    player,
    paths,
    time,
    darkCells: dark,
    lightAt,
    canSee(entity, range) {
      return (
        Math.hypot(entity.x - player.x, entity.z - player.z) <= range &&
        lineOfSight(layout, entity.x, entity.z, player.x, player.z)
      );
    },
    // is this spot on screen and in plain view? (a blink counts as not looking)
    watching(x, z) {
      if (player.blinking) return false;
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > 40) return false;
      if (d < 0.5) return true;
      const cos = (dx * forward.x + dz * forward.z) / d;
      return cos > Math.cos(WATCH_HALF_ANGLE) && lineOfSight(layout, player.x, player.z, x, z);
    },
    // is the flashlight beam on this spot?
    beamOn(x, z) {
      if (!flashlight.on || flashlight.battery <= 0) return false;
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > 14 || d < 0.01) return false;
      const cos = (dx * forward.x + dz * forward.z) / d;
      return cos > Math.cos(0.38) && lineOfSight(layout, player.x, player.z, x, z);
    },
    camera,
  };
}
