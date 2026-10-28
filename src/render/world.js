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
import { Rng } from "../core/rng.js";

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
  floor.receiveShadow = true;
  group.add(floor);
  // the level's own damp on a carpeted floor: patches that spread across
  // cells, darker wet marks, and here and there a streak where something
  // was dragged
  if (!look.floor) {
    const damp = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshLambertMaterial({ map: floorDamp(layout), transparent: true, depthWrite: false }),
    );
    damp.rotation.x = -Math.PI / 2;
    damp.position.set(width / 2, 0.004, depth / 2);
    damp.receiveShadow = true;
    group.add(damp);
  }

  const tiles = surface(look.ceilingSurface, "ceiling", `${layout.seed}-ceiling`);
  tiles.repeat.set(layout.width, layout.height);
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ map: tiles }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(width / 2, WALL_HEIGHT, depth / 2);
  ceiling.receiveShadow = true;
  group.add(ceiling);
  // over the office ceiling, one sheet of damage for the whole level, so no
  // two stretches look alike: water stains spread across tiles, and here and
  // there a tile gone, black above
  if (!look.ceilingSurface) {
    const damage = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshLambertMaterial({ map: ceilingDamage(layout), transparent: true, depthWrite: false }),
    );
    damage.rotation.x = Math.PI / 2;
    damage.position.set(width / 2, WALL_HEIGHT - 0.005, depth / 2);
    group.add(damage);
  }

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
  // every wall slides its paper sideways by its own amount, so the stains on
  // it don't come round again in the same place on the next wall
  wallMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
  vMapUv.x += fract( sin( float( gl_InstanceID ) * 12.9898 ) * 43758.5453 );
#endif`);
  };
  wallMaterial.customProgramCacheKey = () => "wall-shift";
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
  walls.receiveShadow = true;
  group.add(walls);
  // a skirting board along the foot of every papered wall, scuffed dark
  if (!look.walls || look.walls === "wallpaper") {
    const skirting = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CELL + WALL_THICKNESS + 0.02, 0.09, WALL_THICKNESS + 0.024),
      new THREE.MeshLambertMaterial({ color: 0x5c4b30 }),
      segments.length,
    );
    segments.forEach((s, i) => {
      matrix.compose(new THREE.Vector3(s.x, 0.045, s.z), s.rotate ? rotation : none, scale);
      skirting.setMatrixAt(i, matrix);
    });
    skirting.receiveShadow = true;
    group.add(skirting);
    group.add(wallFittings(segments, layout));
  }

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
    pillars.receiveShadow = true;
    group.add(pillars);
  }

  if (look.pipes) group.add(pipesAlong(segments, layout.seed));
  const water = look.water ? waterOver(width, depth) : null;
  if (water) group.add(water);

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

  // the haze round every panel: light spilling over the tiles beside it.
  // One instanced sheet for them all, coloured per panel every frame
  const glow = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.8, 2.0),
    panelGlowMaterial(),
    Math.max(1, panels.length),
  );
  const at = new THREE.Matrix4();
  const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  panels.forEach((p, i) => {
    at.compose(new THREE.Vector3(p.mesh.position.x, WALL_HEIGHT - 0.02, p.mesh.position.z), down, new THREE.Vector3(1, 1, 1));
    glow.setMatrixAt(i, at);
    glow.setColorAt(i, new THREE.Color(0));
  });
  glow.count = panels.length;
  glow.frustumCulled = false;
  group.add(glow);

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

  return { group, panels, pool, ambient, segments, water, glow };
}

// per frame: flicker, then hand the light pool to the nearest live panels
// returns the panels that just flickered off, so the caller can tick them
export function updateLights(world, position, time) {
  const ticks = [];
  if (world.water) {
    world.water.userData.ripple.offset.set(time * 0.012, time * 0.007);
  }
  for (const panel of world.panels) {
    if (panel.state === "flicker") {
      const t = time * 9 + panel.phase;
      const off = Math.sin(t) * Math.sin(t * 2.7) > 0.55 || Math.sin(t * 0.31) > 0.97;
      if (off && panel.level > 0.5) ticks.push(panel);
      panel.level = off ? 0.05 : 1;
      panel.mesh.material.color.setHex(off ? 0x5a5236 : panel.on);
    }
  }
  // each panel's haze follows it: on, flickering, dead
  if (world.glow?.instanceColor) {
    const c = new THREE.Color();
    world.panels.forEach((p, i) => world.glow.setColorAt(i, c.setHex(p.on).multiplyScalar(0.32 * p.level)));
    world.glow.instanceColor.needsUpdate = true;
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

// a tiling normal map of soft overlapping ripples
let rippleMap = null;
function ripples() {
  if (rippleMap) return rippleMap;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  const h = (x, y) => {
    const a = (x / size) * Math.PI * 2;
    const b = (y / size) * Math.PI * 2;
    return Math.sin(a * 3 + Math.sin(b * 2) * 1.5) * 0.5 + Math.sin(b * 4 + Math.cos(a * 3)) * 0.35 + Math.sin((a + b) * 5) * 0.15;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 2;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rippleMap = new THREE.CanvasTexture(c);
  rippleMap.wrapS = rippleMap.wrapT = THREE.RepeatWrapping;
  return rippleMap;
}

// shallow water over the whole floor, rippling slowly
function waterOver(width, depth) {
  const normalMap = ripples().clone();
  normalMap.needsUpdate = true;
  normalMap.repeat.set(width / 3, depth / 3);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x8fc4c8, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.55, normalMap, normalScale: new THREE.Vector2(0.35, 0.35) }),
  );
  water.userData.ripple = normalMap;
  water.rotation.x = -Math.PI / 2;
  water.position.set(width / 2, 0.07, depth / 2);
  return water;
}

// the level's own ceiling damage: an alpha sheet over the tiled ceiling, a
// few pixels per tile (tiles are half a cell), seeded by the level
function ceilingDamage(layout) {
  const rng = new Rng(`${layout.seed}-ceiling-damage`);
  const per = 16;
  const tilesX = layout.width * 2, tilesY = layout.height * 2;
  const c = document.createElement("canvas");
  c.width = tilesX * per;
  c.height = tilesY * per;
  const g = c.getContext("2d");
  // stains: soft brown blots with a darker tide line, spreading over tiles
  const stains = Math.round(tilesX * tilesY * 0.035);
  for (let i = 0; i < stains; i++) {
    const x = rng.range(0, c.width), y = rng.range(0, c.height), r = rng.range(per * 0.6, per * 2.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(120,92,40,0.32)");
    grad.addColorStop(0.75, "rgba(110,80,30,0.22)");
    grad.addColorStop(0.92, "rgba(80,56,20,0.45)");
    grad.addColorStop(1, "rgba(80,56,20,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * rng.range(0.6, 1), rng.range(0, Math.PI), 0, Math.PI * 2);
    g.fill();
  }
  // a missing tile now and then: black above, a ragged edge
  const missing = Math.round(tilesX * tilesY * 0.006);
  for (let i = 0; i < missing; i++) {
    const tx = rng.int(0, tilesX - 1), ty = rng.int(0, tilesY - 1);
    g.fillStyle = "rgba(6,5,3,0.97)";
    g.fillRect(tx * per + 1, ty * per + 1, per - 2, per - 2);
    g.fillStyle = "rgba(90,70,30,0.6)";
    g.fillRect(tx * per + 1, ty * per + 1, per - 2, 1);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// the small things an office leaves on its walls: a socket low down on
// some, a vent grille up near the ceiling on fewer, on either face
function wallFittings(segments, layout) {
  const rng = new Rng(`${layout.seed}-fittings`);
  const group = new THREE.Group();
  const face = (draw, w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const socket = face((g, w, h) => {
    g.fillStyle = "#d9d2bc";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(90,80,50,0.25)";
    g.fillRect(0, h - 6, w, 6);
    g.fillStyle = "#2a2620";
    for (const y of [h * 0.3, h * 0.66]) {
      g.fillRect(w * 0.33, y - 5, 3, 10);
      g.fillRect(w * 0.6, y - 5, 3, 10);
    }
  }, 32, 48);
  const vent = face((g, w, h) => {
    g.fillStyle = "#b8b2a0";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c1a16";
    for (let y = 6; y < h - 4; y += 6) g.fillRect(4, y, w - 8, 3);
    g.fillStyle = "rgba(60,50,30,0.35)";
    g.fillRect(0, 0, w, 4);
  }, 64, 40);
  const kinds = [
    { map: socket, size: [0.075, 0.115], y: 0.32, share: 0.12 },
    { map: vent, size: [0.42, 0.26], y: 2.35, share: 0.04 },
  ];
  for (const kind of kinds) {
    const picked = segments.filter(() => rng.next() < kind.share);
    if (!picked.length) continue;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(...kind.size), new THREE.MeshLambertMaterial({ map: kind.map }), picked.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    picked.forEach((s, i) => {
      // which face, and where along the wall
      const side = rng.next() < 0.5 ? 1 : -1;
      const along = rng.range(-CELL * 0.35, CELL * 0.35);
      const out = WALL_THICKNESS / 2 + 0.004;
      const angle = (s.rotate ? Math.PI / 2 : 0) + (side < 0 ? Math.PI : 0);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      const x = s.rotate ? s.x + side * out : s.x + along;
      const z = s.rotate ? s.z - along : s.z + side * out;
      m.compose(new THREE.Vector3(x, kind.y, z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// additive, so black adds nothing; and it fades into the fog toward black,
// not toward the fog's colour, or far panels would glow through the murk
let glowMaterial = null;
function panelGlowMaterial() {
  if (glowMaterial) return glowMaterial;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 128, 96);
  const img = g.getImageData(0, 0, 128, 96);
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      // a soft rounded rectangle: brightest under the panel, gone at the rim
      const dx = Math.max(0, Math.abs(x - 63.5) / 63.5 - 0.22) / 0.78;
      const dy = Math.max(0, Math.abs(y - 47.5) / 47.5 - 0.15) / 0.85;
      const v = Math.max(0, 1 - Math.hypot(dx, dy)) ** 2.2 * 255;
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  glowMaterial = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  glowMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float glowFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float glowFog = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb *= 1.0 - glowFog;
#endif`);
  };
  glowMaterial.customProgramCacheKey = () => "panel-glow";
  return glowMaterial;
}

function floorDamp(layout) {
  const rng = new Rng(`${layout.seed}-floor-damp`);
  const per = 24;
  const c = document.createElement("canvas");
  c.width = layout.width * per;
  c.height = layout.height * per;
  const g = c.getContext("2d");
  const blot = (x, y, r, inner, edge) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.7, inner);
    grad.addColorStop(1, edge);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * rng.range(0.5, 1), rng.range(0, Math.PI), 0, Math.PI * 2);
    g.fill();
  };
  const cells = layout.width * layout.height;
  // wide damp, a little green
  for (let i = 0; i < cells * 0.2; i++) blot(rng.range(0, c.width), rng.range(0, c.height), rng.range(per * 0.8, per * 3), "rgba(58,60,28,0.27)", "rgba(58,60,28,0)");
  // wet marks, darker, smaller, with a rim
  for (let i = 0; i < cells * 0.04; i++) blot(rng.range(0, c.width), rng.range(0, c.height), rng.range(per * 0.3, per * 0.9), "rgba(34,30,14,0.32)", "rgba(34,30,14,0)");
  // drag streaks
  g.lineCap = "round";
  for (let i = 0; i < Math.max(1, cells * 0.004); i++) {
    let x = rng.range(0, c.width), y = rng.range(0, c.height), a = rng.range(0, Math.PI * 2);
    g.strokeStyle = "rgba(40,30,16,0.18)";
    g.lineWidth = rng.range(per * 0.2, per * 0.4);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      a += rng.range(-0.3, 0.3);
      x += Math.cos(a) * per * 0.8;
      y += Math.sin(a) * per * 0.8;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
