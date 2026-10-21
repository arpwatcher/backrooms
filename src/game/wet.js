// Puddles and footprints. Step in a puddle and your shoes are wet for a
// while; every cell you cross until they dry gets a print. Prints dry out on
// their own after a while. Something on some levels follows them.

export const SHOES_DRY_AFTER = 8;   // seconds after the last puddle
export const PRINTS_LAST = 40;      // seconds before a print dries out

// puddles: small clusters of wet cells, away from the start
export function puddleCells(layout, rng, clusters = 6) {
  const wet = new Map();
  const key = (x, y) => `${x},${y}`;
  for (let i = 0; i < clusters; i++) {
    let x = rng.int(0, layout.width - 1);
    let y = rng.int(0, layout.height - 1);
    if (Math.abs(x - layout.start.x) + Math.abs(y - layout.start.y) < 4) continue;
    const size = rng.int(2, 5);
    for (let j = 0; j < size; j++) {
      wet.set(key(x, y), { x, y });
      x = Math.max(0, Math.min(layout.width - 1, x + rng.int(-1, 1)));
      y = Math.max(0, Math.min(layout.height - 1, y + rng.int(-1, 1)));
    }
  }
  return [...wet.values()];
}

export function createTracks(puddles) {
  return { wet: new Set(puddles.map((p) => `${p.x},${p.y}`)), wetUntil: -Infinity, prints: [], last: null };
}

// call every frame with the player's cell; returns a new print or null
export function stepTracks(tracks, cell, time) {
  const here = `${cell.x},${cell.y}`;
  if (tracks.wet.has(here)) tracks.wetUntil = time + SHOES_DRY_AFTER;
  tracks.prints = tracks.prints.filter((p) => time - p.t < PRINTS_LAST);
  if (here === tracks.last) return null;
  tracks.last = here;
  if (time >= tracks.wetUntil || tracks.wet.has(here)) return null;
  const print = { x: cell.x, y: cell.y, t: time };
  tracks.prints.push(print);
  return print;
}

export function shoesWet(tracks, time) {
  return time < tracks.wetUntil;
}
