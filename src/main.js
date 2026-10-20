// Entry point: the run, the current level, and the loop that ties the
// player, lights, sound and HUD together.

import * as THREE from "three";
import { generateLayout } from "./world/layout.js";
import { buildWorld, updateLights, cellCenter } from "./render/world.js";
import { almondWater, exitDoor, placeInCell } from "./render/props.js";
import { createPlayer, stepPlayer } from "./game/player.js";
import { createInput } from "./game/input.js";
import { createAudio } from "./audio/sound.js";
import { stepLucidity } from "./game/lucidity.js";
import { createFlashlight, toggleFlashlight, stepFlashlight, beamStrength } from "./game/flashlight.js";
import { createRun, levelSeed, descend, drinkAlmondWater } from "./game/run.js";
import { createHud } from "./ui/hud.js";
import { createScreens } from "./ui/screens.js";
import { CELL } from "./world/units.js";
import { Rng } from "./core/rng.js";
import { createPathfinder } from "./world/path.js";
import { createEncounter, makeSense } from "./game/encounter.js";
import { contact } from "./entities/core.js";
import { ENTITIES } from "./entities/index.js";
import { archetypeFor } from "./world/archetypes.js";
import { planLevel, TIERS, createTension, stepTension, noteContact } from "./game/director.js";
import { loadCodex, recordSurvival } from "./game/codex.js";
import { checkpointFor } from "./game/run.js";

const params = new URLSearchParams(location.search);
const smoke = params.has("smoke");

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: smoke });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
camera.rotation.order = "YXZ";
scene.add(camera);

// the flashlight rides on the camera
const beam = new THREE.SpotLight(0xfff4d6, 0, 22, 0.42, 0.45, 1.4);
beam.position.set(0.15, -0.12, 0);
beam.target.position.set(0, -0.2, -1);
camera.add(beam, beam.target);

// eyelids: at low lucidity you start to blink, and things that move while
// unwatched get their chance
const lids = document.createElement("div");
lids.id = "lids";
document.body.appendChild(lids);

const fade = document.createElement("div");
fade.id = "fade";
document.body.appendChild(fade);

const run = createRun(params.get("seed") || `run-${Date.now().toString(36)}`);
const flashlight = createFlashlight();
const input = createInput(canvas);
const hud = createHud();
const screens = createScreens();
const codex = loadCodex();
let marks = new Map();
let tier = TIERS[params.get("tier")] ?? TIERS[readTier()] ?? TIERS.uneasy;
let tension = createTension();
const recent = [];
let player = null;
let level = null;
let audio = null;
let transitioning = false;

function loadLevel() {
  if (level) {
    scene.remove(level.world.group);
    level.world.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material && !Array.isArray(o.material)) o.material.dispose?.();
    });
  }
  if (level?.encounter) level.encounter.dispose();
  const plan = planLevel({ depth: run.depth, rng: new Rng(`${levelSeed(run)}/director`), pool: ENTITIES, tier, recent });
  const roster = plan.roster;
  recent.push(roster.map((d) => d.id));
  if (recent.length > 3) recent.shift();
  const archetype = archetypeFor(run.depth, (d) => new Rng(`${levelSeed(run, d)}/archetype`));
  const darkPatches = Math.max(archetype.layout.darkPatches ?? 0, ...roster.map((d) => d.layout?.darkPatches ?? 0));
  const layout = generateLayout({ seed: levelSeed(run), ...archetype.layout, darkPatches });
  const world = buildWorld(scene, layout, archetype.look);
  const paths = createPathfinder(layout);
  const bottles = layout.items.map((cell) => {
    const mesh = placeInCell(almondWater(), cell.x, cell.y);
    mesh.position.x += 0.4;
    world.group.add(mesh);
    return { cell, mesh, taken: false };
  });
  const exits = layout.exits.map((cell) => {
    const door = placeInCell(exitDoor(), cell.x, cell.y, Math.PI / 4);
    world.group.add(door);
    return { cell, door };
  });
  const start = cellCenter(layout.start.x, layout.start.y);
  const lucidity = player ? player.lucidity : 1;
  player = createPlayer(start.x, start.z, -Math.PI * 0.75);
  player.lucidity = lucidity;
  marks = new Map();
  tension = createTension();
  level = { layout, world, bottles, exits, paths, plan, archetype };
  level.encounter = createEncounter({
    scene: world.group, layout, roster, rng: new Rng(`${levelSeed(run)}/entities`), paths, lightAt,
  });
}

function onContact(entity, time) {
  const { fatal } = contact(marks, entity.kind, tier.contacts);
  noteContact(tension, time);
  if (fatal) {
    run.deaths += 1;
    hud.hush();
    screens.die(entity.def, () => {
      run.depth = checkpointFor(run.depth);
      player = null;
      loadLevel();
      input.lock();
    });
    return;
  }
  // first contact: knocked down, shaken, and it backs off
  player.downUntil = time + 2.2;
  player.lucidity = Math.max(0, player.lucidity - 0.3);
  screens.hit();
  audio?.hit();
  level.encounter.retreat(entity, time);
  if (recordSurvival(codex, entity.kind)) hud.say(`codex: ${entity.def.name} - ${entity.def.counter}`, 7, time);
  else hud.say(`${entity.def.name} marked you. it won't let go next time.`, 5, time);
}

function lightAt(x, z) {
  for (const panel of level.world.panels) {
    if (panel.level < 0.5) continue;
    const dx = panel.mesh.position.x - x;
    const dz = panel.mesh.position.z - z;
    if (dx * dx + dz * dz < (CELL * 1.6) ** 2) return "lit";
  }
  return flashlight.on ? "dim" : "dark";
}

function nextLevel(time) {
  if (transitioning) return;
  transitioning = true;
  fade.style.opacity = "1";
  setTimeout(() => {
    descend(run);
    loadLevel();
    fade.style.opacity = "0";
    hud.say(`level ${run.depth} - ${level.archetype.name}`, 3.5, time + 1);
    transitioning = false;
  }, 950);
}

loadLevel();

function readTier() {
  try {
    return localStorage.getItem("noclip.tier");
  } catch {
    return null;
  }
}

const TIER_NOTES = {
  lucid: "fewer of them, and they let go sooner. you survive two touches instead of one.",
  uneasy: "the way it is meant to be played.",
  lost: "more of them at once, and less mercy when it gets bad.",
  noclip: "everything it has. it rarely lets go.",
};
const tierNote = document.getElementById("tier-note");
for (const button of document.querySelectorAll("#tiers button")) {
  button.classList.toggle("on", button.dataset.tier === tier.name);
  button.addEventListener("click", () => {
    tier = TIERS[button.dataset.tier];
    try {
      localStorage.setItem("noclip.tier", tier.name);
    } catch {}
    for (const b of document.querySelectorAll("#tiers button")) b.classList.toggle("on", b === button);
    tierNote.textContent = TIER_NOTES[tier.name];
  });
}
tierNote.textContent = TIER_NOTES[tier.name];

const title = document.getElementById("title");
document.getElementById("enter").addEventListener("click", () => {
  title.classList.add("hidden");
  input.lock();
  // browsers only allow sound after a click, so it starts here
  audio ??= createAudio();
  audio.resume();
  audio.setHum(1, 2);
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
  if (frameInput.pressed.has("KeyF")) toggleFlashlight(flashlight);
  if (frameInput.pressed.has("KeyQ") && drinkAlmondWater(run, player)) hud.say("almond water", 1.5, time);

  if (player.lucidity < 0.33 && time > (player.nextBlink ?? 0)) {
    player.blinkUntil = time + 0.14 + (0.33 - player.lucidity) * 0.6;
    player.nextBlink = time + 2.5 + Math.random() * 4 * (player.lucidity / 0.33 + 0.4);
  }
  player.blinking = time < (player.blinkUntil ?? 0);
  lids.style.opacity = player.blinking ? "1" : "0";
  const down = (player.downUntil ?? 0) > time || screens.dead;
  const moved = stepPlayer(player, down ? { lookX: frameInput.lookX, lookY: frameInput.lookY } : frameInput, dt, level.layout);
  const sense = makeSense({
    player, flashlight, camera, layout: level.layout, paths: level.paths, lightAt, time, darkCells: level.encounter.darkCells,
  });
  if (!screens.dead) {
    for (const event of level.encounter.update(sense, dt)) {
      if (event.type === "sound") audio?.entity(event.sound, event.x, 1.2, event.z, event.volume);
      else if (event.type === "drain" && event.what === "battery") flashlight.battery = Math.max(0, flashlight.battery - event.amount);
      else if (event.type === "contact" && !down) onContact(event.entity, time);
    }
  }
  const nearest = Math.min(...level.encounter.entities.map((e) => Math.hypot(e.x - player.x, e.z - player.z)));
  const hunting = level.encounter.entities.filter((e) => e.def.hunting?.(e)).length;
  if (stepTension(tension, { nearest, hunting, time, tier }, dt) === "mercy") {
    level.encounter.calm(sense, tier.mercyFor);
    audio?.setHum(0.55, 3);
    setTimeout(() => audio?.setHum(1, 6), tier.mercyFor * 1000);
    hud.say("the hum softens. something lets go of you, for now.", 4, time);
  }
  stepFlashlight(flashlight, dt);
  const presences = level.encounter.entities.map((e) => ({ distance: Math.hypot(e.x - player.x, e.z - player.z) }));
  player.lucidity = stepLucidity(player.lucidity, { light: lightAt(player.x, player.z), presences }, dt);

  for (const bottle of level.bottles) {
    if (bottle.taken) continue;
    bottle.mesh.rotation.y += dt * 0.6;
    if (Math.hypot(bottle.mesh.position.x - player.x, bottle.mesh.position.z - player.z) < 0.9) {
      bottle.taken = true;
      bottle.mesh.visible = false;
      run.inventory.almondWater += 1;
      hud.say("almond water", 1.5, time);
    }
  }
  for (const exit of level.exits) {
    if (Math.hypot(exit.door.position.x - player.x, exit.door.position.z - player.z) < 0.7) nextLevel(time);
  }

  bob += moved.travelled * (player.running ? 5.2 : 6.4);
  const bobHeight = moved.travelled > 0 ? Math.sin(bob) * (player.running ? 0.045 : 0.025) : 0;
  camera.position.set(player.x, (down ? 0.45 : player.height) + bobHeight, player.z);
  camera.rotation.set(player.pitch, player.yaw, down ? 0.5 : 0);
  // low lucidity: the room breathes
  const unease = Math.max(0, 0.6 - player.lucidity);
  camera.fov = 72 + Math.sin(time * 0.7) * unease * 9;
  camera.updateProjectionMatrix();
  beam.intensity = beamStrength(flashlight, time) * 26;

  const ticks = updateLights(level.world, camera.position, time);
  if (audio) {
    audio.listen(camera.position, player.yaw);
    if (moved.stepped) audio.footstep(player.running, player.crouching);
    for (const panel of ticks) {
      const p = panel.mesh.position;
      if (p.distanceToSquared(camera.position) < 100) audio.flickerTick(p.x, p.y, p.z);
    }
  }
  hud.update({
    depth: run.depth,
    battery: flashlight.battery,
    flashlightOn: flashlight.on,
    almondWater: run.inventory.almondWater,
    lucidity: player.lucidity,
    time,
  });
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// read by the smoke test
window.__noclip = {
  run,
  flashlight,
  get layout() { return level.layout; },
  get player() { return player; },
  get frames() { return frames; },
  get audio() { return audio; },
  get entities() { return level.encounter.entities; },
  marks: () => marks,
  // test hooks
  touch(index) {
    onContact(level.encounter.entities[index], clock.elapsedTime);
  },
  get dead() { return screens.dead; },
  get tension() { return tension; },
  get plan() { return level.plan; },
  get archetype() { return level.archetype.id; },
  get tier() { return tier.name; },
  goToDepth(depth) {
    run.depth = depth;
    loadLevel();
  },
  // test hook: stand in front of the exit
  teleportToExit() {
    const exit = level.exits[0].door.position;
    player.x = exit.x + 0.3;
    player.z = exit.z + 0.3;
  },
};
