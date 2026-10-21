// Tasks: some levels won't let you leave until you've done something. The
// task is told by the level (a note by the start, a dead exit sign), and it
// is always something that sends you out into the level, away from the
// light you started in.

import { DIRS, hasWall, distancesFrom } from "../world/layout.js";

export const TASKS = [
  {
    id: "power",
    name: "restore power",
    minDepth: 2,
    count: 3,
    note: "the exit sign is dead. there are breakers on this floor - three of them. (E)",
    progress: (done, total) => (done < total ? `breakers: ${done} of ${total}` : "you hear the exit sign buzz back on"),
  },
];

export function taskChance(depth) {
  if (depth < 2) return 0;
  return Math.min(0.3 + (depth - 2) * 0.04, 0.55);
}

export function pickTask(depth, rng) {
  if (!rng.chance(taskChance(depth))) return null;
  const options = TASKS.filter((t) => t.minDepth <= depth);
  return options.length ? rng.pick(options) : null;
}

// Puts the task's targets in the level: on walls, in the middle band of
// distance from the start, spread at least `spacing` cells apart.
export function placeTask(task, layout, rng, spacing = 7) {
  const dist = distancesFrom(layout, layout.start);
  const max = Math.max(...dist.flat());
  const cells = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const d = dist[y][x];
      if (d < 5 || d > max * 0.95) continue;
      if (layout.exits.some((e) => e.x === x && e.y === y)) continue;
      const walls = DIRS.filter(({ dx, dy }) => hasWall(layout, x, y, dx, dy));
      if (walls.length) cells.push({ x, y, walls });
    }
  }
  const targets = [];
  for (let gap = spacing; targets.length < task.count && gap >= 2; gap--) {
    for (const cell of rng.shuffle(cells)) {
      if (targets.length >= task.count) break;
      if (targets.some((t) => Math.abs(t.x - cell.x) + Math.abs(t.y - cell.y) < gap)) continue;
      const side = rng.pick(cell.walls);
      targets.push({ x: cell.x, y: cell.y, side: { dx: side.dx, dy: side.dy }, done: false });
    }
  }
  return { task, targets, complete: targets.length === 0 };
}

// returns the target that was just done, or null
export function interact(state, isNear) {
  const target = state.targets.find((t) => !t.done && isNear(t));
  if (!target) return null;
  target.done = true;
  state.complete = state.targets.every((t) => t.done);
  return target;
}

export function doneCount(state) {
  return state.targets.filter((t) => t.done).length;
}
