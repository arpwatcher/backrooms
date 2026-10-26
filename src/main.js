// Entry point: the run, the current level, and the loop that ties the
// player, lights, sound and HUD together.

import * as THREE from "three";
import { buildLevel } from "./game/build.js";
import { createLoopback } from "./net/loopback.js";
import { createHost, createPeer } from "./net/session.js";
import { createBuffer, push as pushSnapshot, sample as sampleSnapshots } from "./net/interpolate.js";
import { createBot, stepBot } from "./game/bot.js";
import { createRemotes } from "./render/remotes.js";
import { createInvite, answerInvite, rtcEndpoint } from "./net/rtc.js";
import { createCoopScreen } from "./ui/coop.js";
import { buildWorld, updateLights, cellCenter } from "./render/world.js";
import { almondWater, battery, exitDoor, placeInCell, breakerBox, placeOnWall, wallNote, puddle, printPool, locker } from "./render/props.js";
import { placeLockers, hiddenIn, insideOf } from "./game/lockers.js";
import { disposeTree } from "./render/dispose.js";
import { monochrome } from "./entities/monochrome.js";
import { puddleCells, createTracks, stepTracks, shoesWet } from "./game/wet.js";
import { itemKinds, BATTERY_CHARGE } from "./game/items.js";
import { createPlayer, stepPlayer } from "./game/player.js";
import { createInput } from "./game/input.js";
import { createAudio } from "./audio/sound.js";
import { stepLucidity } from "./game/lucidity.js";
import { createFlashlight, toggleFlashlight, stepFlashlight, beamStrength, recharge } from "./game/flashlight.js";
import { createRun, levelSeed, descend, drinkAlmondWater } from "./game/run.js";
import { createHud } from "./ui/hud.js";
import { createPost } from "./render/post.js";
import { preloadModels } from "./render/models.js";
import { createPortrait } from "./render/portrait.js";
import { createSightings, stepSightings, chaseIntensity, heartRate } from "./game/sighting.js";
import { createScreens } from "./ui/screens.js";
import { CELL } from "./world/units.js";
import { Rng } from "./core/rng.js";
import { createPathfinder } from "./world/path.js";
import { createEncounter, makeSense } from "./game/encounter.js";
import { cellAt } from "./entities/core.js";
import { createParty, touch, reachExit, startLevel, member, join } from "./game/party.js";
import { createTrail, stepTrail } from "./game/shifts.js";
import { placeTask, doneCount } from "./game/tasks.js";
import { placeNotes } from "./game/notes.js";
import { TIERS, createTension, stepTension, noteContact } from "./game/director.js";
import { levelPlan } from "./game/plan.js";
import { loadCodex, recordSurvival } from "./game/codex.js";
import { createCodexScreen } from "./ui/codex.js";
import { createPauseScreen } from "./ui/pause.js";
import { createHelp } from "./ui/help.js";
import { createEnding } from "./ui/ending.js";
import { radioSchedule } from "./game/story.js";
import { createHints, stepHints } from "./game/hints.js";
import { exitBearing } from "./game/compass.js";
import { loadSettings, saveSettings } from "./game/settings.js";
import { loadRecords, recordDepth, describeRecords } from "./game/records.js";
import { createPhantoms, stepPhantoms } from "./game/phantoms.js";
import { loadMilestones, checkMilestones, MILESTONES } from "./game/milestones.js";
import { ENTITIES } from "./entities/index.js";
import { facelingsBody, smilerMesh } from "./render/entities.js";
import { lineOfSight } from "./world/sight.js";
import { checkpointFor } from "./game/run.js";

const params = new URLSearchParams(location.search);
const smoke = params.has("smoke");

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: smoke });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// filmic tone mapping: the beam and the panels roll off instead of clipping
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const post = createPost(renderer);
const portrait = createPortrait();

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
// ?depth=4 starts the run on that level (to try a level, or show it to someone)
const startDepth = Number(params.get("depth"));
if (Number.isInteger(startDepth) && startDepth > 0 && startDepth <= 500) run.depth = startDepth;
const flashlight = createFlashlight();
const input = createInput(canvas);
const hud = createHud();
const screens = createScreens();
const help = createHelp();
const ending = createEnding({
  onContinue() {
    run.endedStory = true;
    input.lock();
    nextLevel();
  },
  onRestart: () => location.reload(),
});
// first-level hints, remembered so each is only ever shown once
// lucid only: a faint arrow down the path to the nearest exit
const arrow = document.createElement("div");
arrow.id = "arrow";
document.body.appendChild(arrow);
function showArrow() {
  const bearing = tier.name === "lucid" && !screens.dead ? exitBearing(player, level.layout.exits, level.paths) : null;
  arrow.style.opacity = bearing ? "0.55" : "0";
  if (bearing) arrow.style.transform = `translateX(-50%) rotate(${-bearing.angle}rad)`;
  return bearing;
}
// looking out through the slats of a locker door
const slats = document.createElement("div");
slats.id = "slats";
slats.style.cssText = "position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .25s;background:repeating-linear-gradient(to bottom, rgba(0,0,0,.9) 0 22px, rgba(0,0,0,.12) 22px 36px);";
document.body.appendChild(slats);
const hintLine = document.createElement("div");
hintLine.id = "hint";
hintLine.style.zIndex = "5";
document.body.appendChild(hintLine);
const hints = createHints(loadSeenHints());
const hintState = { walked: 0, toggledLight: false, crouched: false };
function loadSeenHints() {
  try {
    return new Set(JSON.parse(localStorage.getItem("noclip.hints.v1") || "[]"));
  } catch {
    return new Set();
  }
}
function showHints(time, travelled) {
  hintState.walked += travelled;
  hintState.crouched ||= player.crouching;
  const before = hints.seen.size;
  const text = stepHints(hints, { ...hintState, depth: run.depth, time }) ?? "";
  if (hintLine.textContent !== text) hintLine.textContent = text;
  hintLine.style.opacity = text ? "1" : "0";
  if (hints.seen.size !== before) {
    try {
      localStorage.setItem("noclip.hints.v1", JSON.stringify([...hints.seen]));
    } catch {}
  }
}
const codex = loadCodex();
const codexScreen = createCodexScreen(codex);
document.getElementById("codex-open").addEventListener("click", () => codexScreen.open());
// game time only runs while you're playing, so pausing never lets a timer
// run out behind your back
let time = 0;
// everyone in the run, each with their own marks (co-op step 2: one player for now)
let party = createParty(["p1"]);
let wiped = false;
// who has already turned on you, so each hunt stings once (reset per level)
let sightings = createSightings();
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
    disposeTree(level.world.group);
  }
  if (level?.encounter) level.encounter.dispose();
  const built = buildLevel(run.seed, run.depth, tier);
  const { director: plan, roster, archetype, shift, task: picked, pace, ending } = built.plan;
  const { layout } = built;
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
  player.id = "p1";
  startLevel(party, { wiped });
  wiped = false;
  tension = createTension();
  const task = picked ? placeTask(picked, layout, new Rng(`${levelSeed(run)}/task-place`)) : null;
  if (task) {
    for (const target of task.targets) {
      target.mesh = placeOnWall(breakerBox(), target.x, target.y, target.side);
      world.group.add(target.mesh);
    }
    for (const exit of exits) exit.door.userData.setLocked(true);
  }
  // places to hide: crouch inside one and nothing sees you
  const lockers = placeLockers(layout, run.depth, new Rng(`${levelSeed(run)}/lockers`)).map((spot) => {
    const mesh = locker();
    placeOnWall(mesh, spot.x, spot.y, spot.side);
    world.group.add(mesh);
    return { ...spot, mesh };
  });
  const notes = placeNotes(layout, run.depth, new Rng(`${levelSeed(run)}/notes`)).map((note, i) => {
    const mesh = placeOnWall(wallNote(i + run.depth * 7 + 1), note.x, note.y, note.side);
    world.group.add(mesh);
    return { ...note, mesh, read: false };
  });
  // wet floors: the damp archetype, a soaked level, or someone who mops
  const wetFloor = archetype.id === "damp" || shift?.id === "soaked" || roster.some((d) => d.layout?.puddles);
  const puddles = wetFloor ? puddleCells(layout, new Rng(`${levelSeed(run)}/puddles`)) : [];
  for (const p of puddles) {
    const mesh = puddle();
    mesh.position.x = (p.x + 0.5) * CELL;
    mesh.position.z = (p.y + 0.5) * CELL;
    world.group.add(mesh);
  }
  const prints = printPool();
  world.group.add(prints);
  phantoms = createPhantoms();
  sightings = createSightings();
  for (const mesh of Object.values(phantomMeshes)) mesh.visible = false;
  level = { lockers, ending, radio: radioSchedule(run.depth, time + 4.5), tracks: createTracks(puddles), prints, layout, world, items, exits, paths, plan, archetype, shift, effects, task, pace, notes, trail: createTrail() };
  if (coop) startCoop();
  // hosting: everyone goes to the new level with you
  if (net?.role === "host") net.session.restart(run.depth, tier.name);
  if (effects.noFlashlight) flashlight.on = false;
  level.encounter = createEncounter({
    scene: world.group, layout, roster, rng: new Rng(`${levelSeed(run)}/entities`), paths, lightAt, tier,
  });
}

// milestones: checked against what just happened, shown quietly when earned
const earned = loadMilestones();
function milestone(event) {
  for (const m of checkMilestones(earned, event)) {
    setTimeout(() => hud.say(`- ${m.text} -`, 4, time), 2500);
  }
  showMilestones();
}
function showMilestones() {
  const list = document.getElementById("milestones");
  if (!list) return;
  list.textContent = MILESTONES.filter((m) => earned.has(m.id)).map((m) => m.text).join("\n");
}

function onContact(entity, time, verdict = null) {
  // your own second touch from the same thing ends it for you (an Echo of
  // yourself has no screen yet, so it's the death screen even in a group);
  // in someone else's game their host decides, and says so in `verdict`
  const { fatal } = verdict ?? touch(party, player.id, entity.kind, tier.contacts, time);
  run.touches = (run.touches ?? 0) + 1;
  noteContact(tension, time);
  if (fatal) {
    run.deaths += 1;
    hud.hush();
    portrait.show(entity.kind, window.innerWidth / window.innerHeight);
    screens.die(entity.def, () => {
      // in someone else's game you wake where they are
      run.depth = net?.role === "peer" ? net.session.state.start.depth : checkpointFor(run.depth);
      player = null;
      wiped = true;
      loadLevel();
      input.lock();
    });
    return;
  }
  // first contact: knocked down, shaken, and it backs off
  player.downUntil = time + 2.2;
  player.lucidity = Math.max(0, player.lucidity - 0.3);
  screens.hit();
  fear = 1;
  audio?.hit();
  level.encounter.retreat(entity, time);
  milestone({ type: "survived" });
  if (recordSurvival(codex, entity.kind)) {
    hud.say(`codex: ${entity.def.name} - ${entity.def.counter}`, 7, time);
    milestone({ type: "met", known: ENTITIES.filter((d) => codex.has(d.id)).length, total: ENTITIES.length });
  }
  else hud.say(`${entity.def.name} marked you. it won't let go next time.`, 5, time);
}

function useTask(time) {
  const near = new THREE.Vector3(player.x, 0, player.z);
  const i = level.task.targets.findIndex((t) => !t.done && t.mesh.position.distanceTo(near) < 1.3);
  if (i < 0) return;
  throwBreaker(i, time);
  // in co-op everyone's level has the same breakers: tell the others
  if (net?.role === "host") for (const name of net.session.peers.keys()) net.session.send(name, { type: "event", kind: "task", index: i });
  else if (net?.role === "peer") net.session.send({ type: "event", kind: "task", index: i });
}

function throwBreaker(i, time) {
  const { task, world } = level;
  const target = task?.targets[i];
  if (!target || target.done) return;
  target.done = true;
  task.complete = task.targets.every((t) => t.done);
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
  if (task.complete) {
    for (const exit of level.exits) exit.door.userData.setLocked(false);
    milestone({ type: "task", roster: level.plan.roster.map((d) => d.id) });
  }
}

// the figures low lucidity puts at the edge of your vision: a dark shape of
// a person, or a grin. One at a time, never straight ahead.
// co-op without a second person: ?bot (or __noclip.addBot()) puts a stand-in
// player on a host behind a loopback; it reaches this page as snapshots, the
// way a real peer would, and is drawn interpolated like one
const remotes = createRemotes(scene);
let coop = null;
function startCoop() {
  remotes.clear();
  const net = createLoopback({ delay: 2 });
  const host = createHost(net.endpoint("host"), { seed: run.seed, depth: run.depth, tier: tier.name });
  const peer = createPeer(net.endpoint("me"), { host: "host", name: "me" });
  const s = cellCenter(level.layout.start.x, level.layout.start.y);
  const bot = createBot("bot", s.x + 0.6, s.z + 0.6, new Rng(`${levelSeed(run)}/bot`));
  join(party, "bot");
  coop = { net, host, peer, bot, buffer: createBuffer() };
}
// something reached another player: their marks, their fall; the thing
// backs off from them the way it does from you
function otherContact(event, time) {
  const verdict = touch(party, event.player.id, event.entity.kind, tier.contacts, time);
  if (verdict.first) level.encounter.retreat(event.entity, time);
  // a real friend: tell their game what happened to them
  if (net?.role === "host" && net.session.peers.has(event.player.id)) {
    net.session.send(event.player.id, { type: "event", kind: "contact", entity: event.entity.kind, fatal: verdict.fatal });
  }
}
function stepCoop(dt) {
  if (!coop) return;
  // an Echo stays where it fell
  coop.bot.echo = member(party, "bot").echo;
  if (!coop.bot.echo) stepBot(coop.bot, level.paths, dt);
  coop.host.tick(time, [coop.bot], []);
  coop.net.pump();
  if (coop.peer.state.view) pushSnapshot(coop.buffer, coop.peer.state.view);
  const newest = coop.buffer.snapshots.at(-1);
  const seen = newest ? sampleSnapshots(coop.buffer, newest.t) : null;
  if (seen) frameRemotes.push(...seen.players);
}

// real co-op over webrtc; null while you play alone. The host runs the
// level and sends it out; a peer builds the same level from the seed and
// shows the host's monsters where the snapshots put them.
let net = null;
let frameRemotes = [];
function hostNet() {
  if (net?.role !== "host") {
    const endpoint = rtcEndpoint("host");
    net = { role: "host", endpoint, session: createHost(endpoint, { seed: run.seed, depth: run.depth, tier: tier.name }), others: [] };
  }
  return net;
}
function stepNet() {
  if (!net) return;
  if (net.role === "host") {
    const others = [];
    // a friend whose connection died leaves the game
    for (const [name, l] of net.endpoint.links) {
      if (!["failed", "closed"].includes(l.state)) continue;
      net.endpoint.links.delete(name);
      net.session.peers.delete(name);
      hud.say(`${name} has gone`, 4, time);
    }
    for (const name of net.session.peers.keys()) {
      const i = net.session.inputOf(name);
      if (!i) continue;
      join(party, name);
      others.push({ id: name, x: i.x, z: i.z, yaw: i.yaw, noise: i.noise ?? 0, running: Boolean(i.running), crouching: Boolean(i.crouching), humming: Boolean(i.humming), echo: member(party, name).echo });
    }
    net.others = others;
    // a friend threw a breaker: throw it here, and tell the rest
    while (net.session.events.length) {
      const e = net.session.events.shift();
      if (e.kind !== "task") continue;
      throwBreaker(e.index, time);
      for (const name of net.session.peers.keys()) if (name !== e.from) net.session.send(name, { type: "event", kind: "task", index: e.index });
    }
    const me = { id: "host", x: player.x, z: player.z, yaw: player.yaw, noise: player.noise, echo: null };
    net.session.tick(time, [me, ...others], level.encounter.entities.map((e) => ({ id: e.slot, x: e.x, z: e.z, facing: e.facing ?? 0, state: e.state })));
    frameRemotes.push(...others);
    return;
  }
  const s = net.session.state;
  // the host has gone: carry on alone in their level, the monsters yours now
  const link = net.endpoint.links.get("host");
  if (["failed", "closed"].includes(link?.state) && s.start) {
    hud.say("the host is gone - you're on your own now", 5, time);
    net = null;
    return;
  }
  if (!s.start) return;
  const key = `${s.start.seed}/${s.start.depth}/${s.start.tier}`;
  if (key !== net.startKey) {
    net.startKey = key;
    run.seed = s.start.seed;
    run.depth = s.start.depth;
    tier = TIERS[s.start.tier] ?? tier;
    net.buffer = createBuffer();
    loadLevel();
    return;
  }
  if (time - (net.sentAt ?? -1) > 1 / 30) {
    net.sentAt = time;
    net.session.sendInput(time, { x: player.x, z: player.z, yaw: player.yaw, noise: player.noise, running: player.running, crouching: player.crouching, humming: player.humming });
  }
  if (s.view) pushSnapshot(net.buffer, s.view);
  const newest = net.buffer.snapshots.at(-1);
  const seen = newest ? sampleSnapshots(net.buffer, newest.t) : null;
  if (seen) {
    level.encounter.mirror(seen.entities, time);
    frameRemotes.push(...seen.players.filter((p) => p.id !== s.start.you));
  }
  while ((net.seenEvents ?? 0) < s.events.length) {
    const e = s.events[(net.seenEvents = (net.seenEvents ?? 0) + 1) - 1];
    const thing = level.encounter.entities.find((x) => x.kind === e.entity);
    if (e.kind === "contact" && thing && !screens.dead) onContact(thing, time, { fatal: e.fatal });
    if (e.kind === "task") throwBreaker(e.index, time);
        if (e.kind === "darken") {
      const deadline = level.encounter.entities.find((x) => x.slot === e.slot);
      if (deadline?.dist) darkenTo(deadline.dist, e.front);
    }
  }
}
async function inviteFriend(options) {
  const n = hostNet();
  if (n.endpoint.links.size >= 3) throw new Error("four players is the most");
  const invite = await createInvite(options);
  n.endpoint.add(`p${n.endpoint.links.size + 2}`, invite.link);
  return invite;
}
async function joinFriend(code, options) {
  const answer = await answerInvite(code, options);
  const endpoint = rtcEndpoint("me");
  endpoint.add("host", answer.link);
  net = { role: "peer", endpoint, session: createPeer(endpoint, { host: "host", name: "friend" }) };
  return answer;
}
const coopScreen = createCoopScreen({ onHost: () => inviteFriend(), onJoin: (code) => joinFriend(code), onClose: () => coopScreen.hide() });

const phantomMeshes = { figure: facelingsBody(), grin: smilerMesh() };
for (const mesh of Object.values(phantomMeshes)) {
  mesh.visible = false;
  scene.add(mesh);
}
phantomMeshes.figure.traverse((o) => o.material?.color?.setHex(0x0d0b07));
function updatePhantoms(time) {
  const view = { x: player.x, z: player.z, yaw: player.yaw };
  // as far as it can stand in plain view; in cramped levels that's closer
  const place = (angle, distance) => {
    for (const d of [distance, distance * 0.6, distance * 0.4]) {
      const x = player.x - Math.sin(angle) * d;
      const z = player.z - Math.cos(angle) * d;
      const inside = x > 0.5 && z > 0.5 && x < level.layout.width * CELL - 0.5 && z < level.layout.height * CELL - 0.5;
      if (inside && lineOfSight(level.layout, player.x, player.z, x, z)) return { x, z };
    }
    return null;
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

// Deadline's dark: every panel up to its front goes out, with a tick
function darkenTo(dist, front) {
  for (const panel of level.world.panels) {
    if (panel.state === "dead" || (dist[panel.y]?.[panel.x] ?? Infinity) > front) continue;
    panel.state = "dead";
    panel.level = 0;
    panel.mesh.material.color.setHex(0x3a3628);
    const p = panel.mesh.position;
    if (p.distanceToSquared(camera.position) < 400) audio?.flickerTick(p.x, p.y, p.z);
  }
}

// wet shoes leave prints; show the live ones on the carpet
const printMatrix = new THREE.Matrix4();
const printTurn = new THREE.Quaternion();
const printFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
function stepPrints(time) {
  const cell = { x: Math.floor(player.x / CELL), y: Math.floor(player.z / CELL) };
  const fresh = stepTracks(level.tracks, cell, time);
  if (fresh) fresh.yaw = player.yaw;
  const live = level.tracks.prints.slice(-level.prints.instanceMatrix.count);
  level.prints.count = live.length;
  live.forEach((p, i) => {
    printTurn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw ?? 0).multiply(printFlat);
    printMatrix.compose(new THREE.Vector3((p.x + 0.5) * CELL + (i % 2 ? 0.12 : -0.12), 0.014, (p.y + 0.5) * CELL), printTurn, new THREE.Vector3(1, 1, 1));
    level.prints.setMatrixAt(i, printMatrix);
  });
  level.prints.instanceMatrix.needsUpdate = true;
}

// what your feet land on, for the sound of them
function groundOf(look) {
  if (look.water) return "water";
  return ["concrete", "darkConcrete", "wetConcrete", "tile", "bigTile", "metal"].includes(look.floor) ? "hard" : "soft";
}

// every level: now and then the building makes a sound somewhere far off
const AMBIENT = ["slam", "ring", "steps", "vent"];
function ambience(time) {
  if (time < (level.ambientAt ??= time + 20 + Math.random() * 25)) return;
  level.ambientAt = time + 30 + Math.random() * 45;
  const angle = Math.random() * Math.PI * 2;
  const distance = 18 + Math.random() * 14;
  const kind = AMBIENT[Math.floor(Math.random() * AMBIENT.length)];
  audio?.ambient(kind, player.x + Math.cos(angle) * distance, 1.5, player.z + Math.sin(angle) * distance);
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

// walking into an exit: the world stretches away from you, you fall, and you
// land somewhere else. (callbacks read the live game clock, not a copy)
function nextLevel() {
  if (transitioning || net?.role === "peer") return;
  // the last story level's door is the way out
  if (level.ending && !run.endedStory) {
    milestone({ type: "ending" });
    ending.show({ deaths: run.deaths, depth: run.depth });
    return;
  }
  transitioning = true;
  fallingSince = time;
  reachExit(party, player.id);
  milestone({
    type: "left", depth: run.depth, touchesThisRun: run.touches ?? 0, pace: level.pace,
    roster: level.plan.roster.map((d) => d.id),
    enteredParty: level.encounter.entities.some((e) => e.kind === "partygoers" && e.memory.invitedAt !== undefined),
  });
  audio?.fall();
  fade.style.opacity = "1";
  setTimeout(() => {
    descend(run);
    if (recordDepth(records, tier.name, run.depth)) showRecords();
    loadLevel();
    fade.style.opacity = "0";
    fallingSince = null;
    hud.say(`level ${run.depth} - ${level.archetype.name}`, 3.5, time + 1);
    const notes = [level.shift?.note, level.task?.task.note].filter(Boolean);
    notes.forEach((note, i) => setTimeout(() => hud.say(note, 6, time), 4200 + i * 6500));
    transitioning = false;
  }, 950);
}
let fallingSince = null;

// real models first (a second or two), then the first level
await preloadModels();
loadLevel();
if (params.has("bot")) startCoop();
const enterButton = document.getElementById("enter");
enterButton.disabled = false;
enterButton.textContent = "enter";

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
showMilestones();

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
  onCoop: () => coopScreen.show(),
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
  post.resize();
});

const clock = new THREE.Clock();
let frames = 0;
let bob = 0;
// 0..1, spikes when something sees you or touches you, then fades
let fear = 0;
let portraitTime = 0;
let shake = 0;
function frame() {
  const real = Math.min(clock.getDelta(), 0.1);
  if (pause.shown || codexScreen.isOpen || ending.shown) {
    input.read();
    post.render(scene, camera, { time });
    requestAnimationFrame(frame);
    return;
  }
  // dead: the thing that got you, close, behind the death screen
  if (screens.dead) {
    input.read();
    hintLine.style.opacity = "0";
    portraitTime += real;
    portrait.animate(portraitTime);
    post.render(portrait.scene, portrait.camera, { time: portraitTime, fear: 0.35, unease: 0.6 });
    frames++;
    requestAnimationFrame(frame);
    return;
  }
  const dt = real;
  time += dt;
  const frameInput = input.read();
  frameInput.lookX *= settings.sensitivity;
  frameInput.lookY *= settings.sensitivity;
  if (frameInput.pressed.has("KeyH")) help.toggle();
  if (frameInput.pressed.has("KeyF")) {
    if (level.effects.noFlashlight) hud.say("click. nothing.", 1.5, time);
    else toggleFlashlight(flashlight);
    hintState.toggledLight = true;
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
  level.hidden = Boolean(hiddenIn(level.lockers, player)) && !screens.dead;
  slats.style.opacity = level.hidden ? "1" : "0";
  const sense = makeSense({
    player, flashlight, camera, layout: level.layout, paths: level.paths, lightAt, time, darkCells: level.encounter.darkCells, prints: level.tracks.prints,
    hidden: level.hidden,
    others: [...(coop ? [coop.bot] : []), ...(net?.others ?? [])],
  });
  if (!screens.dead) {
    for (const event of net?.role === "peer" ? [] : level.encounter.update(sense, dt)) {
      if (event.type === "sound") audio?.entity(event.sound, event.x, 1.2, event.z, event.volume);
      else if (event.type === "drain" && event.what === "battery") flashlight.battery = Math.max(0, flashlight.battery - event.amount);
      else if (event.type === "contact" && event.player && event.player !== player) otherContact(event, time);
      else if (event.type === "contact" && !down) onContact(event.entity, time);
      else if (event.type === "darken") {
        darkenTo(event.entity.dist, event.front);
        // friends' panels go out with yours
        if (net?.role === "host") for (const name of net.session.peers.keys()) net.session.send(name, { type: "event", kind: "darken", slot: event.entity.slot, front: event.front });
      }
    }
  }
  frameRemotes = [];
  stepCoop(dt);
  stepNet();
  remotes.update(frameRemotes);
  // Monochrome's grey: standing in it drains the colour from your eyes; near
  // its edge, some of it
  let greyTarget = 0;
  const here = cellAt(player.x, player.z);
  for (const e of level.encounter.entities) {
    if (e.def.id !== "monochrome") continue;
    if (monochrome.isGrey(e, here, time)) greyTarget = 1;
    else {
      let near = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (monochrome.isGrey(e, { x: here.x + dx, y: here.y + dy }, time)) near++;
      greyTarget = Math.max(greyTarget, Math.min(0.6, near * 0.06));
    }
  }
  level.grey = (level.grey ?? 0) + (greyTarget - (level.grey ?? 0)) * Math.min(1, dt * 1.5);
  const nearest = Math.min(...level.encounter.entities.map((e) => Math.hypot(e.x - player.x, e.z - player.z)));
  const hunting = level.encounter.entities.filter((e) => e.def.hunting?.(e)).length;
  if (stepTension(tension, { nearest, hunting, time, tier }, dt) === "mercy") {
    level.encounter.calm(sense, tier.mercyFor);
    audio?.setHum(0.55, 3);
    setTimeout(() => audio?.setHum(1, 6), tier.mercyFor * 1000);
    hud.say("the hum softens. something lets go of you, for now.", 4, time);
  }
  // something just turned on you: a sting, a jolt, the image tears
  for (const e of stepSightings(sightings, level.encounter.entities, player, time)) {
    audio?.sting(e.x, 1.4, e.z);
    fear = Math.max(fear, 0.75);
    shake = Math.max(shake, 0.7);
  }
  showHints(time, moved.travelled);
  if (level.hidden) {
    hintLine.textContent = "inside the locker: nothing can see you while you stay down";
    hintLine.style.opacity = "1";
  }
  level.bearing = showArrow();
  // the chase: a drone that swells and your heart in your ears
  const chase = chaseIntensity(level.encounter.entities, player);
  level.chase = chase;
  if (audio) {
    audio.setChase(screens.dead ? 0 : chase);
    if (chase > 0.15 && time > (level.beatAt ?? 0)) {
      audio.heartbeat(chase);
      level.beatAt = time + 60 / heartRate(chase);
    }
  }
  // elena, on the radio
  while (level.radio.length && time >= level.radio[0].at && !screens.dead) {
    hud.radio(level.radio.shift().text, time);
    audio?.radio();
  }
  if (level.pace === "silence") phantomTells(time);
  stepPrints(time);
  ambience(time);
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
    } else nextLevel();
  }

  bob += moved.travelled * (player.running ? 5.2 : 6.4);
  const bobHeight = moved.travelled > 0 ? Math.sin(bob) * (player.running ? 0.045 : 0.025) : 0;
  camera.position.set(player.x, (down ? 0.45 : player.height) + bobHeight, player.z);
  shake = Math.max(0, shake - dt * 1.4);
  const jolt = shake * shake * 0.035;
  camera.rotation.set(player.pitch + (Math.random() - 0.5) * jolt, player.yaw + (Math.random() - 0.5) * jolt, (down ? 0.5 : 0) + (Math.random() - 0.5) * jolt);
  // low lucidity: the room breathes
  const unease = Math.max(0, 0.6 - player.lucidity);
  camera.fov = 72 + Math.sin(time * 0.7) * unease * 9 + (fallingSince === null ? 0 : Math.min(1, (time - fallingSince) / 0.9) ** 2 * 60);
  camera.updateProjectionMatrix();
  beam.intensity = beamStrength(flashlight, time) * 16;

  applyShiftToLights(time);
  const ticks = updateLights(level.world, camera.position, time);
  if (audio) {
    audio.listen(camera.position, player.yaw);
    if (moved.stepped) audio.footstep(player.running, player.crouching, groundOf(level.archetype.look));
    if (moved.stepped && shoesWet(level.tracks, time)) audio.squelch();
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
  fear = Math.max(0, fear - dt * 1.2);
  post.render(scene, camera, { time, fear, unease: Math.max(0, 0.5 - player.lucidity) * 2, grey: level.grey ?? 0 });
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
  get gpu() { return { ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0 }; },
  get time() { return time; },
  get helpShown() { return help.shown; },
  get hint() { return hintLine.textContent; },
  get lockers() { return level.lockers.map((l) => ({ cell: { x: l.x, y: l.y }, ...insideOf(l) })); },
  get hidden() { return level.hidden; },
  get grey() { return level.grey ?? 0; },
  addBot() { startCoop(); },
  // co-op over webrtc without the buttons (no stun: the test pages share a machine)
  async coopInvite() { window.__invite = await inviteFriend({ iceServers: [] }); return window.__invite.code; },
  async coopAccept(code) { await window.__invite.accept(code); },
  async coopJoin(code) { return (await joinFriend(code, { iceServers: [] })).code; },
  get coop() { return net ? { role: net.role, peers: net.role === "host" ? [...net.session.peers.keys()] : null, you: net.session.state?.start?.you ?? null, seed: run.seed, depth: run.depth, links: [...net.endpoint.links].map(([n, l]) => `${n}:${l.state}:${l.channels}`) } : null; },
  get remotes() { return [...remotes.figures].map(([id, f]) => ({ id, x: f.position.x, z: f.position.z })); },
  get radioState() { return { time, queued: level.radio.map((r) => r.at), paused: pause.shown, dead: Boolean(screens.dead), ending: ending.shown }; },
  get bearing() { return level.bearing ?? null; },
  get chase() { return level.chase ?? 0; },
  get endingShown() { return ending.shown; },
  get audio() { return audio; },
  get entities() { return level.encounter.entities; },
  marks: () => member(party, "p1").marks,
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
  // test hook: every panel on the level goes out
  darkAll() {
    for (const panel of level.world.panels) {
      panel.state = "dead";
      panel.level = 0;
      panel.mesh.material.color.setHex(0x3a3628);
    }
  },
  // test hook: is this point open floor (inside the level, no wall crossed from the player)?
  clear(x, z) {
    return x > 0 && z > 0 && x < level.layout.width * CELL && z < level.layout.height * CELL && lineOfSight(level.layout, player.x, player.z, x, z);
  },
  // tool hook: an unbroken line between two points (walls and pillars block)
  sees(ax, az, bx, bz) {
    return lineOfSight(level.layout, ax, az, bx, bz);
  },
  get litPanels() { return level.world.panels.filter((p) => p.state !== "dead").length; },
  get tracks() {
    const [first] = level.tracks.wet;
    return { puddles: level.tracks.wet.size, first: first?.split(",").map(Number), prints: level.tracks.prints.length };
  },
  wetAt: (x, y) => level.tracks.wet.has(`${x},${y}`),
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
