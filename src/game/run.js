// One run through the levels: depth, each level's seed, what you carry, and
// what you've found. Seeds chain from the run seed so a run can be replayed.

export function createRun(seed) {
  return {
    seed,
    depth: 0,
    inventory: { almondWater: 0 },
    deaths: 0,
    log: [],
  };
}

export function levelSeed(run, depth = run.depth) {
  return `${run.seed}/L${depth}`;
}

// checkpoints every five levels: losing a run sends you back to the last one
export function checkpointFor(depth) {
  return Math.floor(depth / 5) * 5;
}

export function descend(run) {
  run.depth += 1;
  run.log.push({ depth: run.depth, event: "entered" });
  return run;
}

export function drinkAlmondWater(run, player) {
  if (run.inventory.almondWater <= 0) return false;
  run.inventory.almondWater -= 1;
  player.lucidity = Math.min(1, player.lucidity + 0.35);
  return true;
}
