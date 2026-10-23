// Places to hide. Metal lockers stand in dead ends and tight corners; crouch
// in a locker's cell and you are inside it, behind the door: anything that
// hunts by sight can't see you, though it may still come and stand outside.
// Sound still carries, so a crouch is all you can do in there.

import { hasWall, distancesFrom } from "../world/layout.js";
import { CELL } from "../world/units.js";

const SIDES = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

// how many lockers a level gets: a few early, never so many that hiding is free
export function lockerCount(depth) {
  return depth <= 0 ? 0 : Math.min(2 + Math.floor(depth / 3), 5);
}

// [{ x, y, side }]: side is the wall the locker stands against
export function placeLockers(layout, depth, rng) {
  const count = lockerCount(depth);
  if (!count) return [];
  const dist = distancesFrom(layout, layout.start);
  const exits = new Set((layout.exits ?? []).map((e) => `${e.x},${e.y}`));
  const spots = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const walls = SIDES.filter((s) => hasWall(layout, x, y, s.dx, s.dy));
      const d = dist[y][x];
      // dead ends first, then corners; not at the start, not at an exit
      if (walls.length < 2 || d < 4 || exits.has(`${x},${y}`)) continue;
      spots.push({ x, y, side: walls[0], snug: walls.length, d });
    }
  }
  const picked = [];
  for (const snug of [3, 2]) {
    for (const spot of rng.shuffle(spots.filter((s) => s.snug === snug))) {
      if (picked.length >= count) break;
      // spread out: no two lockers within four cells of each other
      if (picked.some((p) => Math.abs(p.x - spot.x) + Math.abs(p.y - spot.y) < 4)) continue;
      picked.push({ x: spot.x, y: spot.y, side: spot.side });
    }
  }
  return picked;
}

// the middle of the space inside a locker, in world metres: it stands
// against the wall (0.44 of a cell out from the centre) and is 0.6 m deep
export function insideOf(l) {
  const out = 0.44 * CELL - 0.3;
  return { x: (l.x + 0.5) * CELL + l.side.dx * out, z: (l.y + 0.5) * CELL + l.side.dy * out };
}

// is the player inside one: crouched, and in it, not just near it
export function hiddenIn(lockers, player) {
  if (!player.crouching) return null;
  return lockers.find((l) => {
    const c = insideOf(l);
    return Math.hypot(player.x - c.x, player.z - c.z) < 0.55;
  }) ?? null;
}
