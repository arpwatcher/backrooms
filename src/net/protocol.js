// The messages co-op sends (docs/16-coop-tech.md). Plain objects with a
// type; positions travel as 16-bit integers. Kept free of any transport so
// the loopback in tests and WebRTC later carry exactly the same thing.

export const VERSION = 1;
export const SPAN = 80;        // metres covered by a coordinate (a 32-cell level is 76.8 m)
const STEPS = 65535;

export function quantize(metres) {
  return Math.max(0, Math.min(STEPS, Math.round((metres / SPAN) * STEPS)));
}

export function unquantize(q) {
  return (q / STEPS) * SPAN;
}

// angles to 16 bits too (about 0.0001 rad)
export function packAngle(a) {
  const turn = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((turn / (Math.PI * 2)) * STEPS);
}

export function unpackAngle(q) {
  const a = (q / STEPS) * Math.PI * 2;
  return a > Math.PI ? a - Math.PI * 2 : a;
}

export const hello = (name, build) => ({ type: "hello", v: VERSION, name, build });
export const start = (seed, depth, tier) => ({ type: "start", seed, depth, tier });
export const input = (id, t, keys) => ({ type: "input", id, t, ...keys });
export const event = (kind, detail = {}) => ({ type: "event", kind, ...detail });

export function snapshot(t, players, entities) {
  return {
    type: "snapshot",
    t,
    players: players.map((p) => ({ id: p.id, x: quantize(p.x), z: quantize(p.z), yaw: packAngle(p.yaw ?? 0), noise: Math.round((p.noise ?? 0) * 100), echo: Boolean(p.echo) })),
    entities: entities.map((e) => ({ id: e.id, x: quantize(e.x), z: quantize(e.z), facing: packAngle(e.facing ?? 0), state: e.state })),
  };
}

// back to metres and radians on the receiving side
export function readSnapshot(s) {
  return {
    t: s.t,
    players: s.players.map((p) => ({ ...p, x: unquantize(p.x), z: unquantize(p.z), yaw: unpackAngle(p.yaw), noise: p.noise / 100 })),
    entities: s.entities.map((e) => ({ ...e, x: unquantize(e.x), z: unquantize(e.z), facing: unpackAngle(e.facing) })),
  };
}

const SHAPES = {
  hello: ["v", "name", "build"],
  start: ["seed", "depth", "tier"],
  input: ["id", "t"],
  snapshot: ["t", "players", "entities"],
  event: ["kind"],
};

// what came off the wire: a known type with its fields, or null
export function parse(text) {
  let m;
  try {
    m = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return null;
  }
  const fields = SHAPES[m?.type];
  if (!fields || !fields.every((f) => f in m)) return null;
  if (m.type === "hello" && m.v !== VERSION) return null;
  return m;
}
