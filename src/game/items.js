// What lies on the floor. Almond water is the common find; batteries are
// rarer, and rarer still the deeper you go - the flashlight is meant to be
// something you ration. There is always at least one bottle of almond water
// on a level that has any items at all.

export const BATTERY_CHARGE = 0.6;

export function batteryChance(depth) {
  return Math.max(0.12, 0.35 - depth * 0.01);
}

export function itemKinds(count, depth, rng) {
  const kinds = [];
  for (let i = 0; i < count; i++) kinds.push(rng.chance(batteryChance(depth)) ? "battery" : "almondWater");
  if (count > 0 && !kinds.includes("almondWater")) kinds[0] = "almondWater";
  return kinds;
}
