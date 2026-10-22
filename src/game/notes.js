// Notes taped to the walls, left by people who came through before you. On
// the first levels they are the tutorial - nobody tells you the controls,
// someone who was here wrote down what they learned. Deeper down they are
// lore, warnings, and sometimes lies.

import { DIRS, hasWall, distancesFrom } from "../world/layout.js";

// teaching notes for the first levels, in the order you should find them
export const TEACHING = {
  0: [
    "if you're reading this you noclipped too. walk (WASD). look around. find a red EXIT sign.",
    "the hum never stops. you'll stop hearing it. don't stop listening.",
    "almond water on the floor sometimes. drink it when your head goes funny (Q).",
  ],
  1: [
    "it was one of us once. if it sees you, RUN. then get somewhere dark and keep still. it forgets.",
    "the exit runs off the same power as the lights. breakers on the walls (E).",
  ],
  2: [
    "the dogs down here can't see. they HEAR. crouch (C) and they lose you.",
    "running is the loudest thing you can do down here.",
  ],
  3: [
    "where the lights are dead, something smiles. keep your light on it (F). it hates the light.",
    "the flashlight doesn't last. turn it off when you're under the panels.",
  ],
  4: [
    "they sit at the desks like they're still working. don't look at their faces. i mean it.",
  ],
  5: [
    "no lights at all on this one. if you hear wings, turn your light OFF.",
    "batteries turn up on the floor if you're lucky. ration it.",
  ],
  6: [
    "day 4012. the water is warm. i can see the door from here. i can't make myself walk to it.",
    "if you're reading this - go. don't wait for me. - e.",
  ],
};

export const LORE = [
  "day 40. the exits don't go out. they go down.",
  "i counted the panels on this floor. then i counted again. there were more.",
  "the carpet is wet in the same places every time. i think it's the same carpet.",
  "if you find marcus tell him i waited.",
  "don't trust a sign that says EXIT in green.",
  "i heard my own footsteps behind me. i was standing still.",
  "they're not people. they're the shape people leave.",
  "level numbers don't mean anything. i've been on 7 three times.",
  "the almond water tastes like the summer i was nine. it shouldn't.",
  "i slept under a working light. nothing touched me. i don't know if that's a rule.",
  "you can tell the walls are newer here. the wallpaper hasn't faded yet.",
  "if you hear a party, it's already too late to wonder whose.",
];

function wallSpots(layout) {
  const dist = distancesFrom(layout, layout.start);
  const spots = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      for (const d of DIRS) if (hasWall(layout, x, y, d.dx, d.dy)) spots.push({ x, y, side: { dx: d.dx, dy: d.dy }, d: dist[y][x] });
    }
  }
  return spots;
}

// teaching notes go along the way, one closer to the start than the next;
// deeper levels get one or two lore notes somewhere in the middle
export function placeNotes(layout, depth, rng) {
  const spots = wallSpots(layout);
  const max = Math.max(...spots.map((s) => s.d));
  const texts = TEACHING[depth] ?? (depth > 5 && rng.chance(0.6) ? rng.shuffle(LORE).slice(0, rng.int(1, 2)) : []);
  const notes = [];
  texts.forEach((text, i) => {
    // the first note is as close to the start as a wall allows, the rest
    // spread out toward the exit, each no closer than the one before
    const target = i === 0 ? 0 : (max * i) / (texts.length + 1);
    const floor = notes.length ? notes[notes.length - 1].d : 0;
    const options = spots
      .filter((s) => s.d >= floor && !notes.some((n) => n.x === s.x && n.y === s.y))
      .sort((a, b) => Math.abs(a.d - target) - Math.abs(b.d - target))
      .slice(0, 6);
    if (options.length) notes.push({ text, ...rng.pick(options) });
  });
  return notes;
}
