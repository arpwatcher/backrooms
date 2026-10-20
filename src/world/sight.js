// Line of sight across the edge-wall grid: walk the cells a straight line
// passes through (Amanatides-Woo traversal) and fail at the first wall edge
// crossed. Pillars block too.

import { CELL } from "./units.js";
import { hasWall } from "./layout.js";

export function lineOfSight(layout, ax, az, bx, bz) {
  let x = Math.floor(ax / CELL);
  let y = Math.floor(az / CELL);
  const endX = Math.floor(bx / CELL);
  const endY = Math.floor(bz / CELL);
  const dx = bx - ax;
  const dz = bz - az;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dz);
  const tDeltaX = stepX ? Math.abs(CELL / dx) : Infinity;
  const tDeltaY = stepY ? Math.abs(CELL / dz) : Infinity;
  let tMaxX = stepX ? ((stepX > 0 ? (x + 1) * CELL - ax : ax - x * CELL) / Math.abs(dx)) : Infinity;
  let tMaxY = stepY ? ((stepY > 0 ? (y + 1) * CELL - az : az - y * CELL) / Math.abs(dz)) : Infinity;
  const pillars = new Set(layout.pillars.map((p) => `${p.x},${p.y}`));
  for (let guard = 0; guard < 400; guard++) {
    if (x === endX && y === endY) return true;
    if (tMaxX < tMaxY) {
      if (hasWall(layout, x, y, stepX, 0)) return false;
      x += stepX;
      tMaxX += tDeltaX;
    } else {
      if (hasWall(layout, x, y, 0, stepY)) return false;
      y += stepY;
      tMaxY += tDeltaY;
    }
    if (pillars.has(`${x},${y}`) && !(x === endX && y === endY)) return false;
  }
  return false;
}
