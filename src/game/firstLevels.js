// The first ten levels are composed, not rolled. The layout of each is still
// generated from the run's seed, but what kind of place it is, and whether a
// rule is shifted or a task is set, is chosen so that each entity's debut
// gets the stage it needs: the hounds in a maze where you can't see them
// coming, the smiler where the lights are failing, the mannequin in a hall
// long enough to back away down.

export const FIRST_LEVELS = [
  { depth: 0, archetype: "lobby", shift: null, task: null, why: "the classic. notes teach walking, the exit, almond water" },
  { depth: 1, archetype: "cubicles", shift: null, task: null, why: "hounds debut where you hear them before you can see them" },
  { depth: 2, archetype: "dimwing", shift: null, task: "power", why: "the smiler debuts where panels are dead; the breakers bring light back - the counter, earned" },
  { depth: 3, archetype: "pillars", shift: null, task: null, why: "still life debuts in a hall long and open enough to back away through" },
  { depth: 4, archetype: "overtime", shift: null, task: null, why: "deathmoths debut where half the panels are off - turn your light off and move panel to panel" },
  { depth: 5, archetype: "lobby", shift: null, task: null, why: "checkpoint. partygoers debut, and the music is the first thing you hear" },
  { depth: 6, archetype: "damp", shift: "soaked", task: null, why: "facelings debut; you can't run, so you have to walk past them, eyes down" },
  { depth: 7, archetype: "pillars", shift: null, task: null, why: "stilts debuts in the open, where crouching is the only cover" },
  { depth: 8, archetype: "cubicles", shift: "behind", task: "power", why: "the first mix: keep moving, but the breakers are behind you" },
  { depth: 9, archetype: "dimwing", shift: null, task: null, why: "the peak before the checkpoint" },
];

export function firstLevel(depth) {
  return FIRST_LEVELS[depth] ?? null;
}
