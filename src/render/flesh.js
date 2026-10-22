// The kit every monster is built from: skin painted on a canvas (mottled,
// veined, dirty) with a normal map worked out from the same paint so light
// catches the relief; lumpy organic geometry from displaced primitives; eyes
// that glow and still read in the dark; a rim of light on the silhouette so
// a shape stands out against the black; and twitching, which is most of what
// makes a thing look wrong when it moves.

import * as THREE from "three";
import { Rng } from "../core/rng.js";

// --- noise -----------------------------------------------------------------

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

export function fbm(x, y, z, octaves = 4) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, z * f);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum;
}

// --- skin ------------------------------------------------------------------

const skins = new Map();

// options: base (css colour), blotch (css colour), veins (css colour or null),
// grime (0..1), pores (0..1), seed
export function skin(options = {}) {
  const key = JSON.stringify(options);
  if (skins.has(key)) return skins.get(key);
  const { base = "#b9a596", blotch = "rgba(120,60,60,0.35)", veins = "rgba(70,60,110,0.35)", grime = 0.4, pores = 0.5, seed = "skin", size = 256 } = options;
  const rng = new Rng(seed);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  // read back pixel by pixel below: keep the canvas on the cpu
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // blotches
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(6, 40);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, blotch);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // veins: wandering branching lines
  if (veins) {
    g.strokeStyle = veins;
    for (let i = 0; i < 14; i++) {
      let x = rng.range(0, size), y = rng.range(0, size), a = rng.range(0, Math.PI * 2);
      g.lineWidth = rng.range(0.6, 2.2);
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 30; j++) {
        a += rng.range(-0.5, 0.5);
        x += Math.cos(a) * 4;
        y += Math.sin(a) * 4;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // grime and pores, as per-pixel noise
  const img = g.getImageData(0, 0, size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = fbm(x / 22, y / 22, 3.1);
      const fine = hash3(x, y, 9.7);
      const dirt = (n - 0.5) * 90 * grime;
      const pore = fine > 1 - pores * 0.06 ? -40 : 0;
      img.data[i] = Math.max(0, img.data[i] + dirt + pore);
      img.data[i + 1] = Math.max(0, img.data[i + 1] + dirt * 0.9 + pore);
      img.data[i + 2] = Math.max(0, img.data[i + 2] + dirt * 0.8 + pore);
      height[y * size + x] = n * 0.8 + (pore ? -0.3 : 0) + (img.data[i] + img.data[i + 1]) / 1200;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  // normal map from the height field (sobel)
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = normalCanvas.height = size;
  const ng = normalCanvas.getContext("2d");
  const nimg = ng.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 4;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  ng.putImageData(nimg, 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  const result = { map, normalMap };
  skins.set(key, result);
  return result;
}

// a standard material with a rim of light around the silhouette: in the
// dark, the edge of the shape is the last thing you lose
export function fleshMaterial({ skin: s, color = 0xffffff, roughness = 0.72, rim = 0x6a5a48, rimPower = 2.6, emissive = 0x000000, side = THREE.FrontSide, normalScale = 1.2 } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, map: s?.map ?? null, normalMap: s?.normalMap ?? null, emissive, side,
  });
  if (s?.normalMap) material.normalScale.set(normalScale, normalScale);
  const rimColor = new THREE.Color(rim);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: rimColor };
    shader.uniforms.rimPower = { value: rimPower };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n  float rimAmount = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\n  totalEmissiveRadiance += rimColor * pow(rimAmount, rimPower);",
      );
  };
  material.customProgramCacheKey = () => `flesh-${rimPower}`;
  return material;
}

// --- shape -----------------------------------------------------------------

// pushes every vertex in or out along its normal by noise: smooth primitives
// become lumpy, uneven, organic. `squeeze` pinches, `swell` bloats.
export function lumpy(geometry, { amount = 0.03, scale = 4, seed = 1, along = null } = {}) {
  // displace along the smooth normals the primitive already has: copies of a
  // vertex on a seam share a position and a normal, so they move together
  // and the surface stays closed (per-face normals tore it into a grid)
  const g = geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const normal = g.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(normal, i);
    let d = (fbm(v.x * scale + seed, v.y * scale, v.z * scale) - 0.5) * 2 * amount;
    if (along) d += along(v) ?? 0;
    v.addScaledVector(n, d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return mergeByPosition(g);
}

// welds the seams toNonIndexed opened so displaced surfaces stay closed
function mergeByPosition(geometry) {
  const pos = geometry.attributes.position;
  const keyOf = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const sums = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i);
    const e = sums.get(k) ?? { x: 0, y: 0, z: 0, n: 0 };
    const nx = geometry.attributes.normal;
    e.x += nx.getX(i);
    e.y += nx.getY(i);
    e.z += nx.getZ(i);
    e.n++;
    sums.set(k, e);
  }
  const normal = geometry.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const e = sums.get(keyOf(i));
    const l = Math.hypot(e.x, e.y, e.z) || 1;
    normal.setXYZ(i, e.x / l, e.y / l, e.z / l);
  }
  return geometry;
}

// a limb or neck along a list of points, thinning as it goes
export function tube(points, radius = 0.05, taper = 0.6, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geometry = new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), radius, radial, false);
  const pos = geometry.attributes.position;
  const segments = geometry.parameters.tubularSegments;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.floor(i / (radial + 1)) / segments;
    const centre = curve.getPointAt(Math.min(1, t));
    v.fromBufferAttribute(pos, i).sub(centre).multiplyScalar(1 - (1 - taper) * t).add(centre);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// --- eyes ------------------------------------------------------------------

let glowTexture = null;
function glow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

// two pin-points of light and their halo; visible with no light at all
export function eyes({ color = 0xfff2c0, spacing = 0.07, size = 0.018, halo = 0.16, intensity = 1 } = {}) {
  const group = new THREE.Group();
  const core = new THREE.MeshBasicMaterial({ color, fog: false });
  const haloMaterial = new THREE.SpriteMaterial({
    map: glow(), color, transparent: true, opacity: 0.55 * intensity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  for (const x of [-spacing / 2, spacing / 2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), core);
    eye.position.x = x;
    const h = new THREE.Sprite(haloMaterial);
    h.scale.setScalar(halo);
    h.position.x = x;
    group.add(eye, h);
  }
  group.userData.setOpen = (open) => {
    group.visible = open > 0.05;
    haloMaterial.opacity = 0.55 * intensity * open;
  };
  return group;
}

// --- motion ----------------------------------------------------------------

// mostly still, then a sharp jerk to a new offset, held, then back: the way
// a thing moves when it isn't quite using muscles
export function twitch(time, seed, rate = 1.6, size = 1) {
  const step = Math.floor(time * rate + seed * 17.3);
  const phase = time * rate + seed * 17.3 - step;
  const r = hash3(step, seed, 0.5);
  if (r < 0.7) return 0;
  const hold = phase < 0.35 ? 1 : Math.max(0, 1 - (phase - 0.35) * 6);
  return (hash3(step, seed, 1.5) - 0.5) * 2 * size * hold;
}

// black smoke with holes in it, tiling, for things made of the dark
const smokes = new Map();
export function smoke(seed = "smoke", size = 128) {
  if (smokes.has(seed)) return smokes.get(seed);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const img = g.createImageData(size, size);
  const off = seed.length * 3.7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // tileable: sample noise on a torus
      const a = (x / size) * Math.PI * 2;
      const b = (y / size) * Math.PI * 2;
      const n = fbm(Math.cos(a) * 1.6 + off, Math.sin(a) * 1.6, Math.cos(b) * 1.6 + Math.sin(b) * 0.9, 5);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 4;
      img.data[i + 3] = Math.max(0, Math.min(255, (n - 0.32) * 3.2 * 255));
    }
  }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  smokes.set(seed, texture);
  return texture;
}
