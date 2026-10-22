// Builds the three.js scene for one level layout. Walls and pillars are
// instanced (a level has hundreds of each); ceiling panels are emissive
// quads, and a small pool of real point lights is moved each frame to the
// panels nearest the player - hundreds of real lights would bring a laptop
// to its knees, and you only ever see the nearby ones anyway.

import * as THREE from "three";
import {
  wallpaperTexture, carpetTexture, ceilingTexture, panelTexture,
  concreteTexture, tileTexture, metalTexture, officeWallTexture, officeCarpetTexture,
} from "./textures.js";

// what each surface can be made of, by name (a level's look picks them)
const SURFACES = {
  wallpaper: (seed) => wallpaperTexture(seed),
  carpet: (seed) => carpetTexture(seed),
  ceiling: (seed) => ceilingTexture(seed),
  concrete: (seed) => concreteTexture(seed),
  darkConcrete: (seed) => concreteTexture(seed, "#55514b"),
  wetConcrete: (seed) => concreteTexture(seed, "#5d5f5a"),
  tile: (seed) => tileTexture(seed),
  bigTile: (seed) => tileTexture(seed, "#e8eceb", "#b0b8b6", 4),
  metal: (seed) => metalTexture(seed),
  office: (seed) => officeWallTexture(seed),
  officeCarpet: (seed) => officeCarpetTexture(seed),
  crate: (seed) => concreteTexture(seed, "#6e5536"),
};
const surface = (name, fallback, seed) => (SURFACES[name] ?? SURFACES[fallback])(seed);

import { CELL, WALL_HEIGHT, WALL_THICKNESS, PILLAR_HALF } from "../world/units.js";

export { CELL, WALL_HEIGHT };
const LIGHT_POOL = 10;

export function cellCenter(x, y) {
  return new THREE.Vector3((x + 0.5) * CELL, 0, (y + 0.5) * CELL);
}

// look: optional tints and fog from the level's archetype
export function buildWorld(scene, layout, look = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const width = layout.width * CELL;
  const depth = layout.height * CELL;

  const carpet = surface(look.floor, "carpet", `${layout.seed}-carpet`);
  carpet.repeat.set(layout.width / 2, layout.height / 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ map: carpet, color: look.carpet ?? 0xffffff }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(width / 2, 0, depth / 2);
  group.add(floor);

  const tiles = surface(look.ceilingSurface, "ceiling", `${layout.seed}-ceiling`);
  tiles.repeat.set(layout.width, layout.height);
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ map: tiles }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(width / 2, WALL_HEIGHT, depth / 2);
  group.add(ceiling);

  // walls: one instance per wall edge
  const segments = [];
  for (let y = 0; y <= layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.north[y][x]) segments.push({ x: (x + 0.5) * CELL, z: y * CELL, rotate: false });
    }
  }
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x <= layout.width; x++) {
      if (layout.west[y][x]) segments.push({ x: x * CELL, z: (y + 0.5) * CELL, rotate: true });
    }
  }
  const wallMaterial = new THREE.MeshLambertMaterial({ map: surface(look.walls, "wallpaper", `${layout.seed}-wallpaper`), color: look.wall ?? 0xffffff });
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CELL + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
    wallMaterial,
    segments.length,
  );
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const none = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  segments.forEach((s, i) => {
    matrix.compose(new THREE.Vector3(s.x, WALL_HEIGHT / 2, s.z), s.rotate ? rotation : none, scale);
    walls.setMatrixAt(i, matrix);
  });
  group.add(walls);

  if (layout.pillars.length) {
    // pillars, or stacks of crates where a level stores things
    const crates = look.pillars === "crate";
    const pillars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(PILLAR_HALF * 2, crates ? 1.6 : WALL_HEIGHT, PILLAR_HALF * 2),
      crates ? new THREE.MeshLambertMaterial({ map: surface("crate", "crate", `${layout.seed}-crate`) }) : wallMaterial,
      layout.pillars.length,
    );
    layout.pillars.forEach((p, i) => {
      const c = cellCenter(p.x, p.y);
      matrix.compose(new THREE.Vector3(c.x, look.pillars === "crate" ? 0.8 : WALL_HEIGHT / 2, c.z), none, scale);
      pillars.setMatrixAt(i, matrix);
    });
    group.add(pillars);
  }

  if (look.pipes) group.add(pipesAlong(segments, layout.seed));
  if (look.water) group.add(waterOver(width, depth));

  // ceiling panels - emissive, so they glow even far from a real light
  const panelGeometry = new THREE.PlaneGeometry(1.2, 0.6);
  const panelMap = panelTexture();
  const panels = layout.lights.map((light) => {
    const material = new THREE.MeshBasicMaterial({ map: panelMap, color: look.panel ?? 0xfff6d0 });
    const mesh = new THREE.Mesh(panelGeometry, material);
    const c = cellCenter(light.x, light.y);
    mesh.position.set(c.x, WALL_HEIGHT - 0.01, c.z);
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
    const panel = { ...light, mesh, level: light.state === "dead" ? 0 : 1, phase: Math.random() * 100, on: look.panel ?? 0xfff6d0 };
    if (light.state === "dead") material.color.setHex(0x3a3628);
    return panel;
  });

  const pool = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const light = new THREE.PointLight(look.light ?? 0xfff1c4, 0, CELL * 5, 1.6);
    group.add(light);
    pool.push(light);
  }

  scene.background = new THREE.Color(look.background ?? 0x1a1608);
  scene.fog = new THREE.FogExp2(look.fog ?? 0x3b3316, look.fogDensity ?? 0.048);
  const ambient = new THREE.AmbientLight(look.ambientColor ?? 0x9a8848, look.ambient ?? 0.6);
  group.add(ambient);

  return { group, panels, pool, ambient, segments };
}

// per frame: flicker, then hand the light pool to the nearest live panels
// returns the panels that just flickered off, so the caller can tick them
export function updateLights(world, position, time) {
  const ticks = [];
  for (const panel of world.panels) {
    if (panel.state === "flicker") {
      const t = time * 9 + panel.phase;
      const off = Math.sin(t) * Math.sin(t * 2.7) > 0.55 || Math.sin(t * 0.31) > 0.97;
      if (off && panel.level > 0.5) ticks.push(panel);
      panel.level = off ? 0.05 : 1;
      panel.mesh.material.color.setHex(off ? 0x5a5236 : panel.on);
    }
  }
  const live = world.panels
    .filter((p) => p.level > 0.1)
    .map((p) => ({ p, d: p.mesh.position.distanceToSquared(position) }))
    .sort((a, b) => a.d - b.d);
  world.pool.forEach((light, i) => {
    const entry = live[i];
    if (!entry) {
      light.intensity = 0;
      return;
    }
    light.position.set(entry.p.mesh.position.x, WALL_HEIGHT - 0.25, entry.p.mesh.position.z);
    light.intensity = 3.0 * entry.p.level;
  });
  return ticks;
}

// pipes run along about half the walls, two at head height and one low,
// standing a hand's width off the wall
function pipesAlong(segments, seed) {
  const runs = segments.filter((_, i) => Math.sin(i * 12.9898 + seed.length * 3.1) > 0);
  const heights = [2.32, 2.48, 0.32];
  const geometry = new THREE.CylinderGeometry(0.055, 0.055, CELL + WALL_THICKNESS, 10);
  const material = new THREE.MeshStandardMaterial({ map: metalTexture(`${seed}-pipes`), color: 0x8a7b6a, roughness: 0.55, metalness: 0.5 });
  const pipes = new THREE.InstancedMesh(geometry, material, runs.length * heights.length);
  const matrix = new THREE.Matrix4();
  const along = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (const s of runs) {
    // a cylinder stands on y; lay it along the wall
    along.setFromEuler(new THREE.Euler(s.rotate ? Math.PI / 2 : 0, 0, s.rotate ? 0 : Math.PI / 2));
    const off = WALL_THICKNESS / 2 + 0.09;
    for (const [k, h] of heights.entries()) {
      const side = k % 2 ? 1 : -1;
      matrix.compose(new THREE.Vector3(s.x + (s.rotate ? side * off : 0), h, s.z + (s.rotate ? 0 : side * off)), along, scale);
      pipes.setMatrixAt(i++, matrix);
    }
  }
  pipes.count = i;
  return pipes;
}

// shallow still water over the whole floor
function waterOver(width, depth) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x8fc4c8, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.55 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(width / 2, 0.07, depth / 2);
  return water;
}
