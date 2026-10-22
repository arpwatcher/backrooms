// A level's entities: spawning them, giving each its sense of the world, and
// turning what they do into events for the game (sounds, contact, drains).

import * as THREE from "three";
import { MESHES } from "../render/entities.js";
import { groundShadow } from "../render/flesh.js";
import { balloon, paperSign, placeOnWall } from "../render/props.js";
import { cellAt, nearestPlayer } from "../entities/core.js";
import { lineOfSight } from "../world/sight.js";
import { driftToward } from "../world/path.js";
import { lungeScale } from "./sighting.js";
import { darkCells } from "../world/layout.js";
import { CELL } from "../world/units.js";

function propMesh(prop) {
  if (prop.kind === "balloon") {
    const mesh = balloon(prop.color);
    mesh.position.set(prop.x, 0, prop.z);
    return mesh;
  }
  return placeOnWall(paperSign(prop.text), prop.x, prop.y, prop.side);
}

export function createEncounter({ scene, layout, roster, rng, paths, lightAt, tier = { drift: 0, pace: 1 } }) {
  const driftRng = rng.fork("drift");
  const dark = darkCells(layout);
  const entities = [];
  for (const def of roster) {
    const spawned = def.spawn(layout, rng.fork(def.id), { darkCells: dark });
    for (const prop of def.props?.(spawned, layout, rng.fork(`${def.id}-props`)) ?? []) scene.add(propMesh(prop));
    for (const entity of spawned) {
      entity.spawnCell = cellAt(entity.x, entity.z);
      entity.mesh = MESHES[def.id]();
      // grounded: a soft shadow sized to its footprint (not for smoke or swarms)
      if (!["deadline", "deathmoths"].includes(def.id)) {
        const box = new THREE.Box3().setFromObject(entity.mesh);
        const size = box.getSize(new THREE.Vector3());
        entity.mesh.add(groundShadow(Math.max(0.5, size.x * 1.3), Math.max(0.5, size.z * 1.3)));
      }
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
        // co-op ready: every entity deals with its nearest player
        const player = nearestPlayer(sense.players, entity);
        // wandering things lean toward whoever they're nearest; harder tiers lean more
        const goal = cellAt(player.x, player.z);
        const drifting = driftToward(sense.paths, goal, tier.drift, driftRng);
        const own = { ...sense, player, paths: drifting };
        const surge = lungeScale(entity, Math.hypot(entity.x - player.x, entity.z - player.z), sense.time);
        for (const event of entity.def.update(entity, own, dt * tier.pace * surge)) events.push({ ...event, entity, player });
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
      if (entity.def.retreat) {
        entity.def.retreat(entity);
        entity.stunnedUntil = time + 4;
        return;
      }
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

export function makeSense({ player, flashlight, camera, layout, paths, lightAt, time, darkCells: dark, prints = [] }) {
  const forward = { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
  return {
    player,
    players: [player],
    paths,
    time,
    darkCells: dark,
    prints,
    lightAt,
    flashlightOn: flashlight.on && flashlight.battery > 0,
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
