// Everything decided about a level before it is built: what kind of place it
// is, who lives there, whether a rule is shifted, whether there is a task.
// Each choice depends on the levels before it (no repeats, variety), so the
// plan for a depth is worked out by walking the run from the top. That makes
// it the same every time for the same seed, however you got there - after a
// death, or straight from a shared seed.

import { Rng } from "../core/rng.js";
import { pickArchetype } from "../world/archetypes.js";
import { planLevel, TIERS } from "./director.js";
import { pickShift } from "./shifts.js";
import { pickTask } from "./tasks.js";
import { ENTITIES } from "../entities/index.js";

const cache = new Map();

export function levelPlan(runSeed, depth, tier = TIERS.uneasy, pool = ENTITIES) {
  const key = `${runSeed}|${tier.name}|${pool.map((d) => d.id).join()}`;
  const plans = cache.get(key) ?? [];
  cache.set(key, plans);
  for (let d = plans.length; d <= depth; d++) {
    const seed = `${runSeed}/L${d}`;
    const previous = plans[d - 1];
    const archetype = pickArchetype(d, new Rng(`${seed}/archetype`), previous?.archetype.id ?? null);
    const recent = plans.slice(Math.max(0, d - 3), d).map((p) => p.roster.map((e) => e.id));
    const director = planLevel({ depth: d, rng: new Rng(`${seed}/director`), pool, tier, recent });
    plans.push({
      depth: d,
      seed,
      archetype,
      roster: director.roster,
      director,
      shift: pickShift(d, new Rng(`${seed}/shift`)),
      task: pickTask(d, new Rng(`${seed}/task`)),
    });
  }
  return plans[depth];
}
