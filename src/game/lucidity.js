// Lucidity replaces sanity. It drains in the dark and near things that are
// wrong, and comes back under working lights and with almond water. Low
// lucidity changes what you see: things that aren't there appear, and
// (later, and worse) things that are there stop showing.

export const LUCIDITY = {
  darkDrain: 0.012,       // per second with no working panel nearby and no flashlight
  dimDrain: 0.004,        // per second in a dim spot (flashlight only)
  presenceDrain: 0.03,    // per second per nearby entity, scaled by how close
  lightRecover: 0.006,    // per second under a working panel
  almondWater: 0.35,
};

// thresholds the rest of the game reads
export const STAGES = [
  { min: 0.66, name: "lucid" },
  { min: 0.33, name: "uneasy" },     // the edges of the screen start to crawl
  { min: 0.12, name: "slipping" },   // phantom figures, wrong sounds
  { min: 0, name: "gone" },          // the guest fate is close
];

export function stageOf(lucidity) {
  return STAGES.find((s) => lucidity >= s.min).name;
}

// light: "lit" (a working panel overhead), "dim" (only your flashlight), "dark"
// presences: [{ distance, weight }] for entities the player is near
export function stepLucidity(lucidity, { light, presences = [] }, dt) {
  let change = 0;
  if (light === "dark") change -= LUCIDITY.darkDrain;
  else if (light === "dim") change -= LUCIDITY.dimDrain;
  else change += LUCIDITY.lightRecover;
  for (const { distance, weight = 1 } of presences) {
    if (distance < 12) change -= LUCIDITY.presenceDrain * weight * (1 - distance / 12);
  }
  return Math.max(0, Math.min(1, lucidity + change * dt));
}
