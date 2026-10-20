// Entry point: builds a level and runs the loop. Gameplay systems hang off
// this loop as they are added.

import * as THREE from "three";
import { generateLayout } from "./world/layout.js";
import { buildWorld, updateLights, cellCenter } from "./render/world.js";
import { createPlayer, stepPlayer } from "./game/player.js";
import { createInput } from "./game/input.js";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") || "noclip-0";
const smoke = params.has("smoke");

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: smoke });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
camera.rotation.order = "YXZ";

const layout = generateLayout({ seed });
const world = buildWorld(scene, layout);
const start = cellCenter(layout.start.x, layout.start.y);
const player = createPlayer(start.x, start.z, -Math.PI * 0.75);
const input = createInput(canvas);

const title = document.getElementById("title");
document.getElementById("enter").addEventListener("click", () => {
  title.classList.add("hidden");
  input.lock();
});
canvas.addEventListener("click", () => {
  if (title.classList.contains("hidden") && !input.locked) input.lock();
});
if (smoke) title.classList.add("hidden");

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let frames = 0;
let bob = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  const frameInput = input.read();
  const moved = stepPlayer(player, frameInput, dt, layout);

  bob += moved.travelled * (player.running ? 5.2 : 6.4);
  const bobHeight = moved.travelled > 0 ? Math.sin(bob) * (player.running ? 0.045 : 0.025) : 0;
  camera.position.set(player.x, player.height + bobHeight, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  updateLights(world, camera.position, time);
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// read by the smoke test
window.__noclip = { seed, layout, player, get frames() { return frames; } };
