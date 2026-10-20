// Circle-vs-wall collision on the edge-wall grid. Walls are thin axis-aligned
// boxes on cell edges, pillars small squares in cell centres. Only the 3x3
// cells around the mover are checked.

import { CELL, PILLAR_HALF, WALL_HALF_THICKNESS } from "./units.js";

function boxes(layout, cx, cy) {
  const out = [];
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (y >= 0 && y <= layout.height && x >= 0 && x < layout.width && layout.north[y][x]) {
        out.push({ minX: x * CELL, maxX: (x + 1) * CELL, minZ: y * CELL - WALL_HALF_THICKNESS, maxZ: y * CELL + WALL_HALF_THICKNESS });
      }
      if (y >= 0 && y < layout.height && x >= 0 && x <= layout.width && layout.west[y][x]) {
        out.push({ minX: x * CELL - WALL_HALF_THICKNESS, maxX: x * CELL + WALL_HALF_THICKNESS, minZ: y * CELL, maxZ: (y + 1) * CELL });
      }
    }
  }
  for (const p of layout.pillars) {
    if (Math.abs(p.x - cx) <= 1 && Math.abs(p.y - cy) <= 1) {
      const mx = (p.x + 0.5) * CELL;
      const mz = (p.y + 0.5) * CELL;
      out.push({ minX: mx - PILLAR_HALF, maxX: mx + PILLAR_HALF, minZ: mz - PILLAR_HALF, maxZ: mz + PILLAR_HALF });
    }
  }
  return out;
}

// moves (x, z) by (dx, dz) and pushes the circle out of anything it overlaps
export function moveCircle(layout, x, z, dx, dz, radius) {
  let nx = x + dx;
  let nz = z + dz;
  for (let pass = 0; pass < 3; pass++) {
    const cx = Math.floor(nx / CELL);
    const cy = Math.floor(nz / CELL);
    for (const b of boxes(layout, cx, cy)) {
      const px = Math.max(b.minX, Math.min(nx, b.maxX));
      const pz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const ox = nx - px;
      const oz = nz - pz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        nx = px + (ox / d) * radius;
        nz = pz + (oz / d) * radius;
      } else {
        // centre inside the box: push out along the shallowest axis
        const pushes = [
          [b.minX - radius - nx, 0], [b.maxX + radius - nx, 0],
          [0, b.minZ - radius - nz], [0, b.maxZ + radius - nz],
        ].sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        nx += pushes[0][0];
        nz += pushes[0][1];
      }
    }
  }
  const maxX = layout.width * CELL - radius;
  const maxZ = layout.height * CELL - radius;
  return { x: Math.min(Math.max(nx, radius), maxX), z: Math.min(Math.max(nz, radius), maxZ) };
}

export function cellOf(x, z) {
  return { x: Math.floor(x / CELL), y: Math.floor(z / CELL) };
}
