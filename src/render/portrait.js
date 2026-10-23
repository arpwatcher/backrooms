// What got you, up close: the entity alone in the black, lit from below by
// a dirty red light, filling the screen behind the death text. It keeps
// moving - breathing, twitching - while you read its rule.

import * as THREE from "three";
import { MESHES } from "./entities.js";

// [face height, face forward offset, camera distance] per entity
const FACES = {
  hounds: [1.02, 1.3, 0.7],
  smiler: [1.62, 0.3, 1.3],
  stillLife: [1.62, 0.05, 0.75],
  deathmoths: [1.7, 0, 1.6],
  partygoers: [2.16, 0.3, 0.9],
  facelings: [1.77, 0, 0.7],
  stilts: [2.66, 0.08, 0.8],
  hushbaby: [0.55, 0.3, 0.7],
  attendant: [1.32, 0.42, 0.8],
  deadline: [1.5, 0, 2.2],
  wretch: [1.68, 0.15, 0.8],
};

export function createPortrait() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020101);
  scene.add(new THREE.AmbientLight(0x2a1410, 0.5));
  const under = new THREE.PointLight(0xb03018, 9, 6, 1.6);
  scene.add(under);
  const rim = new THREE.PointLight(0x806050, 3, 6, 1.6);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 30);
  let current = null;
  const fake = { id: 7, state: "hunt", facing: 0, head: 0, stare: 3, x: 0, z: 0, memory: {} };
  return {
    camera,
    scene,
    show(kind, aspect) {
      if (current) scene.remove(current);
      current = MESHES[kind]();
      // eye glows are sized to be seen across a room; this close they'd swallow the face
      current.traverse((o) => {
        if (o.isSprite) o.scale.multiplyScalar(0.3);
      });
      scene.add(current);
      // states that look like it's coming for you
      fake.state = { smiler: "approach", hounds: "hunt", stillLife: "frozen", facelings: "offended", stilts: "stride", hushbaby: "coming", attendant: "follow", deadline: "coming", partygoers: "chase", deathmoths: "swarm", wretch: "chase" }[kind] ?? "hunt";
      // where each one's face is, and how close to stand to it
      const [fy, fz, dist] = FACES[kind] ?? [1.6, 0, 1];
      const face = new THREE.Vector3(0, fy, fz);
      camera.aspect = aspect;
      camera.position.set(0.1, fy - 0.12, fz + dist);
      // look a little below the face, so it sits in the top half of the
      // screen, above the words
      camera.lookAt(face.x, fy - 0.22 * dist, face.z);
      camera.updateProjectionMatrix();
      under.position.set(0, fy - 0.9, fz + 0.6);
      rim.position.set(-0.8, fy + 0.6, fz - 0.5);
    },
    animate(time) {
      current?.userData.animate?.(time, fake, "dark");
    },
  };
}
