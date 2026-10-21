// Shared machinery for every entity: where it is, how it moves along paths,
// and the contact rule every one of them obeys - the first contact marks and
// hurts you, the second one with the same thing kills you. Entities only
// see the world through `sense`, a plain object the game builds each frame,
// so their behaviour can be driven and tested without a renderer.

import { CELL } from "../world/units.js";

let nextId = 1;

export function cellCenterXZ(cell) {
  return { x: (cell.x + 0.5) * CELL, z: (cell.y + 0.5) * CELL };
}

export function cellAt(x, z) {
  return { x: Math.floor(x / CELL), y: Math.floor(z / CELL) };
}

export function spawn(def, cell, extra = {}) {
  const { x, z } = cellCenterXZ(cell);
  return { id: nextId++, kind: def.id, def, x, z, state: "idle", timer: 0, goal: null, from: null, memory: {}, ...extra };
}

export function distanceTo(entity, point) {
  return Math.hypot(entity.x - point.x, entity.z - point.z);
}

// steps toward the centre of the next cell on the way to goalCell; returns
// true once it stands in the goal cell's centre
export function moveAlongPath(entity, goalCell, speed, dt, paths) {
  const here = cellAt(entity.x, entity.z);
  const next = here.x === goalCell.x && here.y === goalCell.y ? goalCell : paths.nextStep(here, goalCell);
  const target = cellCenterXZ(next);
  const dx = target.x - entity.x;
  const dz = target.z - entity.z;
  const d = Math.hypot(dx, dz);
  const step = speed * dt;
  if (d <= step) {
    entity.x = target.x;
    entity.z = target.z;
    entity.from = here;
    return next.x === goalCell.x && next.y === goalCell.y;
  }
  entity.x += (dx / d) * step;
  entity.z += (dz / d) * step;
  entity.facing = Math.atan2(dx, dz);
  return false;
}

// direct move toward a point (the last few metres, once a path is done)
export function moveToward(entity, point, speed, dt) {
  const dx = point.x - entity.x;
  const dz = point.z - entity.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return;
  const step = Math.min(d, speed * dt);
  entity.x += (dx / d) * step;
  entity.z += (dz / d) * step;
  entity.facing = Math.atan2(dx, dz);
}

// what a touch from `kind` does: the first one marks you, the second kills.
// returns { fatal, first }
// marks: Map of kind -> contacts so far this level. `allowed` is how many
// touches from the same kind you live through, plus the one that kills.
export function contact(marks, kind, allowed = 2) {
  const count = (marks.get(kind) ?? 0) + 1;
  marks.set(kind, count);
  return { fatal: count >= allowed, first: count === 1 };
}

// with more than one player, each entity deals with whoever is nearest
export function nearestPlayer(players, entity) {
  let best = players[0];
  let bestD = Infinity;
  for (const p of players) {
    const d = Math.hypot(p.x - entity.x, p.z - entity.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
