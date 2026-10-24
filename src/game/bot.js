// A stand-in for a second player, for trying co-op without a second person:
// it walks the level at a player's pace from one spot to the next, looking
// where it goes, and its flashlight is on. It moves the way a peer's input
// would, so everything downstream (snapshots, interpolation, drawing) is the
// real co-op path.

import { moveAlongPath, cellAt } from "../entities/core.js";
import { WALK_SPEED } from "./player.js";

export function createBot(id, x, z, rng) {
  return { id, x, z, yaw: 0, noise: 0.45, echo: null, goal: null, rng };
}

export function stepBot(bot, paths, dt) {
  const here = cellAt(bot.x, bot.z);
  if (!bot.goal || moveAlongPath(bot, bot.goal, WALK_SPEED, dt, paths)) bot.goal = paths.wander(here, bot.rng, bot.from);
  // the game's yaw looks down -z; facing (from the path) looks down +z
  if (bot.facing !== undefined) bot.yaw = bot.facing + Math.PI;
  return bot;
}
