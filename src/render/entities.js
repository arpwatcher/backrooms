// What the entities look like. Primitives and canvas textures; the horror is
// in proportion, posture and movement more than detail.

import * as THREE from "three";

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

export function smilerMesh() {
  grin ??= grinTexture();
  const material = new THREE.SpriteMaterial({ map: grin, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.1, 0.55, 1);
  sprite.position.y = 1.55;
  const group = new THREE.Group();
  group.add(sprite);
  group.userData.animate = (time, entity, light) => {
    // nearly invisible in the light, stark in the dark
    material.opacity = light === "lit" ? 0.06 : 0.95;
    sprite.position.y = 1.55 + Math.sin(time * 1.3 + entity.id) * 0.03;
    const s = entity.state === "flinch" ? 0.8 : 1;
    sprite.scale.set(1.1 * s, 0.55 * s, 1);
  };
  return group;
}

export function houndMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x15120c });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), skin);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.62;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.scale.set(0.9, 0.8, 1.4);
  head.position.set(0, 0.66, 0.68);
  group.add(body, head);
  const legs = [];
  for (const [x, z] of [[-0.16, 0.38], [0.16, 0.38], [-0.16, -0.38], [0.16, -0.38]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.66, 5), skin);
    leg.position.set(x, 0.33, z);
    group.add(leg);
    legs.push(leg);
  }
  group.userData.animate = (time, entity) => {
    const pace = entity.state === "hunt" ? 16 : entity.state === "wander" ? 7 : 0;
    legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(time * pace + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.55;
    });
    body.position.y = 0.62 + Math.abs(Math.sin(time * pace)) * 0.04;
    head.rotation.y = entity.state === "sniff" ? Math.sin(time * 5) * 0.6 : 0;
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

function partyFaceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "#e8cf3a";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#1a1408";
  g.fillRect(20, 16, 6, 12);
  g.fillRect(38, 16, 6, 12);
  g.lineWidth = 5;
  g.strokeStyle = "#1a1408";
  g.beginPath();
  g.arc(32, 30, 18, 0.25 * Math.PI, 0.75 * Math.PI);
  g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
let partyFace = null;

// a tall, soft, yellow guest with a printed-on face and a balloon on a string
export function partygoersMesh() {
  partyFace ??= partyFaceTexture();
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9be35 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 10), skin);
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), [skin]);
  head.position.y = 1.88;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshLambertMaterial({ map: partyFace }));
  face.position.set(0, 1.9, 0.19);
  const arm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.45, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.62, 3, 6), skin);
    mesh.position.y = -0.36;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const left = arm(-0.3);
  const right = arm(0.3);
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc8202a, emissive: 0x300508 }));
  balloon.scale.y = 1.2;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.55, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
  group.add(body, head, face, balloon, string);
  group.userData.animate = (time, entity) => {
    const sway = Math.sin(time * 1.7 + entity.id);
    const chasing = entity.state === "chase";
    body.rotation.x = chasing ? 0.25 : 0;
    // waving at the new guest
    left.rotation.z = entity.state === "greet" ? -2.4 + Math.sin(time * 10) * 0.4 : -0.1 + sway * 0.05;
    right.rotation.z = 0.1 - sway * 0.05;
    right.rotation.x = chasing ? -1.2 : 0;
    const bob = Math.sin(time * 2.1 + entity.id) * 0.06;
    balloon.position.set(0.45, 2.55 + bob, 0);
    // from the hand up to the balloon
    string.position.set(0.375, 1.55 + bob / 2, 0);
    string.rotation.z = -0.1;
    head.rotation.z = Math.sin(time * 0.6 + entity.id) * 0.15;
    face.rotation.z = head.rotation.z;
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

export const MESHES = {
  stilts: stiltsMesh,
  facelings: facelingsMesh,
  smiler: smilerMesh, hounds: houndMesh, stillLife: stillLifeMesh, deathmoths: deathmothsMesh, partygoers: partygoersMesh,
};
