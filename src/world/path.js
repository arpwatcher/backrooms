// Getting around: every entity that chases or walks somewhere asks for the
// next cell on the shortest walk to its goal. Distance fields are cached per
// goal cell, since several things often head for the same place (you).

import { distancesFrom, hasWall, inside, DIRS } from "./layout.js";

export function createPathfinder(layout) {
  const cache = new Map();
  function field(goal) {
    const key = `${goal.x},${goal.y}`;
    if (!cache.has(key)) {
      if (cache.size > 64) cache.delete(cache.keys().next().value);
      cache.set(key, distancesFrom(layout, goal));
    }
    return cache.get(key);
  }
  return {
    // the neighbouring cell one step closer to goal (or the cell itself)
    nextStep(from, goal) {
      const dist = field(goal);
      let best = from;
      let bestDistance = dist[from.y][from.x];
      for (const { dx, dy } of DIRS) {
        const nx = from.x + dx;
        const ny = from.y + dy;
        if (!inside(layout, nx, ny) || hasWall(layout, from.x, from.y, dx, dy)) continue;
        if (dist[ny][nx] !== -1 && dist[ny][nx] < bestDistance) {
          best = { x: nx, y: ny };
          bestDistance = dist[ny][nx];
        }
      }
      return best;
    },
    distance(from, goal) {
      return field(goal)[from.y][from.x];
    },
    // a random open neighbour - for wandering
    wander(from, rng, avoid) {
      const options = DIRS.filter(({ dx, dy }) => {
        const nx = from.x + dx;
        const ny = from.y + dy;
        return inside(layout, nx, ny) && !hasWall(layout, from.x, from.y, dx, dy) && !(avoid && avoid.x === nx && avoid.y === ny);
      });
      if (options.length === 0) return avoid || from;
      const { dx, dy } = rng.pick(options);
      return { x: from.x + dx, y: from.y + dy };
    },
  };
}
