// Level layout on a grid of cells. Walls are thin and live on cell EDGES -
// Backrooms walls are office partitions, not the thick blocks of a classic
// maze - so a cell is always walkable and the question is only which of its
// four sides are open.
//
// north[y][x] is the wall on the north edge of cell (x, y), for y in 0..height
// (north[height][x] is the south border). west[y][x] likewise for x in 0..width.

import { Rng } from "../core/rng.js";

export const DIRS = [
  { name: "north", dx: 0, dy: -1 },
  { name: "south", dx: 0, dy: 1 },
  { name: "west", dx: -1, dy: 0 },
  { name: "east", dx: 1, dy: 0 },
];

function grid(rows, cols, value) {
  return Array.from({ length: rows }, () => new Array(cols).fill(value));
}

export function hasWall(layout, x, y, dx, dy) {
  if (dy === -1) return layout.north[y][x];
  if (dy === 1) return layout.north[y + 1][x];
  if (dx === -1) return layout.west[y][x];
  return layout.west[y][x + 1];
}

function setWall(layout, x, y, dx, dy, value) {
  if (dy === -1) layout.north[y][x] = value;
  else if (dy === 1) layout.north[y + 1][x] = value;
  else if (dx === -1) layout.west[y][x] = value;
  else layout.west[y][x + 1] = value;
}

export function inside(layout, x, y) {
  return x >= 0 && y >= 0 && x < layout.width && y < layout.height;
}

// walking distance in cells from one cell to every other (-1 = unreachable)
export function distancesFrom(layout, start) {
  const dist = grid(layout.height, layout.width, -1);
  const queue = [start];
  dist[start.y][start.x] = 0;
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head];
    for (const { dx, dy } of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(layout, nx, ny) || dist[ny][nx] !== -1 || hasWall(layout, x, y, dx, dy)) continue;
      dist[ny][nx] = dist[y][x] + 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

// one straight run of wall along a grid line, with the odd gap in it
function addWallRun(layout, rng) {
  const horizontal = rng.chance(0.5);
  const length = rng.int(2, 9);
  if (horizontal) {
    const y = rng.int(1, layout.height - 1);
    const x0 = rng.int(0, layout.width - length);
    for (let x = x0; x < x0 + length; x++) if (!rng.chance(0.12)) layout.north[y][x] = true;
  } else {
    const x = rng.int(1, layout.width - 1);
    const y0 = rng.int(0, layout.height - length);
    for (let y = y0; y < y0 + length; y++) if (!rng.chance(0.12)) layout.west[y][x] = true;
  }
}

// a closed room with one or two doorways - the "office" shape
function addRoom(layout, rng) {
  const w = rng.int(3, 7);
  const h = rng.int(3, 7);
  const x0 = rng.int(1, layout.width - w - 1);
  const y0 = rng.int(1, layout.height - h - 1);
  const edges = [];
  for (let x = x0; x < x0 + w; x++) {
    edges.push(["north", y0, x], ["north", y0 + h, x]);
  }
  for (let y = y0; y < y0 + h; y++) {
    edges.push(["west", y, x0], ["west", y, x0 + w]);
  }
  for (const [kind, a, b] of edges) layout[kind][a][b] = true;
  const doors = rng.int(1, 2);
  for (const [kind, a, b] of rng.shuffle(edges).slice(0, doors)) layout[kind][a][b] = false;
  return { x: x0, y: y0, w, h };
}

// open walls between reachable and unreachable cells until nothing is cut off
function connect(layout, rng, start) {
  for (let guard = 0; guard < layout.width * layout.height; guard++) {
    const dist = distancesFrom(layout, start);
    const frontier = [];
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        if (dist[y][x] !== -1) continue;
        for (const { dx, dy } of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (inside(layout, nx, ny) && dist[ny][nx] !== -1) frontier.push({ x, y, dx, dy });
        }
      }
    }
    if (frontier.length === 0) return;
    const { x, y, dx, dy } = rng.pick(frontier);
    setWall(layout, x, y, dx, dy, false);
  }
}

export function generateLayout({
  seed,
  width = 32,
  height = 32,
  wallRuns = 70,
  rooms = 6,
  pillarChance = 0.04,
  deadLightChance = 0.08,
  flickerChance = 0.06,
  exits = 1,
  items = 4,
  darkPatches = 0,
} = {}) {
  const rng = new Rng(seed ?? 1);
  const layout = {
    seed,
    width,
    height,
    north: grid(height + 1, width, false),
    west: grid(height, width + 1, false),
    pillars: [],
    lights: [],
    rooms: [],
  };
  for (let x = 0; x < width; x++) {
    layout.north[0][x] = true;
    layout.north[height][x] = true;
  }
  for (let y = 0; y < height; y++) {
    layout.west[y][0] = true;
    layout.west[y][width] = true;
  }

  const shape = rng.fork("shape");
  for (let i = 0; i < rooms; i++) layout.rooms.push(addRoom(layout, shape));
  for (let i = 0; i < wallRuns; i++) addWallRun(layout, shape);

  const start = { x: rng.int(1, 3), y: rng.int(1, 3) };
  connect(layout, rng.fork("connect"), start);
  layout.start = start;

  // pillars only in cells with no wall on any side, so they never seal a gap
  const decor = rng.fork("decor");
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const open = DIRS.every(({ dx, dy }) => !hasWall(layout, x, y, dx, dy));
      const nearStart = Math.abs(x - start.x) + Math.abs(y - start.y) < 3;
      if (open && !nearStart && decor.chance(pillarChance)) layout.pillars.push({ x, y });
    }
  }

  // a ceiling panel over every other cell, a few dead, a few flickering
  for (let y = 0; y < height; y += 2) {
    for (let x = (y / 2) % 2; x < width; x += 2) {
      const roll = decor.next();
      const state = roll < deadLightChance ? "dead" : roll < deadLightChance + flickerChance ? "flicker" : "on";
      layout.lights.push({ x, y, state });
    }
  }

  // dark patches: clusters of dead panels, away from the start. The light
  // pool in the renderer skips dead panels, so these really are dark.
  layout.darkPatches = [];
  const gloom = rng.fork("dark");
  for (let i = 0; i < darkPatches; i++) {
    const centre = { x: gloom.int(4, width - 5), y: gloom.int(4, height - 5) };
    if (Math.abs(centre.x - start.x) + Math.abs(centre.y - start.y) < 8) continue;
    const radius = gloom.int(3, 5);
    layout.darkPatches.push({ ...centre, radius });
    for (const light of layout.lights) {
      if (Math.hypot(light.x - centre.x, light.y - centre.y) <= radius) light.state = "dead";
    }
  }

  // exits: the farthest cells by walking distance, spread apart
  const dist = distancesFrom(layout, start);
  const cells = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push({ x, y, d: dist[y][x] });
  cells.sort((a, b) => b.d - a.d);
  const maxDistance = cells[0].d;
  layout.exits = [];
  const place = rng.fork("exits");
  const candidates = place.shuffle(cells.filter((c) => c.d >= maxDistance * 0.6));
  for (const cell of candidates) {
    if (layout.exits.length >= exits) break;
    if (layout.exits.every((e) => Math.abs(e.x - cell.x) + Math.abs(e.y - cell.y) > 6)) {
      layout.exits.push({ x: cell.x, y: cell.y });
    }
  }
  layout.maxDistance = maxDistance;

  // almond water and the like: somewhere between start and exit, never on top of either
  layout.items = [];
  const loot = rng.fork("items");
  const middle = cells.filter((c) => c.d > 3 && c.d < maxDistance * 0.9);
  for (const cell of loot.shuffle(middle).slice(0, items)) layout.items.push({ x: cell.x, y: cell.y });

  return layout;
}

// cells with no working panel close enough to light them
export function darkCells(layout) {
  const lit = layout.lights.filter((l) => l.state !== "dead");
  const out = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (!lit.some((l) => Math.hypot(l.x - x, l.y - y) < 1.6)) out.push({ x, y });
    }
  }
  return out;
}
