// Small things in the level: almond water bottles, the exit, chalk marks.
// Built from primitives and canvas textures like everything else.

import * as THREE from "three";
import { CELL, WALL_HEIGHT } from "../world/units.js";

export function almondWater() {
  const group = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0xe9eedc, transparent: true, opacity: 0.75, emissive: 0x222218 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.24, 12), glass);
  body.position.y = 0.12;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), new THREE.MeshLambertMaterial({ color: 0x3d5a8a }));
  cap.position.y = 0.27;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.08, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xf3efe0 }));
  label.position.y = 0.11;
  group.add(body, cap, label);
  return group;
}

// a fat D-cell battery lying on its side
export function battery() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0x2c2c2c, emissive: 0x111111 }));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 12), new THREE.MeshLambertMaterial({ color: 0xc89a2a, emissive: 0x3a2a08 }));
  band.position.y = 0.035;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8), new THREE.MeshLambertMaterial({ color: 0xb8b8b8 }));
  tip.position.y = 0.066;
  const cell = new THREE.Group();
  cell.add(body, band, tip);
  cell.rotation.z = Math.PI / 2;
  cell.position.y = 0.036;
  group.add(cell);
  return group;
}

// a dark, glossy patch of soaked carpet
export function puddle() {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 18),
    new THREE.MeshPhongMaterial({ color: 0x2a2614, shininess: 90, specular: 0x666650, transparent: true, opacity: 0.75 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.scale.set(1, 0.7 + Math.random() * 0.5, 1);
  return mesh;
}

// wet shoe prints: a pool of small dark ovals moved around as prints appear
export function printPool(size = 120) {
  const geometry = new THREE.CircleGeometry(0.07, 8);
  geometry.scale(1, 1.9, 1);
  const material = new THREE.MeshPhongMaterial({ color: 0x1d1a0d, transparent: true, opacity: 0.7, shininess: 60 });
  const mesh = new THREE.InstancedMesh(geometry, material, size);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

function signTexture(text, color) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 48;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1a0d0b";
  ctx.fillRect(0, 0, 128, 48);
  ctx.fillStyle = color;
  ctx.font = "bold 30px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a door frame full of darkness, with a sign over it. Not a real door - the
// Backrooms don't have real doors out, only places where the level stops.
export function exitDoor(label = "EXIT", color = "#d23a2a") {
  const group = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0x6b5a2c });
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.2), frame);
  left.position.set(-0.55, 1.05, 0);
  const right = left.clone();
  right.position.x = 0.55;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 0.2), frame);
  top.position.set(0, 2.1, 0);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.04), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  dark.position.set(0, 1.02, 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: signTexture(label, color) }));
  sign.position.set(0, 2.38, 0.02);
  const glow = new THREE.PointLight(0xff3020, 0.6, 3, 2);
  glow.position.set(0, 2.3, 0.4);
  group.add(left, right, top, dark, sign, glow);
  // a locked exit: the sign and its glow are dead until the task is done
  group.userData.setLocked = (locked) => {
    sign.material.color.setHex(locked ? 0x2a2420 : 0xffffff);
    glow.intensity = locked ? 0 : 0.6;
  };
  // a back face so it reads from both sides
  const back = dark.clone();
  back.rotation.y = Math.PI;
  group.add(back);
  return group;
}

// a grey breaker box on a wall, lever down until you throw it
export function breakerBox() {
  const group = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x7c7f78 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.12), metal);
  box.position.y = 1.35;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
  const pivot = new THREE.Group();
  pivot.position.set(0, 1.35, 0.08);
  lever.position.y = 0.09;
  pivot.add(lever);
  pivot.rotation.x = Math.PI * 0.75;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5a1010 }));
  lamp.position.set(0.14, 1.56, 0.07);
  group.add(box, pivot, lamp);
  group.userData.setOn = (on) => {
    pivot.rotation.x = on ? Math.PI * 0.25 : Math.PI * 0.75;
    lamp.material.color.setHex(on ? 0x40ff60 : 0x5a1010);
  };
  return group;
}

// a tall metal locker against the wall, its door hanging open: room inside
// for someone crouching, and slats in the door to look out through
export function locker() {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x5d6656, roughness: 0.55, metalness: 0.45 });
  const inside = new THREE.MeshStandardMaterial({ color: 0x14150f, roughness: 0.9, side: THREE.DoubleSide });
  const w = 0.9, h = 2.0, d = 0.6, t = 0.03;
  const panel = (sx, sy, sz, x, y, z, m = paint) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  panel(w, h, t, 0, h / 2, t / 2, inside);            // back
  panel(t, h, d, -w / 2, h / 2, d / 2);               // sides
  panel(t, h, d, w / 2, h / 2, d / 2);
  panel(w, t, d, 0, h, d / 2);                        // top
  panel(w, t, d, 0, 0.01, d / 2, inside);             // floor
  // the door, hinged on the left and standing half open
  const hinge = new THREE.Group();
  hinge.position.set(-w / 2, 0, d);
  hinge.rotation.y = -1.1;
  const door = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.04, t), paint);
  door.position.set(w / 2, h / 2, 0);
  hinge.add(door);
  for (let i = 0; i < 6; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.025, t * 1.4), inside);
    slat.position.set(w / 2, h - 0.25 - i * 0.06, 0);
    hinge.add(slat);
  }
  group.add(hinge);
  return group;
}

// a party balloon resting against the ceiling, string hanging down
export function balloon(color = 0xc8202a) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 }));
  body.scale.y = 1.2;
  body.position.y = WALL_HEIGHT - 0.27;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.3, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
  string.position.y = WALL_HEIGHT - 1.15;
  group.add(body, string);
  return group;
}

// a sheet of paper taped to a wall, with something written on it
export function paperSign(text) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#efe9d8";
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = "#1c1810";
  ctx.font = "bold 54px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 50);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshLambertMaterial({ map: texture }));
  sheet.position.set(0, 1.5, -0.06);
  sheet.rotation.z = 0.04;
  const group = new THREE.Group();
  group.add(sheet);
  return group;
}

// a handwritten note: too small to read from a distance, just lines of ink
export function wallNote(seed = 1) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 80;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e9e2c8";
  ctx.fillRect(0, 0, 64, 80);
  ctx.strokeStyle = "#2a2a5a";
  ctx.lineWidth = 1.6;
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let y = 12; y < 72; y += 8) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    for (let x = 8; x < 56 - rand() * 14; x += 4) ctx.lineTo(x, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), new THREE.MeshLambertMaterial({ map: texture, emissive: 0x1a1810 }));
  sheet.position.set(0, 1.45, -0.06);
  sheet.rotation.z = (rand() - 0.5) * 0.2;
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.025), new THREE.MeshLambertMaterial({ color: 0xd8d0a8, transparent: true, opacity: 0.8 }));
  tape.position.set(0, 1.575, -0.055);
  const group = new THREE.Group();
  group.add(sheet, tape);
  return group;
}

// mounts something flat against the wall on one side of a cell
export function placeOnWall(object, x, y, side) {
  object.position.set((x + 0.5 + side.dx * 0.44) * CELL, 0, (y + 0.5 + side.dy * 0.44) * CELL);
  object.rotation.y = Math.atan2(-side.dx, -side.dy);
  return object;
}

export function placeInCell(object, x, y, rotation = 0) {
  object.position.set((x + 0.5) * CELL, 0, (y + 0.5) * CELL);
  object.rotation.y = rotation;
  return object;
}

export { WALL_HEIGHT };
