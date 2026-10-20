// Rule shifts: a level where one of the usual rules is different. Each is
// introduced by something in the level itself - a note taped by the start,
// the feel of the carpet - never a menu. The first one waits until level 3;
// after that they get more common the deeper you go.

export const SHIFTS = [
  {
    id: "soaked",
    name: "soaked",
    minDepth: 3,
    note: "the carpet is soaked through. you can't run on this.",
    effects: { noRun: true, look: { carpet: 0x7d8466 } },
  },
  {
    id: "flat",
    name: "dead battery",
    minDepth: 3,
    note: "your flashlight clicks, and nothing happens. not here.",
    effects: { noFlashlight: true },
  },
  {
    id: "behind",
    name: "lights out behind you",
    minDepth: 4,
    note: "a note by the door: DON'T STOP. THEY GO OUT BEHIND YOU.",
    effects: { lightsDieBehind: 14 },
  },
  {
    id: "shy",
    name: "shy lights",
    minDepth: 5,
    note: "the panels go dark when you look straight at them. they're on everywhere else.",
    effects: { shyLights: true },
  },
];

export function shiftChance(depth) {
  if (depth < 3) return 0;
  return Math.min(0.25 + (depth - 3) * 0.05, 0.6);
}

export function pickShift(depth, rng) {
  if (!rng.chance(shiftChance(depth))) return null;
  const options = SHIFTS.filter((s) => s.minDepth <= depth);
  return options.length ? rng.pick(options) : null;
}

// "lights out behind you": every panel you have walked under goes dead a
// fixed time later. Returns the indices of panels to kill now.
export function createTrail() {
  return { passed: new Map(), dead: new Set() };
}

export function stepTrail(trail, lights, cell, time, delay) {
  lights.forEach((light, i) => {
    if (trail.dead.has(i) || trail.passed.has(i)) return;
    if (light.x === cell.x && light.y === cell.y) trail.passed.set(i, time);
  });
  const kill = [];
  for (const [i, at] of trail.passed) {
    if (time - at >= delay) {
      trail.passed.delete(i);
      trail.dead.add(i);
      kill.push(i);
    }
  }
  return kill;
}
