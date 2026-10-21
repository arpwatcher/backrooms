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
    "something breathes out there. it can't see. it HEARS. crouch (C) and it loses you.",
    "running (shift) is the loudest thing you can do down here.",
  ],
  2: [
    "where the lights are dead, something smiles. keep the light on it (F). it hates the light.",
    "the flashlight doesn't last. turn it off when you're under the panels.",
  ],
  3: [
    "the mannequin moved. i didn't see it move. i only looked away for a second.",
    "if you're tired your eyes close by themselves. that's when it comes.",
  ],
  4: [
    "moths. turn your light OFF. they want the light, not you.",
  ],
  5: [
    "music through the wall. don't go. whatever you do, don't go to the party.",
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
