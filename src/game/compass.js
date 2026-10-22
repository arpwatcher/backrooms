// The lucid tier's exit arrow. It doesn't point at the exit through the
// walls - it points down the way you'd actually walk: the next cell on the
// shortest path, or the exit itself once you're in its cell.

import { CELL } from "../world/units.js";

// returns the angle (radians, 0 = straight ahead, positive = to the left)
// and how many cells of path are left
export function exitBearing(player, exits, paths) {
  const here = { x: Math.floor(player.x / CELL), y: Math.floor(player.z / CELL) };
  let best = null;
  for (const exit of exits) {
    const d = paths.distance(here, exit);
    if (d >= 0 && (!best || d < best.d)) best = { exit, d };
  }
  if (!best) return null;
  const target = best.d === 0 ? best.exit : paths.nextStep(here, best.exit);
  const tx = (target.x + 0.5) * CELL;
  const tz = (target.y + 0.5) * CELL;
  const heading = Math.atan2(-(tx - player.x), -(tz - player.z));
  const diff = heading - player.yaw;
  return { angle: Math.atan2(Math.sin(diff), Math.cos(diff)), cells: best.d };
}
