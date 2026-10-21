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
