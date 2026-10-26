import { test } from "node:test";
import assert from "node:assert/strict";
import { place } from "../src/game/place.js";

const mesh = () => ({ position: { x: 0, z: 0, set(x, y, z) { this.x = x; this.z = z; } }, rotation: { y: 0 }, userData: {} });
const thing = (x, z, facing, def = {}) => ({ x, z, facing, def, mesh: mesh() });

test("the first frame puts the body where the thing is", () => {
  const e = thing(3, 4, 1);
  place(e, 1 / 60);
  assert.deepEqual([e.mesh.position.x, e.mesh.position.z, e.mesh.rotation.y], [3, 4, 1]);
});

test("after that the body eases after it and turns at a set rate", () => {
  const e = thing(0, 0, 0);
  place(e, 1 / 60);
  e.x = 1;
  e.facing = Math.PI / 2;
  place(e, 1 / 60);
  assert.ok(e.mesh.position.x > 0 && e.mesh.position.x < 1, `eased: ${e.mesh.position.x}`);
  assert.ok(e.mesh.rotation.y > 0 && e.mesh.rotation.y < 0.2, `turning: ${e.mesh.rotation.y}`);
  for (let i = 0; i < 120; i++) place(e, 1 / 60);
  assert.ok(Math.abs(e.mesh.position.x - 1) < 1e-3);
  assert.ok(Math.abs(e.mesh.rotation.y - Math.PI / 2) < 1e-6);
});

test("it turns the short way round", () => {
  const e = thing(0, 0, 3);
  place(e, 1 / 60);
  e.facing = -3;
  place(e, 1 / 60);
  assert.ok(e.mesh.rotation.y > 3, `went past pi, not back through zero: ${e.mesh.rotation.y}`);
});

test("a long jump, and anything that must never be seen moving, is taken at once", () => {
  const e = thing(0, 0, 0);
  place(e, 1 / 60);
  e.x = 10;
  place(e, 1 / 60);
  assert.equal(e.mesh.position.x, 10);
  const statue = thing(0, 0, 0, { snap: true });
  place(statue, 1 / 60);
  statue.x = 1;
  statue.facing = 2;
  place(statue, 1 / 60);
  assert.deepEqual([statue.mesh.position.x, statue.mesh.rotation.y], [1, 2]);
});
