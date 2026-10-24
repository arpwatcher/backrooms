// Other players and entities arrive fifteen times a second; drawn as they
// arrive they would jump. A peer draws the world a little in the past
// (BEHIND seconds) and blends between the two snapshots either side of that
// moment. Past the newest snapshot it holds the last position rather than
// guessing.

export const BEHIND = 0.1;
const KEEP = 8;

export function createBuffer() {
  return { snapshots: [] };
}

// add a read snapshot ({ t, players, entities }); late ones slot into place
export function push(buffer, s) {
  if (buffer.snapshots.some((x) => x.t === s.t)) return;
  buffer.snapshots.push(s);
  buffer.snapshots.sort((a, b) => a.t - b.t);
  if (buffer.snapshots.length > KEEP) buffer.snapshots.shift();
}

function lerpAngle(a, b, f) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * f;
}

function blend(list0, list1, f, angle) {
  const later = new Map(list1.map((x) => [x.id, x]));
  return list0.map((x) => {
    const y = later.get(x.id);
    if (!y) return { ...x };
    return { ...y, x: x.x + (y.x - x.x) * f, z: x.z + (y.z - x.z) * f, [angle]: lerpAngle(x[angle], y[angle], f) };
  });
}

// the world as it was at `now - BEHIND` (now is the newest snapshot's clock)
export function sample(buffer, now) {
  const list = buffer.snapshots;
  if (!list.length) return null;
  const at = now - BEHIND;
  if (at <= list[0].t) return list[0];
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    if (at >= a.t && at <= b.t) {
      const f = (at - a.t) / (b.t - a.t);
      return { t: at, players: blend(a.players, b.players, f, "yaw"), entities: blend(a.entities, b.entities, f, "facing") };
    }
  }
  return list[list.length - 1];
}
