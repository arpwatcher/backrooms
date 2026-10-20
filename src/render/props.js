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
  // a back face so it reads from both sides
  const back = dark.clone();
  back.rotation.y = Math.PI;
  group.add(back);
  return group;
}

export function placeInCell(object, x, y, rotation = 0) {
  object.position.set((x + 0.5) * CELL, 0, (y + 0.5) * CELL);
  object.rotation.y = rotation;
  return object;
}

export { WALL_HEIGHT };
