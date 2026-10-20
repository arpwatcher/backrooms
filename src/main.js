// Entry point: one level, rendered. Gameplay systems hang off this loop.

import * as THREE from "three";
import { generateLayout } from "./world/layout.js";
import { buildWorld, updateLights, cellCenter } from "./render/world.js";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") || "noclip-0";

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has("smoke") });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);

const layout = generateLayout({ seed });
const world = buildWorld(scene, layout);
const start = cellCenter(layout.start.x, layout.start.y);
camera.position.set(start.x, 1.62, start.z);
camera.lookAt(start.x + 5, 1.6, start.z + 5);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let frames = 0;
function frame() {
  const time = clock.getElapsedTime();
  updateLights(world, camera.position, time);
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has("smoke")) document.getElementById("title").classList.add("hidden");

// read by the smoke test
window.__noclip = { seed, layout, get frames() { return frames; } };
