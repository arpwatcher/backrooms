// Other players, drawn where the snapshots put them: a survivor in a worn
// jacket with a backpack and a flashlight beam ahead of them, and their name
// over their head, both in the colour that player keeps. Figures come and go
// as players join and leave.

import * as THREE from "three";
import { skin, fleshMaterial, lumpy, tube } from "./flesh.js";

// each player keeps one colour: on the backpack, the armband and the name
export const COLOURS = { host: 0xd8c070, p2: 0xd06a30, p3: 0x3aa8a0, p4: 0x9a6ad0 };
const colourOf = (id) => COLOURS[id] ?? 0xc8c8c8;

function nameTag(text, colour) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.font = "28px monospace";
  ctx.fillStyle = `#${new THREE.Color(colour).lerp(new THREE.Color(0xf0e1aa), 0.5).getHexString()}`;
  ctx.textAlign = "center";
  ctx.fillText(text, 128, 40);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.set(0.9, 0.22, 1);
  sprite.position.y = 2.05;
  return sprite;
}

function figure(name) {
  const group = new THREE.Group();
  const colour = colourOf(name);
  // someone who came in wearing what they had on: a worn jacket, jeans,
  // boots, a backpack, and the flashlight they found
  const coat = fleshMaterial({ skin: skin({ base: "#4c5042", blotch: "rgba(30,30,20,0.45)", veins: null, grime: 0.7, pores: 0, seed: "coat" }), roughness: 0.9, rim: 0x2a2c26, normalScale: 0.7 });
  const jeans = fleshMaterial({ skin: skin({ base: "#2c3442", blotch: "rgba(10,12,20,0.4)", veins: null, grime: 0.6, pores: 0, seed: "jeans" }), roughness: 0.95, rim: 0x1a1e26, normalScale: 0.6 });
  const face = fleshMaterial({ skin: skin({ base: "#a88a78", blotch: "rgba(140,70,60,0.3)", veins: "rgba(80,70,110,0.2)", grime: 0.35, pores: 0.6, seed: "survivor" }), roughness: 0.6, rim: 0x3a3028 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 0.8 });
  const pack = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour).multiplyScalar(0.55), roughness: 0.8 });
  const body = new THREE.Group();
  group.add(body);
  const torso = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.2, 22, 18), { amount: 0.006, scale: 6, seed: 7,
    along: (v) => -0.04 * Math.exp(-(((v.y + 0.12) / 0.06) ** 2)) + (v.y > 0.1 ? 0.03 * Math.min(1, Math.abs(v.x) / 0.15) : 0) }), coat);
  torso.scale.set(1.15, 1.6, 0.75);
  torso.position.y = 1.22;
  body.add(torso);
  // the hood, down round the collar
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 18), coat);
  hood.rotation.x = Math.PI / 2 + 0.3;
  hood.position.set(0, 1.53, -0.04);
  body.add(hood);
  const head = new THREE.Group();
  head.position.y = 1.68;
  body.add(head);
  const skull = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.11, 22, 18), { amount: 0.004, scale: 9, seed: 17,
    along: (v) => {
      if (v.z < 0.04) return 0;
      const eye = Math.exp(-(((Math.abs(v.x) - 0.038) / 0.02) ** 2 + ((v.y - 0.015) / 0.014) ** 2)) * -0.014;
      const nose = Math.exp(-((v.x / 0.012) ** 2 + ((v.y + 0.01) / 0.026) ** 2)) * 0.016;
      return eye + nose;
    } }), face);
  skull.scale.set(0.92, 1.12, 1);
  head.add(skull);
  for (const x of [-0.038, 0.038]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), dark);
    eye.position.set(x, 0.015, 0.093);
    head.add(eye);
  }
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.116, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
  hair.rotation.x = -0.35;
  hair.position.y = 0.01;
  head.add(hair);
  // a backpack in their colour, straps over the shoulders
  const bag = new THREE.Mesh(lumpy(new THREE.BoxGeometry(0.3, 0.38, 0.16, 4, 4, 2), { amount: 0.01, seed: 3 }), pack);
  bag.position.set(0, 1.25, -0.2);
  body.add(bag);
  for (const x of [-0.11, 0.11]) body.add(new THREE.Mesh(tube([[x, 1.43, -0.14], [x, 1.47, 0.04], [x * 1.1, 1.2, 0.16]], 0.016, 1, 5), dark));
  // limbs hang from pivots at the hips and shoulders and swing as it walks
  const limb = (x, y, upper, lower, radius, material, bend, cuff) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(new THREE.Mesh(tube([[0, 0, 0], [0, -upper / 2, 0.005], [0, -upper, 0]], radius, 0.85, 8), material));
    const knee = new THREE.Group();
    knee.position.y = -upper;
    knee.rotation.x = bend;
    knee.add(new THREE.Mesh(tube([[0, 0, 0], [0, -lower / 2, 0], [0, -lower, 0]], radius * 0.85, 0.8, 8), material));
    knee.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 0.88, 10, 8), material));
    const end = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.95, 10, 8), cuff);
    end.position.y = -lower - radius * 0.4;
    knee.add(end);
    pivot.add(knee);
    body.add(pivot);
    return { pivot, knee, end };
  };
  const legs = [limb(-0.09, 0.94, 0.46, 0.44, 0.075, jeans, 0, dark), limb(0.09, 0.94, 0.46, 0.44, 0.075, jeans, 0, dark)];
  for (const l of legs) {
    l.end.scale.set(1, 0.6, 1.9);
    l.end.position.z = 0.05;
  }
  const arms = [limb(-0.25, 1.47, 0.3, 0.28, 0.052, coat, -0.25, face), limb(0.25, 1.47, 0.3, 0.28, 0.052, coat, -1.1, face)];
  // an armband in their colour, so you know who it is from behind too
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.06, 12, 1, true), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, side: THREE.DoubleSide }));
  band.position.y = -0.12;
  arms[0].pivot.add(band);
  // the flashlight in its right hand, its lens lit, and the beam it throws
  const torch = new THREE.Group();
  torch.position.y = -0.3;
  torch.rotation.x = Math.PI / 2;
  arms[1].knee.add(torch);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.6 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.06;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
  lens.position.z = 0.161;
  torch.add(barrel, lens);
  const beam = new THREE.SpotLight(0xfff4d6, 6, 14, 0.4, 0.5, 1.4);
  beam.position.set(0.25, 0.95, 0.15);
  beam.target.position.set(0.25, 0.8, 2.2);
  group.add(beam, beam.target, nameTag(name, colour));
  // noise says how they move: creeping, walking or running flat out
  group.userData.walk = (stride, noise = 0.3) => {
    const pace = noise > 0.6 ? 1.4 : noise < 0.15 ? 0.6 : 1;
    const swing = Math.sin(stride * 2.6) * 0.5 * pace;
    legs[0].pivot.rotation.x = swing;
    legs[1].pivot.rotation.x = -swing;
    legs[0].knee.rotation.x = Math.max(0, -swing) * 0.9 + (noise < 0.15 ? 0.5 : 0);
    legs[1].knee.rotation.x = Math.max(0, swing) * 0.9 + (noise < 0.15 ? 0.5 : 0);
    arms[0].pivot.rotation.x = -swing * 0.7;
    arms[1].pivot.rotation.x = -0.3;   // holding the light out in front
    // running leans into it; creeping goes low
    body.rotation.x = noise > 0.6 ? 0.22 : noise < 0.15 ? 0.3 : 0.04;
    body.position.y = noise < 0.15 ? -0.22 : 0;
  };
  group.userData.stride = 0;
  return group;
}

export function createRemotes(scene) {
  const figures = new Map();
  return {
    figures,
    // players: [{ id, x, z, yaw }] from the interpolated snapshot, minus you
    update(players) {
      const seen = new Set();
      for (const p of players) {
        seen.add(p.id);
        let f = figures.get(p.id);
        if (!f) {
          f = figure(p.id);
          scene.add(f);
          figures.set(p.id, f);
        }
        // stride from how far it moved since the last frame
        f.userData.stride += Math.hypot(p.x - f.position.x, p.z - f.position.z);
        f.userData.walk(f.userData.stride, p.noise);
        f.position.set(p.x, 0, p.z);
        // an Echo: a faint flicker where the player fell
        const faint = p.echo ? 0.18 + Math.random() * 0.1 : 1;
        f.traverse((o) => {
          if (o.material && "opacity" in o.material && !o.isSprite) {
            o.material.transparent = faint < 1;
            o.material.opacity = faint;
          }
          if (o.isSpotLight) o.visible = !p.echo;
        });
        // figures face +z; the game's yaw looks down -z
        f.rotation.y = p.yaw + Math.PI;
      }
      for (const [id, f] of figures) {
        if (seen.has(id)) continue;
        scene.remove(f);
        figures.delete(id);
      }
    },
    clear() {
      this.update([]);
    },
  };
}
