// Hallucinations. Below a third of your lucidity you start to see figures at
// the edge of your vision - a person at the end of the hall, a shape in a
// doorway. Look straight at one and it was never there. They can't hurt you.
// They aren't there to hurt you: they're there so that when something real
// stands at the edge of your vision, you aren't sure.

export const PHANTOM_BELOW = 0.33;   // lucidity under which they appear
export const GLANCE = 0.3;           // radians: look this directly at it and it's gone
export const EDGE = [0.45, 0.75];    // radians off your view where they stand

export function createPhantoms() {
  return { current: null, nextAt: 0 };
}

// lucidity: 0..1; yaw: where you face; place(angle, distance) -> {x, z} or
// null if nothing could stand there in plain view (the caller checks sight)
export function stepPhantoms(state, { lucidity, time, view, place, rng }) {
  if (state.current) {
    const { x, z } = state.current;
    const off = Math.abs(angleTo(view, x, z));
    // looked at, or simply gone after a few seconds, or you got better
    if (off < GLANCE || time > state.current.until || lucidity >= PHANTOM_BELOW) {
      const gone = state.current;
      state.current = null;
      state.nextAt = time + 4 + rng.range(0, 8) * (lucidity / PHANTOM_BELOW + 0.3);
      return { vanished: gone };
    }
    return null;
  }
  if (lucidity >= PHANTOM_BELOW || time < state.nextAt) return null;
  const side = rng.chance(0.5) ? 1 : -1;
  const angle = view.yaw + side * rng.range(EDGE[0], EDGE[1]);
  const spot = place(angle, rng.range(7, 14));
  if (!spot) {
    state.nextAt = time + 1;
    return null;
  }
  state.current = { ...spot, until: time + rng.range(2.5, 5), kind: rng.pick(["figure", "figure", "grin"]) };
  return { appeared: state.current };
}

// signed angle between where you look and the point, in radians
export function angleTo(view, x, z) {
  const target = Math.atan2(-(x - view.x), -(z - view.z));
  const diff = target - view.yaw;
  return Math.atan2(Math.sin(diff), Math.cos(diff));
}
