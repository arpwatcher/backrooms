import { test } from "node:test";
import assert from "node:assert/strict";
import { exitBearing } from "../src/game/compass.js";
import { generateLayout } from "../src/world/layout.js";
import { createPathfinder } from "../src/world/path.js";
import { CELL } from "../src/world/units.js";

const c = (n) => (n + 0.5) * CELL;

test("in the open the arrow points at the exit; facing it, straight ahead", () => {
  const layout = generateLayout({ seed: "open", width: 8, height: 8, wallRuns: 0, rooms: 0, pillarChance: 0 });
  const paths = createPathfinder(layout);
  // exit straight ahead (-z is forward at yaw 0)
  const b = exitBearing({ x: c(3), z: c(6), yaw: 0 }, [{ x: 3, y: 1 }], paths);
  assert.ok(Math.abs(b.angle) < 1e-6);
  assert.equal(b.cells, 5);
  const turned = exitBearing({ x: c(3), z: c(6), yaw: Math.PI / 2 }, [{ x: 3, y: 1 }], paths);
  assert.ok(Math.abs(turned.angle + Math.PI / 2) < 1e-6, "turned left 90 degrees, the exit is to your right");
});

test("in a maze it points down the path, never through a wall", () => {
  const layout = generateLayout({ seed: "maze-arrow" });
  const paths = createPathfinder(layout);
  const exit = layout.exits[0];
  const p = { x: c(layout.start.x), z: c(layout.start.y), yaw: 0 };
  // follow the arrow cell by cell and you arrive
  for (let i = 0; i < 400; i++) {
    const b = exitBearing(p, [exit], paths);
    if (b.cells === 0) break;
    const heading = p.yaw + b.angle;
    p.x += -Math.sin(heading) * CELL;
    p.z += -Math.cos(heading) * CELL;
    p.x = (Math.floor(p.x / CELL) + 0.5) * CELL;
    p.z = (Math.floor(p.z / CELL) + 0.5) * CELL;
  }
  assert.deepEqual([Math.floor(p.x / CELL), Math.floor(p.z / CELL)], [exit.x, exit.y]);
});
