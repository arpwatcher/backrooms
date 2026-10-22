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
  // --- the levels everyone knows, from the story on (and mixed in after it) ---
  {
    id: "habitable",
    name: "Level 1 - the habitable zone",
    minDepth: 7,
    weight: 1,
    // a warehouse: bare concrete, crates stacked in the open, wet floor
    layout: { wallRuns: 45, rooms: 4, pillarChance: 0.09, deadLightChance: 0.14, flickerChance: 0.1 },
    look: { walls: "concrete", floor: "wetConcrete", ceilingSurface: "darkConcrete", pillars: "crate", light: 0xe8eef5, panel: 0xf2f6ff, ambientColor: 0x6a6e72, ambient: 0.45, fog: 0x1c1e20, background: 0x0a0b0c, fogDensity: 0.05 },
  },
  {
    id: "pipes",
    name: "Level 2 - pipe dreams",
    minDepth: 7,
    weight: 1,
    // narrow maintenance tunnels, hot, pipes along every wall
    layout: { wallRuns: 170, rooms: 0, pillarChance: 0, deadLightChance: 0.35, flickerChance: 0.15 },
    look: { walls: "darkConcrete", floor: "darkConcrete", ceilingSurface: "metal", pipes: true, light: 0xffb070, panel: 0xffc890, ambientColor: 0x5a3a24, ambient: 0.35, fog: 0x1e120a, background: 0x080402, fogDensity: 0.065 },
  },
  {
    id: "electrical",
    name: "Level 3 - the electrical station",
    minDepth: 7,
    weight: 1,
    // cramped metal rooms, buzzing, half the lights sparking
    layout: { wallRuns: 120, rooms: 2, pillarChance: 0.05, deadLightChance: 0.25, flickerChance: 0.3, darkPatches: 2 },
    look: { walls: "metal", floor: "darkConcrete", ceilingSurface: "metal", pipes: true, light: 0xd8f0ff, panel: 0xe0f4ff, ambientColor: 0x3a4650, ambient: 0.35, fog: 0x0e1418, background: 0x05070a, fogDensity: 0.06 },
  },
  {
    id: "office",
    name: "Level 4 - the abandoned office",
    minDepth: 7,
    weight: 1,
    // offices and corridors, quiet, everything left where it was dropped
    layout: { wallRuns: 80, rooms: 7, pillarChance: 0.03, deadLightChance: 0.12, flickerChance: 0.05 },
    look: { walls: "office", floor: "officeCarpet", light: 0xf4f6ff, panel: 0xf8faff, ambientColor: 0x7a7c84, ambient: 0.5, fog: 0x2a2c30, background: 0x101114, fogDensity: 0.045 },
  },
  {
    id: "lightsout",
    name: "Level 6 - lights out",
    minDepth: 7,
    weight: 1,
    // the same office space with every light dead: only what you carry
    layout: { wallRuns: 70, rooms: 4, deadLightChance: 1, flickerChance: 0, items: 6 },
    look: { walls: "office", floor: "officeCarpet", ambientColor: 0x202022, ambient: 0.08, fog: 0x020203, background: 0x000000, fogDensity: 0.09 },
  },
  {
    id: "poolrooms",
    name: "Level 37 - the poolrooms",
    minDepth: 7,
    weight: 1,
    // tiled halls under shallow, still water; bright, warm, and far too quiet
    layout: { wallRuns: 25, rooms: 5, pillarChance: 0.12, deadLightChance: 0, flickerChance: 0 },
    look: { walls: "tile", floor: "bigTile", ceilingSurface: "tile", water: true, light: 0xfff8ee, panel: 0xfffcf4, ambientColor: 0xb8c8c8, ambient: 0.95, fog: 0xc8d8d8, background: 0xdfe8e8, fogDensity: 0.03 },
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
