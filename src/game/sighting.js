// The moment something starts hunting you. Each entity gets one sting per
// hunt (it has to calm down for a while before it can sting again), and only
// when it's close enough that the sting means something.

export const STING_RANGE = 25;
export const STING_COOLDOWN = 12;

export function createSightings() {
  return new Map();
}

// entities: [{ id, x, z, def }]; returns the entities that just turned on you
export function stepSightings(seen, entities, player, time) {
  const stings = [];
  for (const e of entities) {
    const hunting = Boolean(e.def.hunting?.(e));
    const record = seen.get(e.id) ?? { hunting: false, calmSince: -Infinity, stungAt: -Infinity };
    if (hunting && !record.hunting) {
      const near = Math.hypot(e.x - player.x, e.z - player.z) <= STING_RANGE;
      if (near && time - record.stungAt >= STING_COOLDOWN) {
        stings.push(e);
        record.stungAt = time;
      }
    }
    record.hunting = hunting;
    seen.set(e.id, record);
  }
  return stings;
}
