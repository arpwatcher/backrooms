// Other players, drawn where the snapshots put them: a dark figure about a
// player's height with a flashlight beam ahead of it and a name over its
// head. Figures come and go as players join and leave.

import * as THREE from "three";

function nameTag(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.font = "28px monospace";
  ctx.fillStyle = "rgba(240,225,170,0.9)";
  ctx.textAlign = "center";
  ctx.fillText(text, 128, 40);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.set(0.9, 0.22, 1);
  sprite.position.y = 2.05;
  return sprite;
}

function figure(name) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x9a8576, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 4, 10), cloth);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skinMat);
  head.position.y = 1.62;
  const beam = new THREE.SpotLight(0xfff4d6, 6, 14, 0.4, 0.5, 1.4);
  beam.position.set(0.15, 1.35, 0.1);
  beam.target.position.set(0.15, 1.1, 2);
  group.add(body, head, beam, beam.target, nameTag(name));
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
        f.position.set(p.x, 0, p.z);
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
