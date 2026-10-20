// Level archetypes: what kind of place a level is. Each one changes the
// layout generator's knobs (how open, how lit) and the look (tints, fog).
// The director picks one per level, never the same one twice in a row, and
// the first level is always the classic lobby so the game starts where
// everybody expects it to.

export const ARCHETYPES = [
  {
    id: "lobby",
    name: "the lobby",
    minDepth: 0,
    weight: 3,
    layout: {},
    look: {},
  },
  {
    id: "pillars",
    name: "the pillar hall",
    minDepth: 1,
    weight: 2,
    // one huge room held up by columns: you can see far, and so can they
    layout: { wallRuns: 10, rooms: 1, pillarChance: 0.2 },
    look: { fogDensity: 0.036 },
  },
  {
    id: "cubicles",
    name: "the cubicle maze",
    minDepth: 1,
    weight: 2,
    // dense, short sightlines, corners everywhere
    layout: { wallRuns: 150, rooms: 3, pillarChance: 0.01 },
    look: { wall: 0xe0d6b8, fogDensity: 0.055 },
  },
  {
    id: "dimwing",
    name: "the dim wing",
    minDepth: 2,
    weight: 2,
    layout: { deadLightChance: 0.3, flickerChance: 0.16 },
    look: { fogDensity: 0.07, ambient: 0.32, background: 0x0c0a04 },
  },
  {
    id: "damp",
    name: "the damp floor",
    minDepth: 3,
    weight: 1,
    // something leaked a long time ago and never stopped
    layout: { wallRuns: 60 },
    look: { carpet: 0x8a9670, wall: 0xc2c29a, fog: 0x26301f, light: 0xe6f5d2, ambientColor: 0x7c8a5a, fogDensity: 0.052 },
  },
  {
    id: "overtime",
    name: "overtime",
    minDepth: 4,
    weight: 1,
    // after hours: half the panels are off on purpose, and the rest are cold
    layout: { deadLightChance: 0.45, flickerChance: 0.02, darkPatches: 2 },
    look: { light: 0xdfe8ff, panel: 0xe8f0ff, ambientColor: 0x5a6070, ambient: 0.4, fog: 0x14171c, background: 0x07080a, wall: 0xb4b0a0 },
  },
];

export function archetypeById(id) {
  return ARCHETYPES.find((a) => a.id === id) ?? null;
}

export function pickArchetype(depth, rng, previous = null) {
  if (depth <= 0) return ARCHETYPES[0];
  const options = ARCHETYPES.filter((a) => a.minDepth <= depth && a.id !== previous);
  return rng.weighted(options.map((a) => [a, a.weight]));
}

// the archetype of a given depth, the same every time for the same run: each
// level's choice depends on the one before, so walk the chain from the top
export function archetypeFor(depth, rngFor) {
  let previous = null;
  let archetype = ARCHETYPES[0];
  for (let d = 0; d <= depth; d++) {
    archetype = pickArchetype(d, rngFor(d), previous);
    previous = archetype.id;
  }
  return archetype;
}
