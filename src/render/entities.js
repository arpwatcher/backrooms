// What the entities look like. Primitives and canvas textures; the horror is
// in proportion, posture and movement more than detail.

import * as THREE from "three";
import { skin, fleshMaterial, lumpy, tube, eyes, twitch, smoke } from "./flesh.js";
import { modelInstance } from "./models.js";

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
  // not a body: a darkness the shape of one, with no edge. A small dense
  // core, then soft sheets of black smoke round it, always turned to you,
  // thinning to nothing at the rim, so the light finds no surface on it
  const body = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.5, 28, 22), {
    amount: 0.08, scale: 3, seed: 11,
    along: (v) => (v.y < -0.2 ? -0.12 * (-0.2 - v.y) * 4 : 0),
  }), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true }));
  body.scale.set(0.34, 1.3, 0.3);
  body.position.y = 1.2;
  group.add(body);
  const veil = new THREE.Group();
  veil.position.y = 1.2;
  group.add(veil);
  const softEdge = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        // tall and soft: a body-shaped falloff, heavier toward the floor
        const dx = (x - 31.5) / 31.5, dy = (y - 31.5) / 31.5;
        const v = Math.max(0, 1 - Math.hypot(dx * (1.1 + Math.max(0, -dy) * 0.4), dy)) ** 1.4 * 255;
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  })();
  const sheets = [0, 1, 2, 3].map((i) => {
    const map = smoke(`smiler-${i % 2}`).clone();
    map.needsUpdate = true;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.5 - i * 0.12, 2.6 - i * 0.15), new THREE.MeshBasicMaterial({ map, alphaMap: softEdge, color: 0x000000, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    // in front of the core, behind the face
    sheet.position.z = 0.24 - i * 0.04;
    veil.add(sheet);
    return { sheet, map, speed: (i % 2 ? -1 : 1) * (0.04 + i * 0.015) };
  });
  const face = new THREE.Group();
  face.position.set(0, 1.62, 0.3);
  group.add(face);
  // the grin: two rows of teeth along a wide arc, gums barely there
  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e2cc, emissive: 0x9a9480, emissiveIntensity: 0.55, roughness: 0.35 });
  // wet dark gums with a dull red shine
  const gum = new THREE.MeshStandardMaterial({ color: 0x2a0606, emissive: 0x1a0202, roughness: 0.15 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 40, Math.PI * 0.9), gum);
  mouth.rotation.z = Math.PI + Math.PI * 0.05;
  mouth.scale.set(1, 0.55, 0.6);
  face.add(mouth);
  // no two teeth alike: long and short, leaning, some yellowed
  const yellowed = toothMaterial.clone();
  yellowed.color.setHex(0xc9b98a);
  const teeth = [];
  const jag = (i, k) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + Math.PI * 0.08 + (i / 25) * Math.PI * 0.84;
    const x = Math.cos(a) * 0.26;
    const y = Math.sin(a) * 0.26 * 0.55;
    for (const row of [1, -1]) {
      const length = 0.035 + jag(i, row) * 0.045;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.011 + jag(i, row + 3) * 0.008, length, 4), jag(i, row + 5) > 0.7 ? yellowed : toothMaterial);
      tooth.position.set(x, y + row * 0.018, 0.02);
      tooth.rotation.z = (row > 0 ? Math.PI : 0) + (jag(i, row + 7) - 0.5) * 0.5;
      tooth.userData.row = row;
      tooth.userData.y = tooth.position.y;
      face.add(tooth);
      teeth.push(tooth);
    }
  }
  // behind the teeth, a throat that goes back further than the head does
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  throat.scale.set(1, 0.25, 0.3);
  throat.position.set(0, -0.12, -0.01);
  face.add(throat);
  const gaze = eyes({ color: 0xf6f2e0, spacing: 0.24, size: 0.016, halo: 0.13, intensity: 1.1 });
  gaze.position.y = 0.2;
  face.add(gaze);
  group.userData.animate = (time, entity, light) => {
    // the veil churns, and always faces you (the group faces the player)
    for (const { map, speed } of sheets) {
      map.offset.x = time * speed;
      map.offset.y = Math.sin(time * 0.4 + speed * 30) * 0.05;
    }
    const lit = light === "lit";
    // nearly nothing in the light; a hole in the room in the dark
    body.material.opacity = lit ? 0.1 : 0.97;
    sheets.forEach(({ sheet }) => (sheet.material.opacity = lit ? 0.08 : 0.8));
    toothMaterial.emissiveIntensity = lit ? 0.05 : 0.55;
    gaze.userData.setOpen(lit ? 0.2 : 1);
    const flinch = entity.state === "flinch";
    face.scale.setScalar(flinch ? 0.75 : 1);
    // the grin widens when it gets closer; the whole thing sways and jerks
    const hunting = entity.state === "approach";
    face.scale.x = (flinch ? 0.75 : 1) * (hunting ? 1.25 + Math.sin(time * 3) * 0.05 : 1);
    body.rotation.z = Math.sin(time * 0.7 + entity.id) * 0.05 + twitch(time, entity.id, 1.2, 0.12);
    veil.rotation.z = body.rotation.z * 0.6;
    face.position.x = twitch(time, entity.id + 5, 2.2, 0.06);
    // closing in, the jaws part: the lower teeth drop away from the upper
    const gape = hunting ? 0.03 + Math.max(0, Math.sin(time * 1.7 + entity.id)) * 0.06 : 0;
    for (const t of teeth) t.position.y = t.userData.y - (t.userData.row < 0 ? gape : 0);
    throat.scale.y = 0.25 + gape * 6;
    yellowed.emissiveIntensity = toothMaterial.emissiveIntensity;
    face.rotation.z = twitch(time, entity.id + 9, 0.8, 0.35);
    group.position.y = Math.sin(time * 1.3 + entity.id) * 0.03;
  };
  return group;
}

// Hairless, starved and too long. A spine you can count, ribs pushing
// through grey skin, legs that bend the wrong way, and on the end of a long
// neck a head that is nearly a face: forward eyes, no lips, a jaw that hangs.
function houndBody() {
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

// A shop mannequin in cracked plaster: ball joints at the shoulders, elbows
// and knees, a carved face with two small painted eyes. It is never seen
// moving. Each time you look back its pose is a little different, and its
// head is turned a little more toward you.
function stillLifeBody() {
  const group = new THREE.Group();
  const plaster = fleshMaterial({ skin: skin({ base: "#b8b2a4", blotch: "rgba(110,95,70,0.35)", veins: "rgba(40,34,28,0.75)", grime: 0.55, pores: 0.2, seed: "plaster" }), roughness: 0.82, rim: 0x3a3630, normalScale: 1.2 });
  const joint = (x, y, z, r = 0.05) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), plaster);
    ball.position.set(x, y, z);
    return ball;
  };
  // a sphere stretched into a torso (capsule caps smear the painted cracks)
  const torso = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.2, 28, 24), { amount: 0.004, scale: 5, seed: 61,
    along: (v) => -0.035 * Math.exp(-(((v.y + 0.08) / 0.07) ** 2)) }), plaster);
  torso.position.y = 1.27;
  torso.scale.set(1.05, 1.65, 0.7);
  group.add(torso);
  const hips = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.16, 16, 12), { amount: 0.004 }), plaster);
  hips.scale.set(1.15, 0.7, 0.8);
  hips.position.y = 0.92;
  group.add(hips);
  group.add(new THREE.Mesh(tube([[0, 1.55, 0], [0, 1.63, 0.01]], 0.04, 0.9, 8), plaster));
  const head = new THREE.Group();
  head.position.set(0, 1.75, 0.01);
  group.add(head);
  // a carved face: brow, a straight nose, closed lips
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.105, 28, 22), {
    amount: 0.002, scale: 10, seed: 63,
    along: (v) => {
      if (v.z < 0.04) return 0;
      const brow = Math.exp(-(((v.y - 0.035) / 0.012) ** 2)) * (Math.abs(v.x) < 0.06 ? 0.008 : 0);
      const socket = Math.exp(-(((Math.abs(v.x) - 0.035) / 0.018) ** 2 + ((v.y - 0.015) / 0.013) ** 2)) * -0.01;
      const nose = Math.exp(-((v.x / 0.01) ** 2 + ((v.y + 0.005) / 0.025) ** 2)) * 0.016;
      const lips = Math.exp(-((v.x / 0.025) ** 2 + ((v.y + 0.045) / 0.008) ** 2)) * 0.006;
      return brow + socket + nose + lips;
    },
  }), plaster);
  skull.scale.set(0.88, 1.22, 0.98);
  head.add(skull);
  const paint = new THREE.MeshBasicMaterial({ color: 0x1a1612 });
  for (const x of [-0.033, 0.033]) {
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.008, 10), paint);
    pupil.position.set(x, 0.018, 0.096);
    pupil.rotation.y = x * 4;
    head.add(pupil);
  }
  // segmented limbs: upper, a ball joint, lower
  const limb = (x, y, upper, lower, r) => {
    const top = new THREE.Group();
    top.position.set(x, y, 0);
    top.add(joint(0, 0, 0, r * 1.15));
    top.add(new THREE.Mesh(tube([[0, 0, 0], [0, -upper, 0]], r, 0.85, 8), plaster));
    const mid = new THREE.Group();
    mid.position.y = -upper;
    mid.add(joint(0, 0, 0, r));
    mid.add(new THREE.Mesh(tube([[0, 0, 0], [0, -lower, 0]], r * 0.9, 0.75, 8), plaster));
    top.add(mid);
    group.add(top);
    return { top, mid };
  };
  const arms = [limb(-0.25, 1.5, 0.3, 0.3, 0.04), limb(0.25, 1.5, 0.3, 0.3, 0.04)];
  const legs = [limb(-0.09, 0.86, 0.42, 0.42, 0.055), limb(0.09, 0.86, 0.42, 0.42, 0.055)];
  // a default pose that is already slightly wrong
  head.rotation.set(0.18, 0, 0.22);
  arms[1].top.rotation.x = -0.35;
  arms[1].mid.rotation.x = -0.5;
  let lastState = "";
  group.userData.animate = (time, entity) => {
    const settled = entity.state === "frozen" || entity.state === "waking";
    if (settled && lastState && lastState !== entity.state && lastState !== "waking") {
      // a new pose, chosen while nobody was looking
      const r = (k) => Math.sin(entity.x * 12.9898 + entity.z * 78.233 + k) * 0.5;
      arms.forEach((a, i) => {
        a.top.rotation.set(r(1 + i) * 2 - 0.5, 0, (i ? 1 : -1) * Math.abs(r(3 + i)) * 0.6);
        a.mid.rotation.x = -Math.abs(r(5 + i)) * 1.6;
      });
      legs[0].mid.rotation.x = Math.abs(r(7)) * 0.4;
      head.rotation.set(r(8) * 0.5, r(9) * 1.2, r(10) * 0.6);
      torso.rotation.z = r(11) * 0.15;
    }
    lastState = entity.state;
  };
  return group;
}

// a moth seen from above: swept forewings with veins and a dark band, small
// rounded hindwings, a furred body, and on its back the pale skull mark of a
// death's-head moth
function mothTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 88;
  const g = canvas.getContext("2d");
  for (const side of [-1, 1]) {
    const x = (v) => 64 + side * v;
    // hindwing, under the forewing
    g.fillStyle = "#7e6e52";
    g.beginPath();
    g.moveTo(x(4), 40);
    g.quadraticCurveTo(x(40), 44, x(36), 66);
    g.quadraticCurveTo(x(20), 80, x(4), 58);
    g.fill();
    g.fillStyle = "#3a2e20";
    g.beginPath();
    g.ellipse(x(24), 60, 7, 4, side * 0.4, 0, Math.PI * 2);
    g.fill();
    // forewing: swept back to a point
    g.fillStyle = "#a6987a";
    g.beginPath();
    g.moveTo(x(4), 22);
    g.quadraticCurveTo(x(34), 6, x(62), 20);
    g.lineTo(x(58), 30);
    g.quadraticCurveTo(x(30), 46, x(4), 44);
    g.fill();
    // a dark band across it and the veins
    g.strokeStyle = "rgba(50,38,26,0.8)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x(30), 14);
    g.quadraticCurveTo(x(36), 28, x(26), 42);
    g.stroke();
    g.strokeStyle = "rgba(60,48,34,0.55)";
    g.lineWidth = 1;
    for (const [ex, ey] of [[60, 21], [54, 30], [44, 36], [34, 41]]) {
      g.beginPath();
      g.moveTo(x(6), 30);
      g.quadraticCurveTo(x(ex * 0.5), 26, x(ex), ey);
      g.stroke();
    }
  }
  // furred body
  g.fillStyle = "#3e3224";
  g.beginPath();
  g.ellipse(64, 46, 6, 24, 0, 0, Math.PI * 2);
  g.fill();
  // the skull on its back
  g.fillStyle = "#d8cca8";
  g.beginPath();
  g.ellipse(64, 30, 4.5, 5.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#2a2018";
  for (const dx of [-2, 2]) g.fillRect(64 + dx - 1, 29, 2, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// a cloud of pale wings, each on its own wobbling orbit
export function deathmothsMesh() {
  const group = new THREE.Group();
  const count = 46;
  const wing = new THREE.PlaneGeometry(0.17, 0.117);
  const material = new THREE.MeshLambertMaterial({
    map: mothTexture(), side: THREE.DoubleSide, transparent: true, alphaTest: 0.3, emissive: 0x5c5638,
  });
  const moths = new THREE.InstancedMesh(wing, material, count);
  group.add(moths);
  // furred bodies under the wings, and the dust they shed
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.008, 0.03, 3, 6), new THREE.MeshLambertMaterial({ color: 0x3a3226 }), count);
  group.add(bodies);
  const dustCount = 160;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = ((i * 73) % 100) / 50 - 1;
    dustPositions[i * 3 + 1] = 0.8 + ((i * 37) % 100) / 60;
    dustPositions[i * 3 + 2] = ((i * 91) % 100) / 50 - 1;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  // the dust glows faintly, like the powder off a real moth's wing in a beam,
  // so in the dark the swarm is a drifting smear of pale light before it is moths
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xe6dcae, size: 0.02, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(dust);
  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 64;
  const hc = haloCanvas.getContext("2d");
  const grad = hc.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(230,220,170,0.55)");
  grad.addColorStop(1, "rgba(230,220,170,0)");
  hc.fillStyle = grad;
  hc.fillRect(0, 0, 64, 64);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
  halo.scale.set(2.2, 1.6, 1);
  halo.position.y = 1.6;
  group.add(halo);
  const orbits = Array.from({ length: count }, (_, i) => ({
    radius: 0.25 + ((i * 37) % 11) / 14,
    height: 1.2 + ((i * 53) % 13) / 11,
    speed: 2 + ((i * 29) % 7) / 2,
    phase: i * 2.399,
    // most are the size of a thumb; every seventh is as big as a hand, and
    // those are the ones you see coming
    size: i % 7 === 0 ? 2.8 : 0.9 + ((i * 17) % 5) / 10,
  }));
  const dummy = new THREE.Object3D();
  group.userData.animate = (time, entity) => {
    const tight = entity.state === "swarm" ? 0.55 : entity.state === "circle" ? 1.3 : 1;
    const lift = entity.state === "circle" ? 0.7 : 0;
    orbits.forEach((o, i) => {
      const a = o.phase + time * o.speed;
      dummy.position.set(Math.cos(a) * o.radius * tight, o.height + lift + Math.sin(time * 7 + o.phase) * 0.12, Math.sin(a * 1.3) * o.radius * tight);
      dummy.rotation.set(-1.2 + Math.sin(time * 34 + i) * 0.7, a, 0);
      // the big ones beat slower
      const beat = Math.abs(Math.sin(time * (o.size > 2 ? 14 : 34) + i));
      dummy.scale.set((0.6 + beat * 0.4) * o.size, o.size, o.size);
      dummy.updateMatrix();
      moths.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(o.size * 0.6, o.size, o.size * 0.6);
      dummy.rotation.set(Math.PI / 2, a, 0);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
    });
    moths.instanceMatrix.needsUpdate = true;
    bodies.instanceMatrix.needsUpdate = true;
    // the dust drifts down slowly and spins with the swarm
    dust.rotation.y = time * 0.3;
    dust.position.y = -((time * 0.05) % 0.4);
    dust.scale.setScalar(tight);
    // the glow breathes with the beat of their wings
    halo.material.opacity = 0.25 + Math.abs(Math.sin(time * 3.1)) * 0.15;
    halo.scale.set(2.2 * tight, 1.6 * tight, 1);
  };
  return group;
}


// Distance actually covered, for legs: a stride that matches the ground
// going by, so nothing walks on the spot or slides with its feet still.
function gait() {
  let lx = null, lz = 0, lt = 0, stride = 0, speed = 0;
  return (time, e) => {
    if (lx !== null) {
      const d = Math.hypot(e.x - lx, e.z - lz);
      const dt = time - lt;
      // a jump (retreat, teleport) or a paused clock is not a step
      if (dt > 0 && d < 2) {
        stride += d;
        speed += (d / dt - speed) * Math.min(1, dt * 8);
      }
    }
    lx = e.x;
    lz = e.z;
    lt = time;
    return { stride, speed };
  };
}

// a leg on a hip pivot with a knee pivot under it, built from absolute
// points [hip, knee, ankle] so the meshes can be made as before
function leg(parent, hip, knee, ankle, { thigh, shin, material, foot }) {
  const hipPivot = new THREE.Group();
  hipPivot.position.set(...hip);
  parent.add(hipPivot);
  const rel = (p, o) => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  hipPivot.add(new THREE.Mesh(tube([[0, 0, 0], rel(mid(hip, knee), hip), rel(knee, hip)], thigh, 0.75, 10), material));
  const kneePivot = new THREE.Group();
  kneePivot.position.set(...rel(knee, hip));
  hipPivot.add(kneePivot);
  kneePivot.add(new THREE.Mesh(tube([[0, 0, 0], rel(mid(knee, ankle), knee), rel(ankle, knee)], shin, 0.75, 10), material));
  foot.position.set(...rel(ankle, knee));
  foot.position.y -= 0.01;
  foot.position.z += 0.06;
  kneePivot.add(foot);
  return { hip: hipPivot, knee: kneePivot };
}
// swing a pair of legs: hips forward and back, the trailing knee bent
function walk(legs, stride, amount, rate = 3.2) {
  const swing = Math.sin(stride * rate) * amount;
  legs[0].hip.rotation.x = swing;
  legs[1].hip.rotation.x = -swing;
  legs[0].knee.rotation.x = Math.max(0, -swing) * 1.4;
  legs[1].knee.rotation.x = Math.max(0, swing) * 1.4;
  return swing;
}

// A guest who has been at the party far too long. Too tall, waxy yellow
// skin stretched thin, a neck that keeps going, and a face that is all
// smile: carved too wide, with small wet black eyes above it. It holds its
// balloon like it was told to.
export function partygoersMesh() {
  const group = new THREE.Group();
  // wax, not skin: smooth, a little shiny, run in places like a candle
  const wax = fleshMaterial({ skin: skin({ base: "#b49b3c", blotch: "rgba(96,60,22,0.6)", veins: "rgba(110,70,40,0.3)", grime: 0.6, pores: 0.15, seed: "party" }), roughness: 0.3, rim: 0x5a4a10 });
  const body = new THREE.Mesh(lumpy(new THREE.CapsuleGeometry(0.2, 0.72, 8, 18), { amount: 0.02, scale: 4, seed: 21,
    along: (v) => -0.06 * Math.exp(-(((v.y + 0.05) / 0.16) ** 2)) }), wax);
  body.position.y = 1.36;
  body.scale.set(1, 1, 0.75);
  group.add(body);
  const neck = new THREE.Mesh(tube([[0, 1.78, 0], [0, 1.98, 0.04], [0, 2.18, 0.06]], 0.06, 0.85, 10), wax);
  group.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 2.3, 0.06);
  group.add(head);
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.17, 26, 20), { amount: 0.01, scale: 8, seed: 5,
    along: (v) => (v.z > 0.1 && v.y > 0.02 && v.y < 0.07 && Math.abs(Math.abs(v.x) - 0.06) < 0.03 ? -0.035 : 0) }), wax);
  skull.scale.set(0.95, 1.15, 0.95);
  head.add(skull);
  // too big for the neck, so the face can be read from across a room
  head.scale.setScalar(1.3);
  // a paper party hat, pushed over to one side, the elastic cutting in
  const hatTexture = (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#d8d0c0" : "#a8222a";
      g.fillRect(i * 8, 0, 8, 64);
    }
    g.fillStyle = "rgba(40,30,10,0.35)";
    for (let i = 0; i < 30; i++) g.fillRect((i * 37) % 64, (i * 23) % 64, 3, 2);
    return new THREE.CanvasTexture(c);
  })();
  hatTexture.colorSpace = THREE.SRGBColorSpace;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 18, 1, true), new THREE.MeshStandardMaterial({ map: hatTexture, roughness: 0.85, side: THREE.DoubleSide }));
  hat.position.set(0.05, 0.25, -0.01);
  hat.rotation.z = -0.35;
  head.add(hat);
  const elastic = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.003, 4, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0x1a1610 }));
  // ear to ear under the jaw
  elastic.rotation.z = Math.PI;
  elastic.scale.set(1.08, 2.15, 1);
  elastic.position.set(0, 0.12, -0.03);
  head.add(elastic);
  // small black wet eyes, set in hollows
  // the eyes don't match: one higher and bigger, both just wet black holes
  const wet = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.08 });
  for (const [x, y, r] of [[-0.065, 0.06, 0.034], [0.06, 0.035, 0.024]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), wet);
    eye.position.set(x, y, 0.135);
    head.add(eye);
    // and something black has run out of both, down to the smile
    head.add(new THREE.Mesh(tube([[x, y - r * 0.6, 0.14], [x * 1.05, y - 0.05, 0.14], [x * 1.1, y - 0.1, 0.125]], r * 0.32, 0.5, 5), wet));
  }
  // the smile, ear to ear, cut into the face along the skull
  const onFace = (x, y, out = 0) => {
    const rx = 0.17 * 0.95, ry = 0.17 * 1.15;
    return [x, y, rx * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2)) + out];
  };
  const smileAt = (t, out) => {
    const a = Math.PI * (1.04 + t * 0.92);
    return onFace(Math.cos(a) * 0.14, -0.025 + Math.sin(a) * 0.075, out);
  };
  const gum = new THREE.MeshBasicMaterial({ color: 0x2a0806 });
  head.add(new THREE.Mesh(tube(Array.from({ length: 13 }, (_, i) => smileAt(i / 12, -0.004)), 0.02, 1, 8), gum));
  // the teeth catch what little light there is: the smile is what you see first
  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xf0ead6, emissive: 0x3a3426, roughness: 0.3 });
  // too many small teeth in it
  for (let i = 0; i < 30; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.018, 0.01), toothMaterial);
    tooth.position.set(...smileAt(i / 29, 0.006));
    tooth.position.y += 0.008;
    tooth.lookAt(tooth.position.clone().multiplyScalar(2));
    head.add(tooth);
  }
  // wax running off the chin and down the body
  for (const [x, y, z, len] of [[0.03, -0.17, 0.08, 0.07], [-0.05, -0.15, 0.1, 0.05], [0.12, -0.04, 0.11, 0.04]]) {
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), wax);
    drip.scale.set(1, len / 0.012, 1);
    drip.position.set(x, y - len / 2, z);
    head.add(drip);
  }
  for (const [x, y] of [[0.1, 1.62], [-0.12, 1.4], [0.05, 1.05]]) {
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), wax);
    drip.scale.set(1, 4.5, 0.8);
    drip.position.set(x, y, 0.15);
    group.add(drip);
  }
  const arm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.7, 0);
    // a rounded shoulder, a full upper arm, an elbow, a long forearm
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), wax);
    shoulder.scale.set(1, 0.8, 0.9);
    pivot.add(shoulder);
    pivot.add(new THREE.Mesh(tube([[0, 0, 0], [x * 0.12, -0.3, 0.02], [x * 0.18, -0.6, 0.04]], 0.075, 0.75, 10), wax));
    pivot.add(new THREE.Mesh(tube([[x * 0.18, -0.6, 0.04], [x * 0.19, -0.9, 0.07], [x * 0.17, -1.15, 0.08]], 0.058, 0.7, 10), wax));
    for (let f = 0; f < 4; f++) {
      pivot.add(new THREE.Mesh(tube([[x * 0.17, -1.15, 0.08], [x * 0.17 + (f - 1.5) * 0.016, -1.28, 0.1], [x * 0.17 + (f - 1.5) * 0.022, -1.4, 0.09]], 0.012, 0.6, 5), wax));
    }
    group.add(pivot);
    return pivot;
  };
  const left = arm(-0.27);
  const right = arm(0.27);
  // long legs: thick thighs into the hips, knees, thin shins, flat feet
  const legs = [-0.1, 0.1].map((x) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), wax);
    foot.scale.set(0.9, 0.5, 2);
    return leg(group, [x, 1.0, 0], [x * 1.05, 0.46, 0.04], [x, 0.04, 0], { thigh: 0.095, shin: 0.062, material: wax, foot });
  });
  const steps = gait();
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc8202a, emissive: 0x300508, roughness: 0.25 }));
  balloon.scale.y = 1.2;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.55, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
  group.add(balloon, string);
  // what the death screen frames
  group.userData.face = head;
  group.userData.animate = (time, entity) => {
    const chasing = entity.state === "chase";
    const sway = Math.sin(time * 1.7 + entity.id);
    // stiff long strides, too even, like being walked by something else
    const { stride, speed } = steps(time, entity);
    walk(legs, stride, Math.min(0.55, speed * 0.2), 2.6);
    body.rotation.x = chasing ? 0.28 : 0;
    left.rotation.z = entity.state === "greet" ? -2.6 + Math.sin(time * 12) * 0.5 : -0.05 + sway * 0.05;
    right.rotation.z = 0.05 - sway * 0.05;
    right.rotation.x = chasing ? -1.3 : 0;
    left.rotation.x = chasing ? -1.1 + Math.sin(time * 9) * 0.15 : 0;
    if (chasing) left.rotation.z = -0.05;
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

// An office worker with nothing where the face should be: not a mask, just
// skin, with shallow dips where the eyes would go and a ridge where a nose
// tried to grow. Creased shirt, stained trousers, arms a little too long.
export function facelingsBody() {
  const group = new THREE.Group();
  const flesh = fleshMaterial({ skin: skin({ base: "#c4ab98", blotch: "rgba(150,80,80,0.3)", veins: "rgba(90,80,140,0.25)", grime: 0.25, pores: 0.7, seed: "faceling" }), roughness: 0.55, rim: 0x3a3028 });
  const shirt = fleshMaterial({ skin: skin({ base: "#b4b2a6", blotch: "rgba(120,110,70,0.3)", veins: null, grime: 0.25, pores: 0, seed: "shirt" }), roughness: 0.9, rim: 0x202020, normalScale: 0.6 });
  const trousers = fleshMaterial({ skin: skin({ base: "#26262c", blotch: "rgba(10,10,10,0.4)", veins: null, grime: 0.6, pores: 0, seed: "trousers" }), roughness: 0.95, rim: 0x151515 });
  // a chest that tapers to a waist, shoulders squared under the shirt
  const torso = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.2, 28, 24), {
    amount: 0.004, scale: 5, seed: 31,
    along: (v) => {
      const waist = -0.05 * Math.exp(-(((v.y + 0.11) / 0.06) ** 2));
      const chest = 0.025 * Math.exp(-(((v.y - 0.06) / 0.06) ** 2)) * (v.z > 0 ? 1 : 0.4);
      const shoulders = v.y > 0.12 ? 0.03 * Math.min(1, Math.abs(v.x) / 0.15) : 0;
      return waist + chest + shoulders;
    },
  }), shirt);
  torso.scale.set(1.1, 1.55, 0.68);
  torso.position.y = 1.27;
  group.add(torso);
  const belt = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.16, 20, 12), { amount: 0.003 }), trousers);
  belt.scale.set(1.15, 0.55, 0.78);
  belt.position.y = 0.96;
  group.add(belt);
  group.add(new THREE.Mesh(tube([[0, 1.52, 0], [0, 1.6, 0.01], [0, 1.7, 0.02]], 0.055, 0.85, 10), flesh));
  // shoulders, so the arms hang from something
  for (const x of [-0.22, 0.22]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), shirt);
    shoulder.scale.set(1.1, 0.8, 0.9);
    shoulder.position.set(x, 1.5, 0);
    group.add(shoulder);
  }
  const head = new THREE.Group();
  head.position.y = 1.77;
  group.add(head);
  // the face that isn't: shallow hollows for eyes, a ridge, no mouth
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.115, 28, 22), {
    amount: 0.004, scale: 10, seed: 13,
    along: (v) => {
      if (v.z < 0.05) return 0;
      const eye = Math.exp(-(((Math.abs(v.x) - 0.04) / 0.022) ** 2 + ((v.y - 0.02) / 0.017) ** 2)) * -0.028;
      const nose = Math.exp(-((v.x / 0.012) ** 2 + ((v.y + 0.01) / 0.03) ** 2)) * 0.016;
      const cheek = Math.exp(-(((Math.abs(v.x) - 0.055) / 0.02) ** 2 + ((v.y + 0.01) / 0.02) ** 2)) * 0.008;
      // a jaw and a chin where a mouth should be, closed over
      const jaw = v.y < -0.03 ? Math.exp(-((v.x / 0.05) ** 2)) * 0.012 : 0;
      return eye + nose + cheek + jaw;
    },
  }), flesh);
  skull.scale.set(0.86, 1.2, 1);
  head.add(skull);
  // ears, because a person has them
  for (const x of [-0.1, 0.1]) {
    const ear = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.02, 8, 6), { amount: 0.003 }), flesh);
    ear.scale.set(0.5, 1.4, 0.9);
    ear.position.set(x, 0.0, -0.005);
    head.add(ear);
  }
  const limb = (material, points, radius) => {
    const pivot = new THREE.Group();
    pivot.position.set(...points[0]);
    pivot.add(new THREE.Mesh(tube(points.map(([x, y, z]) => [x - points[0][0], y - points[0][1], z - points[0][2]]), radius, 0.7, 8), material));
    group.add(pivot);
    return pivot;
  };
  const arms = [limb(shirt, [[-0.25, 1.5, 0], [-0.28, 1.12, 0.02], [-0.29, 0.7, 0.04]], 0.05), limb(shirt, [[0.25, 1.5, 0], [0.28, 1.12, 0.02], [0.29, 0.7, 0.04]], 0.05)];
  for (const arm of arms) {
    const hand = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.045, 10, 8), { amount: 0.006, seed: 2 }), flesh);
    hand.scale.set(0.7, 1.6, 0.5);
    hand.position.set(arm.position.x < 0 ? -0.04 : 0.04, -0.86, 0.04);
    arm.add(hand);
  }
  const legs = [limb(trousers, [[-0.1, 0.92, 0], [-0.1, 0.48, 0.02], [-0.1, 0.04, 0]], 0.07), limb(trousers, [[0.1, 0.92, 0], [0.1, 0.48, 0.02], [0.1, 0.04, 0]], 0.07)];
  group.userData.animate = (time, entity) => {
    const walking = entity.state === "wander" || entity.state === "offended";
    const offended = entity.state === "offended";
    const swing = walking ? Math.sin(time * (offended ? 11 : 4.5) + entity.id) * (offended ? 0.8 : 0.3) : 0;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.7 + (offended ? -0.9 : 0);
    arms[1].rotation.x = swing * 0.7 + (offended ? -0.9 : 0);
    // noticed: the blank face turns to you and tilts, slowly, like listening;
    // offended: it shakes, fast and small
    const stare = entity.stare ?? 0;
    head.rotation.z = entity.state === "noticed" ? Math.min(0.55, stare * 0.22) : twitch(time, entity.id, 0.6, 0.15);
    head.rotation.y = offended ? Math.sin(time * 40) * 0.08 : 0;
    torso.rotation.x = offended ? 0.3 : 0;
  };
  return group;
}

// Bent double under the ceiling: legs far too long in a black suit, a short
// folded torso, arms hanging past its knees on fingers longer than hands,
// and a pale stretched head pressed up against the tiles, looking out with
// two pin-points of light. It never looks down.
function stiltsBody() {
  const group = new THREE.Group();
  const suit = fleshMaterial({ skin: skin({ base: "#18171b", blotch: "rgba(40,36,30,0.5)", veins: null, grime: 0.5, pores: 0, seed: "suit" }), roughness: 0.85, rim: 0x2a2830, rimPower: 2 });
  const pale = fleshMaterial({ skin: skin({ base: "#d2cabf", blotch: "rgba(140,100,100,0.35)", veins: "rgba(90,90,140,0.5)", grime: 0.35, pores: 0.2, seed: "stilts-skin" }), roughness: 0.55, rim: 0x5a5048 });
  const limb = (material, points, radius, taper = 0.7) => new THREE.Mesh(tube(points, radius, taper, 8), material);
  const legs = [-0.12, 0.12].map((x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 1.78, 0);
    hip.add(limb(suit, [[0, 0, 0], [0, -0.45, 0.04], [0, -0.9, 0.02]], 0.055));
    const knee = new THREE.Group();
    knee.position.set(0, -0.9, 0.02);
    knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), suit));
    knee.add(limb(suit, [[0, 0, 0], [0, -0.45, -0.03], [0, -0.86, 0]], 0.042));
    const shoe = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.06, 10, 8), { amount: 0.005 }), suit);
    shoe.scale.set(0.8, 0.5, 2.2);
    shoe.position.set(0, -0.88, 0.07);
    knee.add(shoe);
    hip.add(knee);
    group.add(hip);
    return { hip, knee };
  });
  const torso = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.2, 20, 16), { amount: 0.01, seed: 71 }), suit);
  torso.scale.set(1.05, 1.9, 0.7);
  torso.position.set(0, 2.08, 0.14);
  torso.rotation.x = 0.55;
  group.add(torso);
  const neck = new THREE.Group();
  neck.position.set(0, 2.42, 0.32);
  group.add(neck);
  neck.add(limb(pale, [[0, 0, 0], [0, 0.07, 0.06], [0, 0.1, 0.13]], 0.04, 0.9));
  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.2);
  neck.add(head);
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.12, 24, 20), {
    amount: 0.004, seed: 73,
    along: (v) => {
      if (v.z < 0.04) return 0;
      const socket = Math.exp(-(((Math.abs(v.x) - 0.04) / 0.02) ** 2 + ((v.y - 0.02) / 0.02) ** 2)) * -0.03;
      const cheek = Math.exp(-(((Math.abs(v.x) - 0.05) / 0.02) ** 2 + ((v.y + 0.03) / 0.02) ** 2)) * -0.015;
      return socket + cheek;
    },
  }), pale);
  skull.scale.set(0.85, 1.35, 0.95);
  head.add(skull);
  const gaze = eyes({ color: 0xfff6d8, spacing: 0.08, size: 0.008, halo: 0.08, intensity: 1.2 });
  gaze.position.set(0, 0.02, 0.1);
  head.add(gaze);
  const arms = [-0.24, 0.24].map((x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 2.32, 0.28);
    shoulder.add(limb(suit, [[0, 0, 0], [x * 0.15, -0.55, 0.05], [x * 0.1, -1.05, 0.08]], 0.035));
    const hand = new THREE.Group();
    hand.position.set(x * 0.1, -1.05, 0.08);
    for (let f = 0; f < 5; f++) {
      const spread = (f - 2) * 0.018;
      hand.add(limb(pale, [[spread, 0, 0], [spread * 1.4, -0.14, 0.02], [spread * 1.6, -0.3, 0.01]], 0.008, 0.6));
    }
    shoulder.add(hand);
    group.add(shoulder);
    return { shoulder, hand };
  });
  group.userData.animate = (time, entity) => {
    const pace = entity.state === "stride" ? 5 : entity.state === "patrol" || entity.state === "search" ? 2 : 0;
    const swing = Math.sin(time * pace + entity.id) * (pace ? 0.4 : 0);
    legs[0].hip.rotation.x = swing;
    legs[1].hip.rotation.x = -swing;
    legs.forEach((l, i) => (l.knee.rotation.x = pace ? Math.max(0, Math.sin(time * pace + entity.id + (i ? Math.PI : 0))) * 0.5 : 0.05));
    arms[0].shoulder.rotation.x = -swing * 0.6;
    arms[1].shoulder.rotation.x = swing * 0.6;
    arms.forEach((a, i) => (a.hand.rotation.x = Math.sin(time * 0.8 + i) * 0.15 + twitch(time, entity.id + i * 3, 1.5, 0.4)));
    // the body walks one way, the head looks wherever it's looking - in jerks
    const relative = (entity.head ?? 0) - (entity.facing ?? 0);
    neck.rotation.y = Math.sin(relative) * 0.9 + twitch(time, entity.id, 0.9, 0.12);
    head.rotation.z = Math.sin(relative) * 0.4 + 0.3;
    gaze.userData.setOpen(entity.state === "notice" || entity.state === "stride" ? 1.6 : 1);
  };
  return group;
}

// Something that was nearly a baby. Pale grey and too thin, on all fours on
// arms far too long, a head too big for the neck, black hollows for eyes and
// a mouth that opens much further than a mouth should.
export function hushbabyMesh() {
  const group = new THREE.Group();
  // dead-infant skin: grey going blue, bruised purple at the joints, wet
  const pale = fleshMaterial({ skin: skin({ base: "#b3a29f", blotch: "rgba(96,40,78,0.55)", veins: "rgba(60,72,150,0.75)", grime: 0.45, pores: 0.08, seed: "hush2" }), roughness: 0.36, rim: 0x6a6480, rimPower: 2.2 });
  const raw = fleshMaterial({ skin: skin({ base: "#4e1c1e", blotch: "rgba(20,4,8,0.7)", veins: null, grime: 0.3, pores: 0.2, seed: "hushraw" }), roughness: 0.3, rim: 0x3a1418 });
  const black = new THREE.MeshBasicMaterial({ color: 0x020101 });
  // a fat little body held up on arms far too long for it, elbows high over
  // its back like a spider's, the legs dragged behind
  const body = new THREE.Group();
  body.position.y = 0.46;
  group.add(body);
  const torso = new THREE.Mesh(lumpy(new THREE.CapsuleGeometry(0.17, 0.26, 8, 18), { amount: 0.012, scale: 7, seed: 41,
    // a swollen belly underneath, and creases of fat across it
    along: (v) => (v.z < 0 ? Math.max(0, -v.z - 0.06) * 0.35 : 0) + (Math.abs(v.y) < 0.16 ? -Math.max(0, Math.sin(v.y * 44)) * 0.008 : 0) }), pale);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  // the cord, still on it, trailing on the carpet
  body.add(new THREE.Mesh(tube([[0, -0.17, 0.02], [0.03, -0.36, -0.1], [-0.05, -0.45, -0.4], [0.06, -0.45, -0.75]], 0.018, 0.7, 7), raw));
  // the neck reaches forward and down, and the head hangs from it upside down
  body.add(new THREE.Mesh(tube([[0, 0.05, 0.2], [0, 0.03, 0.36], [0, -0.06, 0.46]], 0.055, 0.75, 8), pale));
  const head = new THREE.Group();
  head.position.set(0, -0.12, 0.56);
  body.add(head);
  // too big for the body, like a newborn's, and wrinkled from screaming
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.21, 28, 22), { amount: 0.01, scale: 8, seed: 43,
    along: (v) => {
      if (v.z < 0.05) return 0;
      const socket = Math.exp(-(((Math.abs(v.x) - 0.075) / 0.04) ** 2 + ((v.y - 0.04) / 0.03) ** 2)) * -0.05;
      const brow = v.y > 0.08 && v.y < 0.16 ? Math.max(0, Math.sin(v.y * 160)) * -0.006 : 0;
      const cheek = Math.exp(-(((Math.abs(v.x) - 0.1) / 0.05) ** 2 + ((v.y + 0.05) / 0.05) ** 2)) * 0.02;
      return socket + brow + cheek;
    } }), pale);
  skull.scale.set(1, 1.05, 0.95);
  head.add(skull);
  // eyes all black and wet, too big, with a point of light on each
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.044, 14, 10), new THREE.MeshStandardMaterial({ color: 0x050405, roughness: 0.05, metalness: 0.3 }));
    eye.scale.set(1.25, 0.8, 0.6);
    eye.position.set(x, 0.04, 0.17);
    head.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), shine);
    glint.position.set(x + 0.012, 0.05, 0.193);
    head.add(glint);
  }
  // the mouth: screaming, wider than the face has room for, raw gums round it
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.09, 0.17);
  head.add(mouth);
  const hole = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), black);
  hole.scale.set(1.2, 1.3, 0.5);
  const gum = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.016, 8, 24), raw);
  gum.scale.set(1.15, 1.25, 1);
  gum.position.z = 0.01;
  mouth.add(hole, gum);
  const tooth = new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.35 });
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.02, 5), tooth);
    const a = i < 2 ? Math.PI * (0.38 + i * 0.24) : Math.PI * (1.4 + (i - 2) * 0.2);
    t.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.07, 0.02);
    t.rotation.z = a + Math.PI / 2;
    mouth.add(t);
  }
  // a few wet strands of hair on the soft skull
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.3 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const x = Math.cos(a) * 0.08, z = Math.sin(a) * 0.08 - 0.04;
    head.add(new THREE.Mesh(tube([[x, 0.19, z], [x * 1.6, 0.17, z * 1.4], [x * 2, 0.08, z * 1.7]], 0.004, 0.5, 4), hair));
  }
  const knob = (at, r = 0.035) => {
    const k = new THREE.Mesh(lumpy(new THREE.SphereGeometry(r, 10, 8), { amount: 0.005, seed: at[0] * 100 }), pale);
    k.position.set(...at);
    return k;
  };
  const limbs = [];
  // arms: up to an elbow above its back, down to a second joint, then the hand
  const arm = (s) => [[0, 0, 0], [s * 0.32, 0.36, 0.06], [s * 0.46, 0.02, 0.22], [s * 0.4, -0.44, 0.34]];
  // legs: chubby, folded, dragged
  const leg = (s) => [[0, 0, 0], [s * 0.16, -0.2, -0.12], [s * 0.12, -0.42, -0.34]];
  for (const [s, z, front] of [[-1, 0.12, true], [1, 0.12, true], [-1, -0.16, false], [1, -0.16, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.13, 0.02, z);
    const path = front ? arm(s) : leg(s);
    pivot.add(new THREE.Mesh(tube(path, front ? 0.036 : 0.06, front ? 0.55 : 0.7, 8), pale));
    if (front) pivot.add(knob(path[1]), knob(path[2], 0.028));
    const end = path[path.length - 1];
    // long fingers splayed on the carpet
    if (front) for (let f = -2; f <= 2; f++) pivot.add(new THREE.Mesh(tube([end, [end[0] + f * 0.022, end[1] - 0.015, end[2] + 0.05], [end[0] + f * 0.04, end[1] - 0.03, end[2] + 0.12]], 0.007, 0.5, 4), pale));
    else pivot.add(knob(end, 0.045));
    body.add(pivot);
    limbs.push(pivot);
  }
  // what the death screen frames
  group.userData.face = head;
  const steps = gait();
  group.userData.animate = (time, entity) => {
    // in the wall it is only a voice; you see it when it comes out
    group.visible = entity.state === "coming";
    // it crawls in fits: a burst of limbs, a freeze, a burst; the limbs go
    // as fast as the floor goes by, scrabbling, too many steps for the ground
    const { stride, speed } = steps(time, entity);
    const burst = (Math.sin(time * 2.3 + entity.id) > -0.2 ? 1 : 0.15) * Math.min(1, speed / 1.5);
    const phase = stride * 9;
    limbs.forEach((l, i) => (l.rotation.x = burst * Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)) * (i > 1 ? 0.2 : 0.45)));
    body.position.y = 0.46 + burst * Math.abs(Math.sin(phase)) * 0.03;
    body.rotation.z = burst * Math.sin(phase * 0.5) * 0.06;
    // upside down, never still, and now and then it turns all the way over
    const roll = Math.sin(time * 0.7 + entity.id) > 0.93 ? Math.PI : 0;
    head.rotation.z = Math.PI + roll + twitch(time, entity.id, 2.4, 0.5);
    head.rotation.x = -0.5 + twitch(time, entity.id + 1, 1.7, 0.3);
    const open = 1 + Math.abs(Math.sin(time * 7)) * 0.6;
    mouth.scale.set(1, open, 1);
  };
  return group;
}

// A janitor in stained overalls, bent over his mop. His head hangs forward
// on a neck bent further than a neck should, the cap's peak hiding where the
// face would be. When he's following a trail the head comes up a little, and
// under the peak there is nothing but dark.
export function attendantMesh() {
  const group = new THREE.Group();
  const overalls = fleshMaterial({ skin: skin({ base: "#5d6864", blotch: "rgba(40,50,30,0.55)", veins: null, grime: 0.85, pores: 0, seed: "overalls" }), roughness: 0.92, rim: 0x2c3436 });
  const flesh = fleshMaterial({ skin: skin({ base: "#9a8478", blotch: "rgba(110,60,60,0.4)", veins: "rgba(70,60,100,0.4)", grime: 0.5, pores: 0.3, seed: "janitor" }), roughness: 0.6, rim: 0x2a2018 });
  // everything turns together: on a trail he comes backwards, his back to you
  const rig = new THREE.Group();
  group.add(rig);
  const body = new THREE.Group();
  rig.add(body);
  // a hump of a back, bent over the mop for longer than anyone remembers
  const torso = new THREE.Mesh(lumpy(new THREE.CapsuleGeometry(0.21, 0.5, 6, 14), { amount: 0.012, scale: 5, seed: 51,
    along: (v) => (v.y > 0.05 && v.z < 0 ? 0.08 * Math.min(1, (v.y - 0.05) / 0.2) * Math.min(1, -v.z / 0.15) : 0) }), overalls);
  torso.position.set(0, 1.36, 0.1);
  torso.rotation.x = 0.55;
  torso.scale.set(1.2, 1, 0.85);
  body.add(torso);
  // the bib of the overalls, its straps, and a name patch nobody can read
  const bib = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.16, 14, 10), { amount: 0.006, seed: 52 }), overalls);
  bib.scale.set(1.15, 1.3, 0.45);
  bib.position.set(0, 1.42, 0.3);
  bib.rotation.x = 0.55;
  body.add(bib);
  for (const x of [-0.1, 0.1]) body.add(new THREE.Mesh(tube([[x, 1.5, 0.34], [x * 1.3, 1.66, 0.22], [x * 1.4, 1.62, -0.06], [x * 1.2, 1.3, -0.16]], 0.018, 1, 5), fleshMaterial({ color: 0x2e3432, roughness: 0.9 })));
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.04), new THREE.MeshStandardMaterial({ color: 0xa8a290, roughness: 0.9 }));
  patch.position.set(-0.08, 1.47, 0.37);
  patch.rotation.x = -0.9;
  body.add(patch);
  // the neck bends forward and down, too far
  const neck = new THREE.Group();
  neck.position.set(0, 1.68, 0.3);
  body.add(neck);
  neck.add(new THREE.Mesh(tube([[0, 0, 0], [0, 0.04, 0.08], [0, -0.04, 0.16]], 0.05, 0.85, 8), flesh));
  const head = new THREE.Group();
  head.position.set(0, -0.08, 0.2);
  neck.add(head);
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.12, 18, 14), { amount: 0.008, seed: 3 }), flesh);
  skull.scale.set(0.9, 1.1, 0.95);
  head.add(skull);
  // no face: a hole where it should be, going back into the head, and at the
  // bottom of it two dull points that might be eyes
  const void_ = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  void_.scale.set(1, 1.15, 0.7);
  void_.position.set(0, -0.01, 0.075);
  head.add(void_);
  for (const x of [-0.025, 0.025]) {
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0x7a1408 }));
    glint.position.set(x, 0.005, 0.1);
    head.add(glint);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16), fleshMaterial({ color: 0x1e2a40, roughness: 0.8, rim: 0x101820 }));
  cap.position.y = 0.09;
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.12), fleshMaterial({ color: 0x18223a, roughness: 0.8 }));
  peak.position.set(0, 0.06, 0.13);
  head.add(cap, peak);
  // long thin legs with a knee that bends a little the wrong way
  const boot = fleshMaterial({ color: 0x17140f, roughness: 0.6, rim: 0x101010 });
  const legs = [-0.11, 0.11].map((x) => {
    const foot = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.07, 10, 8), { amount: 0.005 }), boot);
    foot.scale.set(0.9, 0.6, 1.7);
    const l = leg(body, [x, 1.14, 0.02], [x, 0.6, -0.06], [x, 0.08, 0.02], { thigh: 0.075, shin: 0.055, material: overalls, foot });
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), overalls);
    l.knee.add(knee);
    return l;
  });
  const steps = gait();
  // arms down to the mop handle, too long
  const arms = [-0.24, 0.24].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.56, 0.26);
    // arms down past his knees to the mop
    // a shoulder, an upper arm to a sharp elbow, a long thin forearm
    const shoulder = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.075, 12, 10), { amount: 0.006 }), overalls);
    pivot.add(shoulder);
    const elbow = [x * 0.35, -0.46, 0.16], wrist = [-x * 0.4, -0.97, 0.42];
    pivot.add(new THREE.Mesh(tube([[0, 0, 0], [x * 0.25, -0.24, 0.06], elbow], 0.055, 0.75, 8), overalls));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), overalls);
    knob.position.set(...elbow);
    pivot.add(knob);
    pivot.add(new THREE.Mesh(tube([elbow, [x * 0.05, -0.72, 0.3], wrist], 0.036, 0.7, 8), flesh));
    const hand = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.042, 10, 8), { amount: 0.006 }), flesh);
    hand.scale.set(0.8, 1.2, 0.6);
    hand.position.set(wrist[0], wrist[1] - 0.04, wrist[2]);
    pivot.add(hand);
    // long knuckly fingers curled round the handle
    for (let f = 0; f < 4; f++) {
      const y = wrist[1] - 0.04 - f * 0.022;
      pivot.add(new THREE.Mesh(tube([[wrist[0], y, wrist[2] + 0.02], [wrist[0] - x * 0.15, y - 0.01, wrist[2] + 0.06], [wrist[0] - x * 0.22, y - 0.02, wrist[2] + 0.01]], 0.008, 0.6, 4), flesh));
    }
    body.add(pivot);
    return pivot;
  });
  const mop = new THREE.Group();
  mop.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.7, 12), fleshMaterial({ color: 0x6a5232, roughness: 0.7 })));
  mop.children[0].position.y = 0.85;
  const strands = new THREE.Mesh(lumpy(new THREE.CylinderGeometry(0.1, 0.2, 0.16, 14, 2, true), { amount: 0.03, scale: 12, seed: 9 }), fleshMaterial({ skin: skin({ base: "#6f6a58", blotch: "rgba(50,45,20,0.6)", veins: null, grime: 0.9, pores: 0, seed: "mop" }), roughness: 1, side: THREE.DoubleSide }));
  strands.position.y = 0.07;
  mop.add(strands);
  mop.position.set(0, 0, 0.62);
  mop.rotation.x = -0.35;
  rig.add(mop);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 14), fleshMaterial({ skin: skin({ base: "#6a5a1a", blotch: "rgba(30,25,5,0.6)", veins: null, grime: 0.8, pores: 0, seed: "bucket" }), roughness: 0.5, rim: 0x2a2408 }));
  bucket.position.set(-0.45, 0.15, 0.25);
  rig.add(bucket);
  // what the death screen frames
  group.userData.face = head;
  group.userData.animate = (time, entity) => {
    const following = entity.state === "follow";
    const pace = following ? 6 : 2.2;
    // a short dragging shuffle, the boots barely leaving the floor
    const { stride, speed } = steps(time, entity);
    walk(legs, stride, Math.min(0.3, speed * 0.15), 4.2);
    mop.position.x = Math.sin(time * pace + entity.id) * 0.25;
    mop.rotation.z = Math.sin(time * pace + entity.id) * 0.3;
    arms.forEach((arm) => (arm.rotation.z = Math.sin(time * pace + entity.id) * 0.25));
    // hanging head; on a trail it turns right round over his shoulder to
    // look back along it, at you, while his hands keep mopping
    neck.rotation.x = following ? 0.15 + twitch(time, entity.id, 1.3, 0.15) : 0.75 + twitch(time, entity.id, 0.5, 0.1);
    rig.rotation.y = following ? Math.PI : 0;
    neck.rotation.y = following ? Math.PI * 0.82 + twitch(time, entity.id + 2, 0.8, 0.12) : 0;
    head.rotation.z = following ? Math.PI * 0.12 + Math.sin(time * 0.9) * 0.12 : 0.35;
    // caught you (the death screen): turned to you, the head come right up,
    // and nothing under the cap but the two points
    if (entity.state === "caught") {
      neck.rotation.x = -0.35 + twitch(time, entity.id, 1.3, 0.1);
      head.rotation.z = 0.25 + Math.sin(time * 0.9) * 0.08;
    }
    body.rotation.y = twitch(time, entity.id + 4, 0.6, 0.15);
  };
  return group;
}

// The edge of the dark: a wall of black smoke rolling forward, thicker at
// the bottom, and now and then the shape of a person standing inside it,
// gone again before you're sure.
export function deadlineMesh() {
  const group = new THREE.Group();
  const layers = [];
  // how much of each sheet shows: [across, up] -> 0..1; soft at the top, so
  // the dark has no edge, and fading toward you on the crawling sheets
  const fade = (fn) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const v = Math.max(0, Math.min(1, fn(x / 63, 1 - y / 63))) * 255;
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  };
  const softTop = fade((u, v) => Math.min(1, (1 - v) / 0.3));
  const toward = fade((u, v) => Math.min(1, (1 - v) / 0.9) ** 1.5);
  const sheet = (w, h, seed, opacity, alphaMap, repeat) => {
    const map = smoke(seed).clone();
    map.needsUpdate = true;
    map.repeat.set(...repeat);
    const material = new THREE.MeshBasicMaterial({ map, alphaMap, color: 0x000000, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, fog: false });
    return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(w, h, 24, 1), material), map };
  };
  // the dark itself: a dozen sheets of smoke one behind another, each thin,
  // so it thickens the further in you look and has no surface to it. Wider
  // than any corridor and taller than the ceiling; the walls cut it to the
  // opening and the ceiling hides its top.
  for (let i = 0; i < 12; i++) {
    const depth = -0.2 - i * 0.42;
    const { mesh, map } = sheet(12, 4.2, `deadline-${i % 4}`, 0.42 + i * 0.05, softTop, [2.2 + (i % 3) * 0.4, 1]);
    // a slow bulge toward you in the middle
    const pos = mesh.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.cos((pos.getX(k) / 12) * Math.PI) * 0.4);
    mesh.position.set(0, 1.9, depth);
    group.add(mesh);
    layers.push({ map, speed: (i % 2 ? -1 : 1) * (0.03 + (i % 5) * 0.02), shell: mesh, sway: 0.3 });
  }
  // past those, nothing at all
  const behind = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide }));
  behind.position.set(0, 2.5, -5.4);
  group.add(behind);
  // and it gets to you first along the floor and the ceiling: black smoke
  // crawling out ahead of the wall, thinning as it reaches
  for (const [y, flip] of [[0.03, 1], [2.66, -1]]) {
    const { mesh, map } = sheet(12, 3, `deadline-crawl-${y}`, 0.85, toward, [3, 1.2]);
    mesh.rotation.x = -Math.PI / 2 * flip;
    mesh.position.set(0, y, 1.3 * 1);
    if (flip < 0) mesh.rotation.z = Math.PI;
    group.add(mesh);
    layers.push({ map, speed: 0.06 * flip, shell: mesh, sway: 0, crawl: true });
  }
  // figures in the smoke: black silhouettes that fade in and out
  const figures = [0, 1].map((i) => {
    const figure = facelingsBody();
    figure.traverse((o) => {
      if (o.material) {
        o.material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
      }
    });
    figure.position.set(i ? 0.6 : -0.5, 0, i ? -0.3 : 0.4);
    figure.scale.setScalar(1.05);
    group.add(figure);
    return figure;
  });
  // only when it has you: two dull points where the first one's eyes are
  const gaze = eyes({ color: 0xb8a890, spacing: 0.07, size: 0.007, halo: 0.07, intensity: 0.8 });
  gaze.position.set(0, 1.8, 0.11);
  gaze.visible = false;
  figures[0].add(gaze);
  group.userData.animate = (time, entity) => {
    group.visible = entity.state === "coming";
    for (const { map, speed, shell, sway, crawl } of layers) {
      map.offset.x = time * speed;
      // the crawling smoke rolls toward you; the rest churns in place
      map.offset.y = crawl ? -time * 0.08 : Math.sin(time * 0.3 + speed * 10) * 0.05;
      shell.position.x = Math.sin(time * 0.4 + speed * 20) * sway;
    }
    // caught you (the death screen): the first of them is right at the edge
    // of the dark, in front of you, looking
    const caught = entity.state === "caught";
    group.visible ||= caught;
    gaze.visible = caught;
    if (caught) figures[0].position.set(0, 0, 0.9);
    figures.forEach((figure, i) => {
      const show = caught && i === 0 ? 1 : Math.max(0, Math.sin(time * 0.35 + i * 2.4) - 0.6) * 2.2;
      figure.traverse((o) => {
        if (o.material) o.material.opacity = Math.min(0.9, show);
      });
      figure.rotation.y = caught && i === 0 ? 0 : Math.sin(time * 0.2 + i) * 0.6;
    });
  };
  return group;
}

// Laid over a model's own clip: now and then the head snaps to one side,
// holds, and comes back, the way nothing with working muscles moves.
// `bones` are tried in order (rigs name their head differently).
function headJerks(bones = ["Head", "head"], size = 0.35, rate = 1.2) {
  // if the clip doesn't move the bone itself, last frame's jerk is still on
  // it: take that off first, or they would pile up and turn the head round
  let base = null;
  let last = null;
  return (time, entity, bone) => {
    const head = bones.map((n) => bone(n)).find(Boolean);
    if (!head) return;
    if (last && head.quaternion.equals(last)) head.quaternion.copy(base);
    base = head.quaternion.clone();
    head.rotateZ(twitch(time, entity.id ?? 1, rate, size));
    head.rotateX(twitch(time, (entity.id ?? 1) + 7, rate * 0.7, size * 0.6));
    last = head.quaternion.clone();
  };
}

// the hound is a real model now (assets/models/hound.glb, by bitkiln): a
// skinned dog, all muscle and teeth (and a black-skinned one beside it
// in a pack). It walks while it wanders, stops to
// howl when it hears you, and runs flat out once it hunts. Without the
// model it is the procedural starved thing above.
// every other hound in a pack is the black one, a little smaller
let houndsMade = 0;
export function houndMesh() {
  const hound = modelInstance(houndsMade++ % 2 ? "houndBlack" : "hound", {
    clipFor: (e) => (e.state === "hunt" ? "run" : e.state === "sniff" ? "howl" : e.state === "wander" ? "walk" : "idle"),
    // legs that match the ground: the run is cut for about 4.2 m/s, the
    // walk for about 1.3 (a held pose, the death screen, keeps its pace)
    speedFor: (e, speed) => (e.posing ? (e.state === "hunt" ? 1.1 : 1) : e.state === "hunt" ? Math.min(1.6, Math.max(0.5, (speed / 4.2) * 1.1)) : e.state === "wander" ? Math.min(1.4, Math.max(0.4, speed / 1.3)) : 1),
  });
  if (!hound) return houndBody();
  // eyeshine: a dog's eyes throw your light back, green-gold, out of the
  // dark long before the rest of it shows. Set at the rest pose in the
  // model's own space, then carried on the head bone.
  const head = hound.userData.bone("Head");
  if (head) {
    const shine = eyes({ color: 0xd8f0a0, spacing: 0.075, size: 0.011, halo: 0.1, intensity: 1.3 });
    hound.updateMatrixWorld(true);
    const at = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    shine.position.set(at.x, at.y + HOUND_EYES.up, at.z + HOUND_EYES.forward);
    hound.add(shine);
    head.attach(shine);
    const animate = hound.userData.animate;
    hound.userData.animate = (time, entity) => {
      animate(time, entity);
      // brightest when it has you; a slow blink while it listens
      shine.userData.setOpen(entity.state === "hunt" ? 1 : Math.sin(time * 0.9 + entity.id * 3) > -0.85 ? 0.7 : 0);
    };
  }
  return hound;
}
// where the eyes sit from the head bone, in metres, model facing +z
export const HOUND_EYES = { up: 0.06, forward: 0.14 };

// the Facelings are a real model now (assets/models/facelings.glb: "The
// Wrapped" by codyanka, CC0): a person bound in grey cloth from head to
// foot, nothing where the face should be. It walks nervously, stands and
// watches, and once offended it runs at you, flailing.
export function facelingsMesh() {
  return modelInstance("facelings", {
    clipFor: (e) => (e.state === "offended" ? "run" : e.state === "wander" ? "walk" : "idle"),
    speedFor: (e) => (e.state === "wander" ? 0.8 : 1),
    pose: (time, entity, bone) => {
      // noticed: the blank head turns to you and tilts, slowly, like listening
      if (entity.state === "noticed") bone("head")?.rotateZ(Math.min(0.5, (entity.stare ?? 0) * 0.2));
    },
  }) ?? facelingsBody();
}

// Still Life is a real model now (assets/models/stilllife.glb: burning_barb's
// prototyping mannequin, CC0, rigged here) in the same cracked plaster. It
// is never seen moving: each time it settles after being unwatched, every
// joint has a new angle and the head is turned a little more your way.
export function stillLifeMesh() {
  // older and dirtier than the procedural one: it has stood here for years
  const plaster = fleshMaterial({ skin: skin({ base: "#9a9282", blotch: "rgba(80,62,40,0.55)", veins: "rgba(30,24,18,0.85)", grime: 0.95, pores: 0.35, seed: "plaster-old" }), roughness: 0.88, rim: 0x3a3630, normalScale: 1.6 });
  const joints = fleshMaterial({ skin: skin({ base: "#4a4238", blotch: "rgba(30,20,12,0.6)", veins: null, grime: 1, seed: "plaster-joint" }), roughness: 0.7, rim: 0x2a2620 });
  let pose = { arms: [[-0.2, 0.1, -0.5], [-0.6, -0.1, -0.9]], head: [0.18, 0.3, 0.22], knee: 0.1, lean: 0.04 };
  let lastState = null;
  const model = modelInstance("stillLife", {
    pose: (time, entity, bone) => {
      const settled = entity.state === "frozen" || entity.state === "waking";
      if (settled && lastState && lastState !== entity.state && lastState !== "waking") {
        const r = (k) => Math.sin(entity.x * 12.9898 + entity.z * 78.233 + k) * 0.5;
        pose = {
          arms: [0, 1].map((i) => [r(1 + i) * 1.6 - 0.3, r(3 + i) * 0.5, -Math.abs(r(5 + i)) * 1.6]),
          // the head turns further than a neck should, and tips over
          head: [r(8) * 0.6, r(9) * 3.4, r(10) * 1.1],
          knee: Math.abs(r(7)) * 0.5,
          lean: r(11) * 0.15,
        };
      }
      lastState = entity.state;
      // from its T-pose the arms come down to its sides, then into the pose
      pose.arms.forEach(([swing, out, bend], i) => {
        const side = i ? "R" : "L";
        bone(`upper_arm.${side}`)?.rotateZ((i ? 1 : -1) * (1.25 - out)).rotateX(swing);
        bone(`forearm.${side}`)?.rotateX(bend);
      });
      bone("head")?.rotation.set(...pose.head);
      bone("shin.L")?.rotateX(pose.knee);
      bone("spine")?.rotateZ(pose.lean);
    },
  });
  if (!model) return stillLifeBody();
  model.traverse((o) => {
    if (o.isMesh) o.material = o.material.name === "joint_mat" ? joints : plaster;
  });
  return model;
}

// Stilts is a real model now (assets/models/stilts.glb: Noah Summers'
// slender man, CC0): too tall for the room, a suit, no face at all. It has
// no clips, so its walk is made here: long slow steps, arms that hang and
// barely swing, and a head that turns on its own, in jerks, toward wherever
// it is looking. When it notices you it stops and the head tilts.
export function stiltsMesh() {
  const steps = gait();
  return modelInstance("stilts", {
    pose: (time, entity, bone) => {
      // long slow steps, as many as the ground going by needs
      const { stride, speed } = steps(time, entity);
      const pace = Math.min(1, speed / 1.2);
      const phase = stride * 1.5 + entity.id;
      const step = Math.sin(phase);
      const lift = (side) => Math.max(0, Math.sin(phase + (side ? Math.PI : 0)));
      bone("thigh.L")?.rotateX(step * 0.32 * pace);
      bone("thigh.R")?.rotateX(-step * 0.32 * pace);
      bone("shin.L")?.rotateX(-lift(0) * 0.55 * pace);
      bone("shin.R")?.rotateX(-lift(1) * 0.55 * pace);
      // the model stands in an A-pose: bring the arms in to hang by its sides
      bone("upper_arm.L")?.rotateZ(-0.55).rotateX(-step * 0.12 * pace + twitch(time, entity.id, 0.3, 0.04));
      bone("upper_arm.R")?.rotateZ(0.55).rotateX(step * 0.12 * pace + twitch(time, entity.id + 1, 0.3, 0.04));
      bone("forearm.L")?.rotateX(0.12 + twitch(time, entity.id + 4, 0.8, 0.06));
      bone("forearm.R")?.rotateX(0.12 + twitch(time, entity.id + 5, 0.8, 0.06));
      // the head looks where it looks, not where the body walks
      const relative = (entity.head ?? 0) - (entity.facing ?? 0);
      bone("neck")?.rotateY(Math.sin(relative) * 0.5 + twitch(time, entity.id + 2, 0.7, 0.12));
      bone("head")?.rotateZ(entity.state === "notice" ? 0.45 : twitch(time, entity.id + 3, 0.5, 0.1));
      bone("chest")?.rotateX(Math.sin(time * 0.9 + entity.id) * 0.02 + (entity.state === "notice" ? 0.12 : 0));
    },
  }) ?? stiltsBody();
}

// the Wretch is a real model (assets/models/creature.glb, CC0) with its own
// walk, run and idle; if the model didn't load it falls back to a dark
// figure built from the faceling's body
export function wretchMesh() {
  const model = modelInstance("creature", {
    clipFor: (e) => (e.state === "chase" ? "run" : e.state === "search" || e.state === "investigate" || e.state === "wander" ? "walk" : "idle"),
    speedFor: (e) => (e.state === "chase" ? 1.15 : e.state === "wander" ? 0.7 : 1),
    // its rig has no head bone: the jaw jerks instead
    pose: headJerks(["Jaw"], 0.3, 1.5),
  });
  if (model) return model;
  const fallback = facelingsBody();
  fallback.traverse((o) => o.material?.color?.setHex(0x2a2420));
  return fallback;
}

// the Drowned is a real model (assets/models/drowned.glb, by bitkiln): a
// deckhand in an oilskin, grey and swollen. He walks or runs exactly as fast
// as the player is moving the water; when it goes still he stops and retches.
// Without the model he is the wretch's fallback figure, soaked dark.
export function drownedMesh() {
  const model = modelInstance("drowned", {
    clipFor: (e) => (e.state === "follow" ? ((e.pace ?? 0) > 3 ? "run" : "walk") : e.state === "still" ? "retch" : "walk"),
    // a missing pace would make the speed NaN and fold every bone to nothing
    speedFor: (e) => (e.state === "follow" ? ((e.pace ?? 0) > 3 ? 1.1 : Math.max(0.4, (e.pace ?? 0) / 1.9)) : e.state === "wander" ? 0.4 : 1),
    pose: headJerks(["Head"], 0.3, 0.9),
  });
  if (!model) return wretchMesh();
  // the poolrooms are bright and the flashlight finds him: wash most of the
  // colour out of his coat in the shader, darken him and make him wet
  model.traverse((o) => {
    if (!o.isMesh) return;
    drain(o.material, 0.75, 0.62);
    o.material.color.setRGB(0.62, 0.68, 0.66);
    o.material.roughness = 0.32;
  });
  return model;
}

// takes colour out of a model's texture in its shader: `amount` 0 leaves it,
// 1 is black and white; `level` scales what's left
function drain(material, amount, level = 1) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), ${amount.toFixed(3)}) * ${level.toFixed(3)};`,
    );
  };
  material.customProgramCacheKey = () => `drain-${amount}-${level}`;
}

// Monochrome is a real model (assets/models/monochrome.glb, bitkiln's
// shambler in a hospital gown) with every colour taken out of it in the
// shader: a black-and-white man walking through a colour world.
export function monochromeMesh() {
  const model = modelInstance("monochrome", {
    clipFor: (e) => (e.state === "hunt" ? "run" : "walk"),
    pose: headJerks(["Head"], 0.4, 1.3),
    speedFor: (e) => (e.state === "hunt" ? 1 : 0.45),
  });
  if (!model) return facelingsBody();
  model.traverse((o) => {
    if (o.isMesh) drain(o.material, 1, 1.15);
  });
  return model;
}

export const MESHES = {
  monochrome: monochromeMesh,
  drowned: drownedMesh,
  wretch: wretchMesh,
  deadline: deadlineMesh,
  attendant: attendantMesh,
  hushbaby: hushbabyMesh,
  stilts: stiltsMesh,
  facelings: facelingsMesh,
  smiler: smilerMesh, hounds: houndMesh, stillLife: stillLifeMesh, deathmoths: deathmothsMesh, partygoers: partygoersMesh,
};
