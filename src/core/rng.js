// Seeded randomness. Every level, entity roster and twist is derived from a
// seed, so a run can be replayed exactly and (later) four players in co-op
// all generate the same world from the same number.

// xmur3: turns any string into a well-mixed 32-bit seed
export function hashString(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = (typeof seed === "string" ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  }

  // mulberry32 - small, fast, good enough for level generation
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // integer in [min, max], both ends included
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(items) {
    if (items.length === 0) throw new Error("pick from an empty list");
    return items[Math.floor(this.next() * items.length)];
  }

  // weighted pick: items is [[value, weight], ...]
  weighted(items) {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of items) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return items[items.length - 1][0];
  }

  shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // an independent stream for one purpose ("layout", "entities", ...) so
  // adding a random call in one system never reshuffles another
  fork(label) {
    return new Rng(hashString(`${this.state}:${label}`));
  }
}
