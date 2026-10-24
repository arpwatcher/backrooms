import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLayout } from "../src/world/layout.js";
import { createPathfinder } from "../src/world/path.js";
import { createBot, stepBot } from "../src/game/bot.js";
import { CELL } from "../src/world/units.js";
import { Rng } from "../src/core/rng.js";

test("the stand-in player walks the level at walking pace and looks where it goes", () => {
  const layout = generateLayout({ seed: "bot" });
  const paths = createPathfinder(layout);
  const bot = createBot("bot", (layout.start.x + 0.5) * CELL, (layout.start.y + 0.5) * CELL, new Rng("b"));
  const start = { x: bot.x, z: bot.z };
  let travelled = 0;
  let last = { ...start };
  for (let i = 0; i < 300; i++) {
    stepBot(bot, paths, 1 / 30);
    travelled += Math.hypot(bot.x - last.x, bot.z - last.z);
    last = { x: bot.x, z: bot.z };
  }
  assert.ok(travelled > 15 && travelled < 24, `10 s of walking: ${travelled.toFixed(1)} m`);
  const heading = { x: -Math.sin(bot.yaw), z: -Math.cos(bot.yaw) };
  const toGoal = { x: (bot.goal.x + 0.5) * CELL - bot.x, z: (bot.goal.y + 0.5) * CELL - bot.z };
  const d = Math.hypot(toGoal.x, toGoal.z);
  if (d > 0.5) assert.ok((heading.x * toGoal.x + heading.z * toGoal.z) / d > -0.2, "it doesn't walk backwards");
});
