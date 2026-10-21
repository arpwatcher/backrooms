// Entry point: the run, the current level, and the loop that ties the
// player, lights, sound and HUD together.

import * as THREE from "three";
import { generateLayout } from "./world/layout.js";
import { buildWorld, updateLights, cellCenter } from "./render/world.js";
import { almondWater, battery, exitDoor, placeInCell, breakerBox, placeOnWall, wallNote } from "./render/props.js";
import { itemKinds, BATTERY_CHARGE } from "./game/items.js";
import { createPlayer, stepPlayer } from "./game/player.js";
import { createInput } from "./game/input.js";
import { createAudio } from "./audio/sound.js";
import { stepLucidity } from "./game/lucidity.js";
import { createFlashlight, toggleFlashlight, stepFlashlight, beamStrength, recharge } from "./game/flashlight.js";
import { createRun, levelSeed, descend, drinkAlmondWater } from "./game/run.js";
import { createHud } from "./ui/hud.js";
import { createScreens } from "./ui/screens.js";
import { CELL } from "./world/units.js";
import { Rng } from "./core/rng.js";
import { createPathfinder } from "./world/path.js";
import { createEncounter, makeSense } from "./game/encounter.js";
import { contact } from "./entities/core.js";
import { createTrail, stepTrail } from "./game/shifts.js";
import { placeTask, interact, doneCount } from "./game/tasks.js";
import { placeNotes } from "./game/notes.js";
import { TIERS, createTension, stepTension, noteContact } from "./game/director.js";
import { levelPlan } from "./game/plan.js";
import { loadCodex, recordSurvival } from "./game/codex.js";
import { createCodexScreen } from "./ui/codex.js";
import { createPauseScreen } from "./ui/pause.js";
import { loadSettings, saveSettings } from "./game/settings.js";
import { loadRecords, recordDepth, describeRecords } from "./game/records.js";
import { createPhantoms, stepPhantoms } from "./game/phantoms.js";
import { facelingsMesh, smilerMesh } from "./render/entities.js";
import { lineOfSight } from "./world/sight.js";
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
const codexScreen = createCodexScreen(codex);
document.getElementById("codex-open").addEventListener("click", () => codexScreen.open());
let marks = new Map();
let phantoms = createPhantoms();
const phantomRng = new Rng("phantoms");
let tier = TIERS[params.get("tier")] ?? TIERS[readTier()] ?? TIERS.uneasy;
let tension = createTension();
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
  const { director: plan, roster, archetype, shift, task: picked, pace } = levelPlan(run.seed, run.depth, tier);
  const darkPatches = Math.max(archetype.layout.darkPatches ?? 0, ...roster.map((d) => d.layout?.darkPatches ?? 0));
  const layout = generateLayout({ seed: levelSeed(run), ...archetype.layout, darkPatches });
  const effects = shift?.effects ?? {};
  const world = buildWorld(scene, layout, { ...archetype.look, ...effects.look });
  const paths = createPathfinder(layout);
  const kinds = itemKinds(layout.items.length, run.depth, new Rng(`${levelSeed(run)}/item-kinds`));
  const items = layout.items.map((cell, i) => {
    const kind = kinds[i];
    const mesh = placeInCell(kind === "battery" ? battery() : almondWater(), cell.x, cell.y);
    mesh.position.x += 0.4;
    world.group.add(mesh);
    return { cell, mesh, kind, taken: false };
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
  const task = picked ? placeTask(picked, layout, new Rng(`${levelSeed(run)}/task-place`)) : null;
  if (task) {
    for (const target of task.targets) {
      target.mesh = placeOnWall(breakerBox(), target.x, target.y, target.side);
      world.group.add(target.mesh);
    }
    for (const exit of exits) exit.door.userData.setLocked(true);
  }
  const notes = placeNotes(layout, run.depth, new Rng(`${levelSeed(run)}/notes`)).map((note, i) => {
    const mesh = placeOnWall(wallNote(i + run.depth * 7 + 1), note.x, note.y, note.side);
    world.group.add(mesh);
    return { ...note, mesh, read: false };
  });
  phantoms = createPhantoms();
  for (const mesh of Object.values(phantomMeshes)) mesh.visible = false;
  level = { layout, world, items, exits, paths, plan, archetype, shift, effects, task, pace, notes, trail: createTrail() };
  if (effects.noFlashlight) flashlight.on = false;
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

function useTask(time) {
  const { task, world } = level;
  const target = interact(task, (t) => t.mesh.position.distanceTo(new THREE.Vector3(player.x, 0, player.z)) < 1.3);
  if (!target) return;
  target.mesh.userData.setOn(true);
  audio?.clunk(target.mesh.position.x, 1.4, target.mesh.position.z);
  // the breaker brings its corner of the floor back
  world.panels.forEach((panel) => {
    if (panel.state === "dead" && Math.hypot(panel.x - target.x, panel.y - target.y) < 4) {
      panel.state = "on";
      panel.level = 1;
      panel.mesh.material.color.setHex(panel.on);
    }
  });
  hud.say(task.task.progress(doneCount(task), task.targets.length), 3, time);
  if (task.complete) for (const exit of level.exits) exit.door.userData.setLocked(false);
}

// the figures low lucidity puts at the edge of your vision: a dark shape of
// a person, or a grin. One at a time, never straight ahead.
const phantomMeshes = { figure: facelingsMesh(), grin: smilerMesh() };
for (const mesh of Object.values(phantomMeshes)) {
  mesh.visible = false;
  scene.add(mesh);
}
phantomMeshes.figure.traverse((o) => o.material?.color?.setHex(0x0d0b07));
function updatePhantoms(time) {
  const view = { x: player.x, z: player.z, yaw: player.yaw };
  const place = (angle, distance) => {
    const x = player.x - Math.sin(angle) * distance;
    const z = player.z - Math.cos(angle) * distance;
    const inside = x > 0.5 && z > 0.5 && x < level.layout.width * CELL - 0.5 && z < level.layout.height * CELL - 0.5;
    return inside && lineOfSight(level.layout, player.x, player.z, x, z) ? { x, z } : null;
  };
  const change = stepPhantoms(phantoms, { lucidity: player.lucidity, time, view, place, rng: phantomRng });
  if (change?.vanished) phantomMeshes[change.vanished.kind].visible = false;
  if (change?.appeared) {
    const { x, z, kind } = change.appeared;
    const mesh = phantomMeshes[kind];
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.atan2(player.x - x, player.z - z);
    mesh.visible = true;
    if (kind === "grin") mesh.userData.animate(time, { id: 0, state: "wait" }, "dark");
  }
}

const lookDirection = new THREE.Vector3();
const toPanel = new THREE.Vector3();
function applyShiftToLights(time) {
  const { effects, world, layout } = level;
  if (effects.lightsDieBehind) {
    const cell = { x: Math.floor(player.x / CELL), y: Math.floor(player.z / CELL) };
    for (const i of stepTrail(level.trail, layout.lights, cell, time, effects.lightsDieBehind)) {
      const panel = world.panels[i];
      panel.state = "dead";
      panel.level = 0;
      panel.mesh.material.color.setHex(0x3a3628);
      const p = panel.mesh.position;
      audio?.flickerTick(p.x, p.y, p.z);
    }
  }
  if (effects.shyLights) {
    camera.getWorldDirection(lookDirection);
    for (const panel of world.panels) {
      if (panel.state === "dead") continue;
      toPanel.copy(panel.mesh.position).sub(camera.position);
      const d = toPanel.length();
      const seen = d < 22 && toPanel.dot(lookDirection) / d > Math.cos(0.42);
      const target = seen ? 0.04 : 1;
      panel.level += (target - panel.level) * 0.25;
      panel.mesh.material.color.setHex(panel.level > 0.5 ? panel.on : 0x4a4430);
    }
  }
}

// a silent level: nothing lives here, but every so often you hear something
// that would. Nothing comes. The player doesn't know that.
const PHANTOMS = ["teeth", "panting", "scrape", "flutter", "party"];
function phantomTells(time) {
  if (time < (level.phantomAt ??= time + 15 + Math.random() * 20)) return;
  level.phantomAt = time + 20 + Math.random() * 25;
  const angle = Math.random() * Math.PI * 2;
  const distance = 12 + Math.random() * 8;
  const sound = PHANTOMS[Math.floor(Math.random() * PHANTOMS.length)];
  audio?.entity(sound, player.x + Math.cos(angle) * distance, 1.2, player.z + Math.sin(angle) * distance, 0.6);
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
    if (recordDepth(records, tier.name, run.depth)) showRecords();
    loadLevel();
    fade.style.opacity = "0";
    hud.say(`level ${run.depth} - ${level.archetype.name}`, 3.5, time + 1);
    const notes = [level.shift?.note, level.task?.task.note].filter(Boolean);
    notes.forEach((note, i) => setTimeout(() => hud.say(note, 6, time), 4200 + i * 6500));
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

const records = loadRecords();
const recordLine = document.getElementById("records");
function showRecords() {
  recordLine.textContent = describeRecords(records);
}
showRecords();

const title = document.getElementById("title");
document.getElementById("enter").addEventListener("click", () => {
  title.classList.add("hidden");
  input.lock();
  // browsers only allow sound after a click, so it starts here
  audio ??= createAudio();
  audio.resume();
  audio.setVolume(settings.volume);
  audio.setHum(1, 2);
});
canvas.addEventListener("click", () => {
  if (title.classList.contains("hidden") && !input.locked && !pause.shown) input.lock();
});

let settings = loadSettings();
const pause = createPauseScreen({
  settings,
  onChange(next) {
    settings = next;
    saveSettings(settings);
    audio?.setVolume(settings.volume);
  },
  onResume() {
    pause.hide();
    input.lock();
    audio?.ctx.resume();
  },
  onCodex: () => codexScreen.open(),
});
// letting go of the mouse mid-level pauses the game
document.addEventListener("pointerlockchange", () => {
  if (input.locked || !title.classList.contains("hidden") || screens.dead || smoke) return;
  pause.show();
  audio?.ctx.suspend();
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
// game time only runs while you're playing, so pausing never lets a timer
// run out behind your back
let time = 0;
function frame() {
  const real = Math.min(clock.getDelta(), 0.1);
  if (pause.shown || codexScreen.isOpen) {
    input.read();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  const dt = real;
  time += dt;
  const frameInput = input.read();
  frameInput.lookX *= settings.sensitivity;
  frameInput.lookY *= settings.sensitivity;
  if (frameInput.pressed.has("KeyF")) {
    if (level.effects.noFlashlight) hud.say("click. nothing.", 1.5, time);
    else toggleFlashlight(flashlight);
  }
  if (level.effects.noRun) frameInput.cannotRun = true;
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
  if (level.pace === "silence") phantomTells(time);
  updatePhantoms(time);
  stepFlashlight(flashlight, dt);
  const presences = level.encounter.entities.map((e) => ({ distance: Math.hypot(e.x - player.x, e.z - player.z) }));
  player.lucidity = stepLucidity(player.lucidity, { light: lightAt(player.x, player.z), presences }, dt);

  for (const item of level.items) {
    if (item.taken) continue;
    item.mesh.rotation.y += dt * 0.6;
    if (Math.hypot(item.mesh.position.x - player.x, item.mesh.position.z - player.z) < 0.9) {
      item.taken = true;
      item.mesh.visible = false;
      if (item.kind === "battery") {
        recharge(flashlight, BATTERY_CHARGE);
        hud.say("a battery. the light will last a while longer.", 2, time);
      } else {
        run.inventory.almondWater += 1;
        hud.say("almond water", 1.5, time);
      }
    }
  }
  if (frameInput.pressed.has("KeyE") && level.task) useTask(time);
  for (const note of level.notes) {
    if (note.read || Math.hypot(note.mesh.position.x - player.x, note.mesh.position.z - player.z) > 1.4) continue;
    note.read = true;
    hud.note(note.text, time);
    audio?.rustle(note.mesh.position.x, 1.4, note.mesh.position.z);
  }
  for (const exit of level.exits) {
    if (Math.hypot(exit.door.position.x - player.x, exit.door.position.z - player.z) >= 0.7) continue;
    if (level.task && !level.task.complete) {
      if (time > (level.lockedSaidAt ?? -10) + 4) hud.say("it won't open. the sign is dead.", 2.5, time);
      level.lockedSaidAt = time;
    } else nextLevel(time);
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

  applyShiftToLights(time);
  const ticks = updateLights(level.world, camera.position, time);
  if (audio) {
    audio.listen(camera.position, player.yaw);
    if (moved.stepped) audio.footstep(player.running, player.crouching);
    audio.voice(player.humming && !screens.dead);
    if ((player.stamina < 0.55 || player.exhausted) && time > (player.breathAt ?? 0)) {
      const effort = player.exhausted ? 1 : 1 - player.stamina / 0.55;
      audio.breath(effort);
      player.breathAt = time + 1.6 - effort * 0.75;
    }
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
  get time() { return time; },
  get audio() { return audio; },
  get entities() { return level.encounter.entities; },
  marks: () => marks,
  // test hooks
  touch(index) {
    onContact(level.encounter.entities[index], time);
  },
  get dead() { return screens.dead; },
  get tension() { return tension; },
  get plan() { return level.plan; },
  get archetype() { return level.archetype.id; },
  // what a level will be, without building it
  preview(depth) {
    const p = levelPlan(run.seed, depth, tier);
    return { archetype: p.archetype.id, roster: p.roster.map((d) => d.id), shift: p.shift?.id ?? null, task: p.task?.id ?? null, pace: p.pace };
  },
  get shift() { return level.shift?.id ?? null; },
  get task() {
    const t = level.task;
    return t && { id: t.task.id, complete: t.complete, targets: t.targets.map((x) => ({ x: x.mesh.position.x, z: x.mesh.position.z, done: x.done })) };
  },
  get items() { return level.items.map((i) => ({ kind: i.kind, x: i.mesh.position.x, z: i.mesh.position.z, taken: i.taken })); },
  get phantom() { return phantoms.current; },
  get notes() { return level.notes.map((n) => ({ text: n.text, x: n.mesh.position.x, z: n.mesh.position.z, read: n.read })); },
  stand(x, z) {
    player.x = x;
    player.z = z;
  },
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
