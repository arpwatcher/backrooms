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
  const coat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.85 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x24292f, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x9a8576, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), coat);
  torso.position.y = 1.22;
  torso.scale.z = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), skinMat);
  head.position.y = 1.67;
  group.add(torso, head);
  // limbs hang from pivots at the hips and shoulders and swing as it walks
  const limb = (x, y, length, radius, material) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 8), material);
    mesh.position.y = -length / 2 - radius;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const legs = [limb(-0.09, 0.92, 0.74, 0.07, jeans), limb(0.09, 0.92, 0.74, 0.07, jeans)];
  const arms = [limb(-0.25, 1.45, 0.52, 0.05, coat), limb(0.25, 1.45, 0.52, 0.05, coat)];
  // the flashlight in its right hand, and the beam it throws
  const beam = new THREE.SpotLight(0xfff4d6, 6, 14, 0.4, 0.5, 1.4);
  beam.position.set(0.25, 0.95, 0.15);
  beam.target.position.set(0.25, 0.8, 2.2);
  group.add(beam, beam.target, nameTag(name));
  group.userData.walk = (stride) => {
    const swing = Math.sin(stride * 2.6) * 0.5;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.7;
    arms[1].rotation.x = 0.35;   // holding the light out in front
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
        f.userData.walk(f.userData.stride);
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
