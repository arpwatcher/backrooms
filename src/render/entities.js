// What the entities look like. Primitives and canvas textures; the horror is
// in proportion, posture and movement more than detail.

import * as THREE from "three";
import { skin, fleshMaterial, lumpy, tube, eyes, twitch } from "./flesh.js";

function grinTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 128);
  // two pinpoint eyes
  for (const x of [88, 168]) {
    const g = ctx.createRadialGradient(x, 30, 0, x, 30, 12);
    g.addColorStop(0, "rgba(255,255,240,1)");
    g.addColorStop(1, "rgba(255,255,240,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, 16, 28, 28);
  }
  // the grin: too wide, too many teeth
  ctx.fillStyle = "rgba(245,245,230,0.95)";
  ctx.beginPath();
  ctx.moveTo(30, 70);
  ctx.quadraticCurveTo(128, 140, 226, 70);
  ctx.quadraticCurveTo(128, 104, 30, 70);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,15,10,0.9)";
  ctx.lineWidth = 2;
  for (let x = 40; x < 220; x += 9) {
    ctx.beginPath();
    const y = 70 + Math.sin(((x - 30) / 196) * Math.PI) * 26;
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let grin = null;

// A shape made of the dark itself, a little taller than you, leaning in.
// What you actually see is the grin: far too wide, every tooth separate and
// faintly lit, and two pale points above it. In the light the body is
// almost nothing; in the dark it's a hole in the room with teeth in it.
export function smilerMesh() {
  const group = new THREE.Group();
  const shade = fleshMaterial({ skin: skin({ base: "#0c0a09", blotch: "rgba(40,10,10,0.5)", veins: "rgba(30,20,40,0.6)", grime: 0.3, seed: "smiler" }), rim: 0x2a1410, rimPower: 1.8, roughness: 0.95 });
  shade.transparent = true;
  const body = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.5, 28, 22), {
    amount: 0.08, scale: 3, seed: 11,
    along: (v) => (v.y < -0.2 ? -0.12 * (-0.2 - v.y) * 4 : 0),
  }), shade);
  body.scale.set(0.85, 2.1, 0.7);
  body.position.y = 1.15;
  group.add(body);
  const face = new THREE.Group();
  face.position.set(0, 1.62, 0.3);
  group.add(face);
  // the grin: two rows of teeth along a wide arc, gums barely there
  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e2cc, emissive: 0x9a9480, emissiveIntensity: 0.55, roughness: 0.35 });
  const gum = new THREE.MeshBasicMaterial({ color: 0x1a0505 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 40, Math.PI * 0.9), gum);
  mouth.rotation.z = Math.PI + Math.PI * 0.05;
  mouth.scale.set(1, 0.55, 0.6);
  face.add(mouth);
  const teeth = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + Math.PI * 0.08 + (i / 25) * Math.PI * 0.84;
    const x = Math.cos(a) * 0.26;
    const y = Math.sin(a) * 0.26 * 0.55;
    for (const row of [1, -1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05 + (i % 3) * 0.008, 4), toothMaterial);
      tooth.position.set(x, y + row * 0.018, 0.02);
      tooth.rotation.z = row > 0 ? Math.PI : 0;
      face.add(tooth);
      teeth.push(tooth);
    }
  }
  const gaze = eyes({ color: 0xf6f2e0, spacing: 0.24, size: 0.016, halo: 0.13, intensity: 1.1 });
  gaze.position.y = 0.2;
  face.add(gaze);
  group.userData.animate = (time, entity, light) => {
    const lit = light === "lit";
    // nearly nothing in the light; a hole in the room in the dark
    shade.opacity = lit ? 0.12 : 0.97;
    toothMaterial.emissiveIntensity = lit ? 0.05 : 0.55;
    gaze.userData.setOpen(lit ? 0.2 : 1);
    const flinch = entity.state === "flinch";
    face.scale.setScalar(flinch ? 0.75 : 1);
    // the grin widens when it gets closer; the whole thing sways and jerks
    const hunting = entity.state === "approach";
    face.scale.x = (flinch ? 0.75 : 1) * (hunting ? 1.25 + Math.sin(time * 3) * 0.05 : 1);
    body.rotation.z = Math.sin(time * 0.7 + entity.id) * 0.05 + twitch(time, entity.id, 1.2, 0.12);
    face.position.x = twitch(time, entity.id + 5, 2.2, 0.06);
    face.rotation.z = twitch(time, entity.id + 9, 0.8, 0.35);
    group.position.y = Math.sin(time * 1.3 + entity.id) * 0.03;
  };
  return group;
}

// Hairless, starved and too long. A spine you can count, ribs pushing
// through grey skin, legs that bend the wrong way, and on the end of a long
// neck a head that is nearly a face: forward eyes, no lips, a jaw that hangs.
export function houndMesh() {
  const group = new THREE.Group();
  const hide = fleshMaterial({ skin: skin({ base: "#8d7f78", blotch: "rgba(90,40,40,0.4)", veins: "rgba(60,50,90,0.45)", grime: 0.6, seed: "hound" }), rim: 0x4a3c30 });
  const dark = fleshMaterial({ skin: skin({ base: "#4a3a36", blotch: "rgba(30,10,10,0.5)", veins: null, grime: 0.8, seed: "hound-dark" }), rim: 0x2a2018 });
  const body = new THREE.Group();
  body.position.y = 0.86;
  group.add(body);
  // the torso: a stretched, lumpy capsule with ribs raised along its middle
  // deep chest in front, a waist pinched to nothing behind it, ribs showing
  const torsoGeometry = lumpy(new THREE.CapsuleGeometry(0.2, 0.85, 8, 20), {
    amount: 0.016, scale: 6, seed: 3,
    along: (v) => {
      const waist = -0.11 * Math.exp(-(((v.y + 0.22) / 0.2) ** 2));
      const chest = 0.05 * Math.exp(-(((v.y - 0.22) / 0.18) ** 2)) * (v.z > 0 ? 1.4 : 0.6);
      const ribs = v.y > -0.05 && v.y < 0.42 ? Math.max(0, Math.sin(v.y * 46)) * 0.02 : 0;
      return waist + chest + ribs;
    },
  });
  const torso = new THREE.Mesh(torsoGeometry, hide);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(0.8, 1, 1.15);
  // shoulder blades riding up under the skin
  for (const x of [-0.1, 0.1]) {
    const blade = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.08, 12, 8), { amount: 0.01, seed: x }), hide);
    blade.scale.set(0.7, 0.4, 1.2);
    blade.position.set(x, 0.17, 0.32);
    body.add(blade);
  }
  body.add(torso);
  // the spine, bead by bead
  for (let i = 0; i < 13; i++) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032 - Math.abs(i - 6) * 0.0015, 8, 6), hide);
    knob.position.set(0, 0.19 - Math.abs(i - 6) * 0.004, -0.58 + i * 0.095);
    body.add(knob);
  }
  // neck and head
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.06, 0.6);
  body.add(neckPivot);
  neckPivot.add(new THREE.Mesh(tube([[0, 0, 0], [0, 0.08, 0.18], [0, 0.04, 0.36]], 0.075, 0.7, 10), hide));
  const head = new THREE.Group();
  head.position.set(0, 0.02, 0.42);
  neckPivot.add(head);
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.17, 24, 18), { amount: 0.012, scale: 9, seed: 7,
    along: (v) => (v.z > 0.08 && Math.abs(v.x) > 0.03 && Math.abs(v.x) < 0.09 && v.y > 0 ? -0.03 : 0) }), hide);
  skull.scale.set(0.9, 0.85, 1.25);
  head.add(skull);
  const gaze = eyes({ color: 0xffe9a8, spacing: 0.11, size: 0.016, halo: 0.2, intensity: 1.4 });
  gaze.position.set(0, 0.04, 0.17);
  head.add(gaze);
  // the jaw, hinged under the skull, with teeth on both rows
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.05, 0.02);
  head.add(jawPivot);
  const jaw = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { amount: 0.008, seed: 2 }), dark);
  jaw.scale.set(0.9, 0.6, 1.4);
  jaw.position.z = 0.06;
  jawPivot.add(jaw);
  const toothMaterial = fleshMaterial({ color: 0xd8cfb4, roughness: 0.4, rim: 0x302820 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 11 - 0.5) * 2.2;
    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.045, 5), toothMaterial);
    upper.position.set(Math.sin(a) * 0.09, -0.04, 0.1 + Math.cos(a) * 0.08);
    upper.rotation.x = Math.PI;
    head.add(upper);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 5), toothMaterial);
    lower.position.set(Math.sin(a) * 0.08, 0.005, 0.08 + Math.cos(a) * 0.07);
    jawPivot.add(lower);
  }
  // legs: two joints each, the back pair bent backwards like a hare's
  const legs = [];
  for (const [x, z, back] of [[-0.15, 0.42, false], [0.15, 0.42, false], [-0.15, -0.44, true], [0.15, -0.44, true]]) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.05, z);
    body.add(hip);
    const thigh = new THREE.Mesh(tube([[0, 0.04, 0], [0, -0.2, back ? -0.14 : 0.07], [0, -0.42, back ? -0.04 : 0.02]], 0.06, 0.5, 8), hide);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, back ? -0.04 : 0.02);
    hip.add(knee);
    const shin = new THREE.Mesh(tube([[0, 0, 0], [0, -0.2, back ? 0.1 : -0.05], [0, -0.38, back ? 0.05 : 0.02]], 0.035, 0.55, 8), hide);
    knee.add(shin);
    // long-fingered feet, almost hands
    for (let f = -1; f <= 1; f++) {
      const finger = new THREE.Mesh(tube([[0, -0.38, 0.04], [f * 0.035, -0.41, 0.1], [f * 0.05, -0.42, 0.16]], 0.012, 0.5, 5), dark);
      knee.add(finger);
    }
    legs.push({ hip, knee, back });
  }
  group.userData.animate = (time, entity) => {
    const hunting = entity.state === "hunt";
    const pace = hunting ? 13 : entity.state === "wander" ? 5 : 0;
    legs.forEach(({ hip, knee, back }, i) => {
      const phase = time * pace + (i % 2 ? Math.PI : 0) + (back ? Math.PI / 2 : 0);
      hip.rotation.x = pace ? Math.sin(phase) * (hunting ? 0.8 : 0.4) : 0;
      knee.rotation.x = pace ? Math.max(0, Math.sin(phase + 1.2)) * (back ? -0.9 : 0.9) : back ? -0.15 : 0.15;
    });
    // low and stretched when it runs; breathing in its ribs when it doesn't
    body.position.y = hunting ? 0.74 + Math.abs(Math.sin(time * pace)) * 0.07 : 0.86;
    body.rotation.x = hunting ? 0.12 : 0;
    torso.scale.x = 0.85 + Math.sin(time * (hunting ? 9 : 2.4)) * 0.03;
    // the head never moves smoothly: it jerks
    neckPivot.rotation.y = entity.state === "sniff" ? Math.sin(time * 6) * 0.5 + twitch(time, entity.id, 4, 0.4) : twitch(time, entity.id, 1.4, 0.5);
    neckPivot.rotation.x = (hunting ? 0.15 : -0.1) + twitch(time, entity.id + 3, 2, 0.25);
    head.rotation.z = twitch(time, entity.id + 7, 0.9, 0.6);
    jawPivot.rotation.x = hunting ? 0.45 + Math.sin(time * 9) * 0.15 : 0.15 + Math.max(0, Math.sin(time * 1.8)) * 0.2;
  };
  return group;
}

// a featureless grey mannequin; every time it has moved unseen, its pose
// is a little different when you look back
export function stillLifeMesh() {
  const group = new THREE.Group();
  const plaster = new THREE.MeshLambertMaterial({ color: 0x9a968c });
  const part = (geometry, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, plaster);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const torso = part(new THREE.CapsuleGeometry(0.16, 0.4, 6, 12), 0, 1.27, 0);
  torso.scale.set(1.2, 1, 0.72);
  const hips = part(new THREE.CapsuleGeometry(0.13, 0.08, 4, 10), 0, 0.9, 0);
  hips.scale.set(1.25, 1, 0.8);
  part(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 6), 0, 1.6, 0);
  const head = part(new THREE.SphereGeometry(0.105, 14, 12), 0, 1.74, 0.01);
  head.scale.set(0.88, 1.28, 1);
  // a default pose that is already slightly wrong
  head.rotation.set(0.18, 0, 0.22);
  const limb = (length) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, length, 6), plaster);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const arms = [limb(0.66), limb(0.66)];
  arms[0].position.set(-0.235, 1.5, 0);
  arms[1].position.set(0.235, 1.5, 0);
  arms[0].rotation.set(0.1, 0, -0.06);
  arms[1].rotation.set(-0.35, 0, 0.1);
  const legs = [limb(0.82), limb(0.82)];
  legs[0].position.set(-0.09, 0.82, 0);
  legs[1].position.set(0.09, 0.82, 0);
  let lastState = "";
  group.userData.animate = (time, entity) => {
    const settled = entity.state === "frozen" || entity.state === "waking";
    if (settled && lastState && lastState !== entity.state && lastState !== "waking") {
      // a new pose, chosen while nobody was looking
      const r = (k) => Math.sin(entity.x * 12.9898 + entity.z * 78.233 + k) * 0.5;
      arms[0].rotation.set(r(1) * 1.6 - 0.4, 0, -0.06 - Math.abs(r(2)) * 0.5);
      arms[1].rotation.set(r(3) * 1.6 - 0.4, 0, 0.06 + Math.abs(r(4)) * 0.5);
      head.rotation.set(r(5) * 0.4, r(6) * 0.8, r(7) * 0.5);
      torso.rotation.z = r(8) * 0.12;
    }
    lastState = entity.state;
  };
  return group;
}

function mothTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 44;
  const g = canvas.getContext("2d");
  const wing = (cx, cy, rx, ry, tilt, shade) => {
    g.fillStyle = shade;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
    g.fill();
  };
  for (const side of [-1, 1]) {
    wing(32 + side * 15, 16, 15, 10, side * 0.5, "#a89c80");
    wing(32 + side * 11, 30, 9, 8, side * -0.4, "#8e8268");
    g.fillStyle = "#3a3226";
    g.beginPath();
    g.arc(32 + side * 17, 15, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#4a4030";
  g.fillRect(30, 8, 4, 28);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// a cloud of pale wings, each on its own wobbling orbit
export function deathmothsMesh() {
  const group = new THREE.Group();
  const count = 46;
  const wing = new THREE.PlaneGeometry(0.13, 0.09);
  const material = new THREE.MeshLambertMaterial({
    map: mothTexture(), side: THREE.DoubleSide, transparent: true, alphaTest: 0.3, emissive: 0x2a2418,
  });
  const moths = new THREE.InstancedMesh(wing, material, count);
  group.add(moths);
  const orbits = Array.from({ length: count }, (_, i) => ({
    radius: 0.25 + ((i * 37) % 11) / 14,
    height: 1.2 + ((i * 53) % 13) / 11,
    speed: 2 + ((i * 29) % 7) / 2,
    phase: i * 2.399,
  }));
  const dummy = new THREE.Object3D();
  group.userData.animate = (time, entity) => {
    const tight = entity.state === "swarm" ? 0.55 : entity.state === "circle" ? 1.3 : 1;
    const lift = entity.state === "circle" ? 0.7 : 0;
    orbits.forEach((o, i) => {
      const a = o.phase + time * o.speed;
      dummy.position.set(Math.cos(a) * o.radius * tight, o.height + lift + Math.sin(time * 7 + o.phase) * 0.12, Math.sin(a * 1.3) * o.radius * tight);
      dummy.rotation.set(-1.2 + Math.sin(time * 34 + i) * 0.7, a, 0);
      dummy.scale.set(0.6 + Math.abs(Math.sin(time * 34 + i)) * 0.4, 1, 1);
      dummy.updateMatrix();
      moths.setMatrixAt(i, dummy.matrix);
    });
    moths.instanceMatrix.needsUpdate = true;
  };
  return group;
}


// A guest who has been at the party far too long. Too tall, waxy yellow
// skin stretched thin, a neck that keeps going, and a face that is all
// smile: carved too wide, with small wet black eyes above it. It holds its
// balloon like it was told to.
export function partygoersMesh() {
  const group = new THREE.Group();
  const wax = fleshMaterial({ skin: skin({ base: "#c9ad3c", blotch: "rgba(150,90,30,0.4)", veins: "rgba(120,80,40,0.3)", grime: 0.35, pores: 0.8, seed: "party" }), roughness: 0.45, rim: 0x5a4a10 });
  const body = new THREE.Mesh(lumpy(new THREE.CapsuleGeometry(0.2, 0.95, 8, 18), { amount: 0.02, scale: 4, seed: 21,
    along: (v) => -0.06 * Math.exp(-(((v.y + 0.1) / 0.18) ** 2)) }), wax);
  body.position.y = 1.08;
  body.scale.set(1, 1, 0.75);
  group.add(body);
  const neck = new THREE.Mesh(tube([[0, 1.6, 0], [0, 1.82, 0.04], [0, 2.02, 0.06]], 0.06, 0.85, 10), wax);
  group.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 2.14, 0.06);
  group.add(head);
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.17, 26, 20), { amount: 0.01, scale: 8, seed: 5,
    along: (v) => (v.z > 0.1 && v.y > 0.02 && v.y < 0.07 && Math.abs(Math.abs(v.x) - 0.06) < 0.03 ? -0.035 : 0) }), wax);
  skull.scale.set(0.95, 1.15, 0.95);
  head.add(skull);
  // small black wet eyes, set in hollows
  const wet = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.08 });
  for (const x of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), wet);
    eye.position.set(x, 0.05, 0.135);
    head.add(eye);
  }
  // the smile, wider than the face
  const gum = new THREE.MeshBasicMaterial({ color: 0x2a0806 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 30, Math.PI * 0.95), gum);
  mouth.rotation.z = Math.PI * 1.025;
  mouth.scale.set(1.15, 0.6, 0.6);
  mouth.position.set(0, -0.02, 0.14);
  head.add(mouth);
  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xf0ead6, roughness: 0.3 });
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 1.05 + (i / 17) * Math.PI * 0.9;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.022, 0.01), toothMaterial);
    tooth.position.set(Math.cos(a) * 0.13 * 1.15, -0.02 + Math.sin(a) * 0.13 * 0.6 + 0.008, 0.15);
    head.add(tooth);
  }
  const arm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.5, 0);
    pivot.add(new THREE.Mesh(tube([[0, 0, 0], [x * 0.2, -0.45, 0.04], [x * 0.15, -0.95, 0.06]], 0.05, 0.55, 8), wax));
    for (let f = 0; f < 4; f++) {
      pivot.add(new THREE.Mesh(tube([[x * 0.15, -0.95, 0.06], [x * 0.15 + (f - 1.5) * 0.015, -1.08, 0.08], [x * 0.15 + (f - 1.5) * 0.02, -1.18, 0.07]], 0.01, 0.6, 5), wax));
    }
    group.add(pivot);
    return pivot;
  };
  const left = arm(-0.27);
  const right = arm(0.27);
  for (const x of [-0.09, 0.09]) group.add(new THREE.Mesh(tube([[x, 0.62, 0], [x, 0.3, 0.02], [x, 0.02, 0]], 0.065, 0.7, 8), wax));
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc8202a, emissive: 0x300508, roughness: 0.25 }));
  balloon.scale.y = 1.2;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.55, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
  group.add(balloon, string);
  group.userData.animate = (time, entity) => {
    const chasing = entity.state === "chase";
    const sway = Math.sin(time * 1.7 + entity.id);
    body.rotation.x = chasing ? 0.28 : 0;
    left.rotation.z = entity.state === "greet" ? -2.6 + Math.sin(time * 12) * 0.5 : -0.05 + sway * 0.05;
    right.rotation.z = 0.05 - sway * 0.05;
    right.rotation.x = chasing ? -1.3 : 0;
    // the head tilts too far and snaps back
    head.rotation.z = Math.sin(time * 0.5 + entity.id) * 0.25 + twitch(time, entity.id, 1.1, 0.5);
    head.rotation.x = twitch(time, entity.id + 2, 0.7, 0.3) + (chasing ? 0.3 : 0);
    head.position.z = 0.06 + (chasing ? 0.25 : 0);
    const bob = Math.sin(time * 2.1 + entity.id) * 0.06;
    balloon.position.set(0.45, 2.75 + bob, 0);
    string.position.set(0.39, 1.75 + bob / 2, 0);
    string.rotation.z = -0.06;
  };
  return group;
}

// an office worker with nothing where the face should be
export function facelingsMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9b3a0 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xd8d6cc });
  const trousers = new THREE.MeshLambertMaterial({ color: 0x2c2c33 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), shirt);
  torso.scale.set(1.15, 1, 0.7);
  torso.position.y = 1.28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
  head.scale.set(0.9, 1.15, 0.98);
  head.position.y = 1.76;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8), skin);
  neck.position.y = 1.62;
  group.add(torso, head, neck);
  const limb = (material, length, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, length, 3, 8), material);
    mesh.position.y = -length / 2 - 0.05;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const arms = [limb(shirt, 0.56, -0.27, 1.5), limb(shirt, 0.56, 0.27, 1.5)];
  const legs = [limb(trousers, 0.72, -0.1, 0.9), limb(trousers, 0.72, 0.1, 0.9)];
  group.userData.animate = (time, entity) => {
    const walking = entity.state === "wander" || entity.state === "offended";
    const pace = entity.state === "offended" ? 11 : 4.5;
    const swing = walking ? Math.sin(time * pace + entity.id) * (entity.state === "offended" ? 0.8 : 0.35) : 0;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.8;
    arms[1].rotation.x = swing * 0.8;
    // when it notices you looking, the blank face tilts, slowly, like it's listening
    head.rotation.z = entity.state === "noticed" ? Math.min(0.5, (entity.stare ?? 0) * 0.2) : 0;
    torso.rotation.x = entity.state === "offended" ? 0.3 : 0;
  };
  return group;
}

// bent double under the ceiling: long legs, a short folded torso, the back
// of its head against the tiles and its face looking out, never down
export function stiltsMesh() {
  const group = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: 0x17161a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8d2c6 });
  const limb = (material, length, radius, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, length, 6), material);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const legs = [limb(suit, 1.75, 0.05, -0.12, 1.75, 0), limb(suit, 1.75, 0.05, 0.12, 1.75, 0)];
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.8, 8), suit);
  torso.position.set(0, 2.08, 0.12);
  torso.rotation.x = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skin);
  head.scale.set(0.85, 1.2, 0.9);
  head.position.set(0, 2.5, 0.36);
  head.rotation.x = 0.35;
  // two dark hollows where the eyes should be
  const socket = new THREE.MeshBasicMaterial({ color: 0x050403 });
  for (const x of [-0.045, 0.045]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), socket);
    eye.position.set(x, 0.02, 0.105);
    head.add(eye);
  }
  const arms = [limb(suit, 1.45, 0.035, -0.24, 2.3, 0.28), limb(suit, 1.45, 0.035, 0.24, 2.3, 0.28)];
  for (const arm of arms) {
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 3, 6), skin);
    hand.position.y = -1.58;
    arm.add(hand);
  }
  group.add(torso, head);
  group.userData.animate = (time, entity) => {
    const pace = entity.state === "stride" ? 5 : entity.state === "patrol" || entity.state === "search" ? 2 : 0;
    const swing = Math.sin(time * pace + entity.id) * (pace ? 0.35 : 0);
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.6 - 0.1;
    arms[1].rotation.x = swing * 0.6 - 0.1;
    // the body walks one way, the head looks wherever it is looking
    const relative = (entity.head ?? 0) - (entity.facing ?? 0);
    head.rotation.z = Math.sin(relative) * 0.6;
    head.position.x = Math.sin(relative) * 0.25;
  };
  return group;
}

// small, pale, on all fours, with arms a little too long
export function hushbabyMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe6d6cc, emissive: 0x1a1210 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 10), skin);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.32, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), skin);
  head.position.set(0, 0.42, 0.3);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: 0x1a0606 }));
  mouth.position.set(0, -0.04, 0.145);
  head.add(mouth);
  group.add(body, head);
  const limbs = [];
  for (const [x, z, length] of [[-0.12, 0.18, 0.5], [0.12, 0.18, 0.5], [-0.11, -0.16, 0.36], [0.11, -0.16, 0.36]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, length, 5), skin);
    limb.position.y = -length / 2;
    pivot.add(limb);
    group.add(pivot);
    limbs.push(pivot);
  }
  group.userData.animate = (time, entity) => {
    // in the wall it is just a voice; you only see it when it comes out
    group.visible = entity.state === "coming";
    const pace = 14;
    limbs.forEach((l, i) => (l.rotation.x = Math.sin(time * pace + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)) * 0.7));
    mouth.scale.setScalar(1 + Math.abs(Math.sin(time * 9)) * 0.8);
  };
  return group;
}

// a janitor in grey overalls and a cap, bent over a mop, a bucket beside him
export function attendantMesh() {
  const group = new THREE.Group();
  const overalls = new THREE.MeshLambertMaterial({ color: 0x55595a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb59a86 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 10), overalls);
  body.position.set(0, 1.15, 0.05);
  body.rotation.x = 0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
  head.position.set(0, 1.62, 0.25);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 12), new THREE.MeshLambertMaterial({ color: 0x2b3a55 }));
  cap.position.set(0, 1.72, 0.25);
  const legs = [-0.09, 0.09].map((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.8, 6), overalls);
    leg.position.set(x, 0.4, 0);
    return leg;
  });
  const mop = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 5), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
  stick.position.y = 0.7;
  const strands = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x9a9480 }));
  strands.position.y = 0.05;
  mop.add(stick, strands);
  mop.position.set(0.15, 0, 0.55);
  mop.rotation.x = -0.45;
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 12), new THREE.MeshLambertMaterial({ color: 0xb8a020 }));
  bucket.position.set(-0.4, 0.15, 0.2);
  group.add(body, head, cap, ...legs, mop, bucket);
  group.userData.animate = (time, entity) => {
    const pace = entity.state === "follow" ? 6 : 2.2;
    mop.position.x = 0.15 + Math.sin(time * pace + entity.id) * 0.25;
    mop.rotation.z = Math.sin(time * pace + entity.id) * 0.3;
    head.rotation.y = Math.sin(time * 0.4) * 0.3;
  };
  return group;
}

// the edge of the dark: a column of black that the light doesn't reach into
export function deadlineMesh() {
  const group = new THREE.Group();
  for (const [radius, opacity] of [[1.25, 0.35], [0.95, 0.6], [0.6, 0.9]]) {
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 2.7, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
    );
    shell.position.y = 1.35;
    group.add(shell);
  }
  group.userData.animate = (time, entity) => {
    group.visible = entity.state === "coming";
    group.children.forEach((shell, i) => shell.scale.setScalar(1 + Math.sin(time * (1.3 + i * 0.4)) * 0.06));
  };
  return group;
}

export const MESHES = {
  deadline: deadlineMesh,
  attendant: attendantMesh,
  hushbaby: hushbabyMesh,
  stilts: stiltsMesh,
  facelings: facelingsMesh,
  smiler: smilerMesh, hounds: houndMesh, stillLife: stillLifeMesh, deathmoths: deathmothsMesh, partygoers: partygoersMesh,
};
