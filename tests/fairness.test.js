// The promises in the design's fairness chapter, checked against every
// entity the director can pick: a full card (tell, rule, counter), and no
// way for anything to reach you in the first five seconds of a level, even
// standing in the open, in the dark, sprinting with your light on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTITIES } from "../src/entities/index.js";
import { generateLayout, darkCells } from "../src/world/layout.js";
import { createPathfinder } from "../src/world/path.js";
import { lineOfSight } from "../src/world/sight.js";
import { CELL } from "../src/world/units.js";
import { Rng } from "../src/core/rng.js";

test("every entity has a full card: name, tell, rule, counter, lore", () => {
  for (const def of ENTITIES) {
    assert.ok(typeof def.name === "string" && def.name.length > 2, `${def.id}.name`);
    for (const field of ["tell", "rule", "counter", "lore"]) {
      assert.ok(typeof def[field] === "string" && def[field].length > 8, `${def.id}.${field}`);
    }
    assert.ok(def.threat > 0 && def.minDepth >= 1, `${def.id} threat/minDepth`);
    assert.equal(typeof def.spawn, "function");
    assert.equal(typeof def.update, "function");
  }
});

test("rules fit in one sentence", () => {
  for (const def of ENTITIES) assert.ok(!/[.;]\s/.test(def.rule) && def.rule.length < 90, `${def.id}: ${def.rule}`);
});

test("nothing can touch you in the first five seconds of a level, whatever you do", () => {
  for (const def of ENTITIES) {
    for (let i = 0; i < 12; i++) {
      const layout = generateLayout({ seed: `fair-${def.id}-${i}`, darkPatches: 3 });
      const dark = darkCells(layout);
      const entities = def.spawn(layout, new Rng(`fair-${i}`), { darkCells: dark });
      const player = {
        x: (layout.start.x + 0.5) * CELL, z: (layout.start.y + 0.5) * CELL, yaw: 0,
        noise: 1, running: true, crouching: false,
      };
      const sense = {
        player, paths: createPathfinder(layout), time: 0, darkCells: dark,
        lightAt: () => "dark", flashlightOn: true, beamOn: () => false,
        watching: () => false,
        canSee: (e, range) => Math.hypot(e.x - player.x, e.z - player.z) <= range && lineOfSight(layout, e.x, e.z, player.x, player.z),
      };
      for (let t = 0; t < 5; t += 0.05) {
        sense.time = t;
        for (const e of entities) {
          const events = def.update(e, sense, 0.05);
          assert.ok(!events.some((ev) => ev.type === "contact"), `${def.id} reached the start in ${t.toFixed(2)}s (seed ${i})`);
        }
      }
    }
  }
});
