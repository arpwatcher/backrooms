// The story: seven levels you'd know if you've read about the Backrooms,
// in order, each with the thing that lives there. The layout of each is
// still generated from the run's seed; what kind of place it is, who lives
// there and what it asks of you are written here. After the Poolrooms the
// game keeps going, rolled from the seed, for as deep as you dare.

export const FIRST_LEVELS = [
  { depth: 0, archetype: "lobby", shift: null, task: null, roster: [], why: "the classic yellow. notes and the radio teach walking, the exit sign, almond water" },
  { depth: 1, archetype: "habitable", shift: null, task: "power", why: "the warehouse. the wretch debuts here: be seen and it runs you down; hide in the dark and it forgets" },
  { depth: 2, archetype: "pipes", shift: null, task: null, why: "narrow hot tunnels: the hounds debut where you hear them long before you see them" },
  { depth: 3, archetype: "electrical", shift: null, task: null, why: "the station: the smiler debuts in the dead patches between sparking lights" },
  { depth: 4, archetype: "office", shift: null, task: null, why: "the abandoned office: facelings at the desks. walk past with your eyes down" },
  { depth: 5, archetype: "lightsout", shift: null, task: null, why: "checkpoint. no lights at all; the deathmoths come for your beam" },
  { depth: 6, archetype: "poolrooms", shift: null, task: null, roster: ["drowned"], ending: true, why: "the poolrooms: warm water, the way out at the far end - and something under it that feels you move" },
];

export function firstLevel(depth) {
  return FIRST_LEVELS[depth] ?? null;
}

export const STORY_LENGTH = FIRST_LEVELS.length;
