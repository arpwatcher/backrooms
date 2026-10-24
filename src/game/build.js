// Everything about a level that follows from the run's seed alone: the plan
// (archetype, roster, shift, task, pace) and the layout. The game builds the
// level from this, and in co-op every player builds the same one from the
// seed instead of receiving it.

import { levelPlan } from "./plan.js";
import { levelSeed } from "./run.js";
import { generateLayout } from "../world/layout.js";

export function buildLevel(seed, depth, tier) {
  const plan = levelPlan(seed, depth, tier);
  const darkPatches = Math.max(plan.archetype.layout.darkPatches ?? 0, ...plan.roster.map((d) => d.layout?.darkPatches ?? 0));
  const layout = generateLayout({ seed: levelSeed({ seed, depth }), ...plan.archetype.layout, darkPatches });
  return { plan, layout };
}
