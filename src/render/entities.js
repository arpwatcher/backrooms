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

export const MESHES = { smiler: smilerMesh, hounds: houndMesh };
