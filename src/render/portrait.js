// What got you, up close: the entity alone in the black, lit from below by
// a dirty red light, filling the screen behind the death text. It keeps
// moving - breathing, twitching - while you read its rule.

import * as THREE from "three";
import { MESHES } from "./entities.js";

// Things with no head to aim at: [face height, face forward offset, camera
// distance], set by hand
const FIXED = {
  smiler: [1.62, 0.3, 1.3],
  deathmoths: [1.7, 0, 1.6],
  deadline: [1.5, 0, 2.2],
};
// Everything else is framed on its head: a real model's head (or jaw) bone,
// or the group a built one marks as userData.face. [how far above it, how far
// in front of it, camera distance]
const HEAD = {
  hounds: [0.08, 0.14, 0.95],
  facelings: [0.1, 0.08, 0.9],
  stillLife: [0.1, 0.06, 0.9],
  stilts: [0.1, 0.08, 1.0],
  wretch: [0.1, 0.1, 1.0],
  drowned: [0.12, 0.1, 1.0],
  monochrome: [0.1, 0.1, 0.95],
  partygoers: [0.02, 0.12, 1.25],
  hushbaby: [0.02, 0.1, 1.2],
  attendant: [0.06, 0.06, 1.0],
};
const BONES = ["Head", "head", "Jaw"];

export function createPortrait() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020101);
  scene.add(new THREE.AmbientLight(0x2a1410, 0.5));
  const under = new THREE.PointLight(0xb03018, 16, 6, 1.6);
  scene.add(under);
  const rim = new THREE.PointLight(0x806050, 6, 6, 1.6);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 30);
  let current = null;
  // the head being framed, if it has one, and [above, in front, distance]
  let track = null;
  let offsets = [0, 0, 1];
  const at = new THREE.Vector3();
  const want = new THREE.Vector3();
  const look = new THREE.Vector3();
  function aim(ease) {
    current.updateMatrixWorld(true);
    track.getWorldPosition(at);
    const [up, forward, dist] = offsets;
    const fy = at.y + up, fz = at.z + forward;
    want.set(at.x + 0.1, fy - 0.12, fz + dist);
    camera.position.lerp(want, ease);
    // a little below the face, so it sits above the words
    look.lerp(want.set(at.x, fy - 0.2 * dist, fz), ease);
    camera.lookAt(look);
    under.position.set(at.x, fy - 0.9, fz + 0.6);
    rim.position.set(at.x - 0.8, fy + 0.6, fz - 0.5);
  }
  const fake = { id: 7, state: "hunt", facing: 0, head: 0, stare: 3, pace: 4, x: 0, z: 0, memory: {} };
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
      fake.state = { smiler: "approach", hounds: "hunt", stillLife: "frozen", facelings: "offended", stilts: "stride", hushbaby: "coming", attendant: "caught", deadline: "coming", partygoers: "chase", deathmoths: "swarm", wretch: "chase", drowned: "follow", monochrome: "hunt" }[kind] ?? "hunt";
      // where each one's face is, and how close to stand to it: pose it as
      // it comes for you, then find its head
      current.userData.animate?.(0.5, fake, "dark");
      current.updateMatrixWorld(true);
      track = FIXED[kind] ? null : current.userData.face ?? BONES.map((n) => current.userData.bone?.(n)).find(Boolean) ?? null;
      offsets = HEAD[kind] ?? [0.04, 0.1, 0.8];
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      if (track) {
        aim(1);
      } else {
        const [fy, fz, dist] = FIXED[kind] ?? [1.6, 0, 1];
        camera.position.set(0.1, fy - 0.12, fz + dist);
        // look a little below the face, so it sits in the top half of the
        // screen, above the words
        camera.lookAt(0, fy - 0.22 * dist, fz);
        under.position.set(0, fy - 0.9, fz + 0.6);
        rim.position.set(-0.8, fy + 0.6, fz - 0.5);
      }
    },
    animate(time) {
      current?.userData.animate?.(time, fake, "dark");
      // a running clip carries the head about; the camera stays on it
      if (track) aim(0.12);
    },
  };
}
