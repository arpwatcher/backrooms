// The body follows the thing's position a step behind, so a path of grid
// cells becomes a curve, and turns at a set rate instead of snapping round
// at every corner. A jump of more than two metres (a retreat, a teleport, the
// first frame) is taken at once.
const FOLLOW = 18;  // how quickly the body catches up (per second): a 6 m/s run trails by a third of a metre
const TURN = 7;     // radians per second
export function place(entity, dt) {
  const m = entity.mesh;
  const far = Math.hypot(m.position.x - entity.x, m.position.z - entity.z) > 2;
  // Still Life is never seen moving: it is wherever it is, at once
  if (!m.userData.placed || far || !(dt > 0) || entity.def.snap) {
    m.position.set(entity.x, 0, entity.z);
    if (entity.facing !== undefined) m.rotation.y = entity.facing;
    m.userData.placed = true;
    return;
  }
  const k = 1 - Math.exp(-dt * FOLLOW);
  m.position.x += (entity.x - m.position.x) * k;
  m.position.z += (entity.z - m.position.z) * k;
  if (entity.facing !== undefined) {
    const diff = Math.atan2(Math.sin(entity.facing - m.rotation.y), Math.cos(entity.facing - m.rotation.y));
    m.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), dt * (entity.def.turn ?? TURN));
  }
}
