import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLayout } from "../src/world/layout.js";
import { createPathfinder } from "../src/world/path.js";
import { lineOfSight } from "../src/world/sight.js";
import { CELL } from "../src/world/units.js";
import { Rng } from "../src/core/rng.js";
import { contact, spawn } from "../src/entities/core.js";
import { smiler } from "../src/entities/smiler.js";
import { hounds } from "../src/entities/hounds.js";
import { stillLife, WAKE_TIME } from "../src/entities/stillLife.js";
import { deathmoths } from "../src/entities/deathmoths.js";
import { partygoers, inRoom } from "../src/entities/partygoers.js";

function open(width = 12, height = 12) {
  return generateLayout({ seed: "arena", width, height, wallRuns: 0, rooms: 0, pillarChance: 0 });
}
const c = (n) => (n + 0.5) * CELL;

function senseFor(layout, player, { light = () => "dark", beam = () => false, time = 0 } = {}) {
  return {
    player: { noise: 0, running: false, crouching: false, ...player },
    lightAt: light,
    beamOn: beam,
    canSee: (e, range) => Math.hypot(e.x - player.x, e.z - player.z) <= range && lineOfSight(layout, e.x, e.z, player.x, player.z),
    paths: createPathfinder(layout),
    time,
  };
}

function run(def, entity, sense, seconds, dt = 0.05) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    sense.time += dt;
    events.push(...def.update(entity, sense, dt));
  }
  return events;
}

test("first contact marks you, the second with the same thing kills", () => {
  const marks = new Map();
  assert.deepEqual(contact(marks, "smiler"), { fatal: false, first: true });
  assert.deepEqual(contact(marks, "hounds"), { fatal: false, first: true });
  assert.deepEqual(contact(marks, "smiler"), { fatal: true, first: false });
});

test("the easiest tier lets you live through one more touch", () => {
  const marks = new Map();
  assert.equal(contact(marks, "hounds", 3).fatal, false);
  assert.equal(contact(marks, "hounds", 3).fatal, false);
  assert.equal(contact(marks, "hounds", 3).fatal, true);
});

test("the smiler closes in while you stand in the dark", () => {
  const layout = open();
  const e = spawn(smiler, { x: 8, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) });
  const before = Math.abs(e.x - c(2));
  const events = run(smiler, e, sense, 2);
  assert.ok(Math.abs(e.x - c(2)) < before - 2);
  assert.ok(events.some((ev) => ev.type === "sound" && ev.sound === "teeth"), "you hear it first");
});

test("the smiler does not move while you stand in the light", () => {
  const layout = open();
  const e = spawn(smiler, { x: 8, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) }, { light: (x) => (x < c(4) ? "lit" : "dark") });
  const startX = e.x;
  run(smiler, e, sense, 3);
  assert.ok(Math.abs(e.x - startX) < 0.01);
});

test("a flashlight on the smiler pushes it back and costs battery", () => {
  const layout = open();
  const e = spawn(smiler, { x: 6, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) }, { beam: () => true });
  const startX = e.x;
  const events = run(smiler, e, sense, 1);
  assert.ok(e.x > startX + 1);
  assert.ok(events.some((ev) => ev.type === "drain" && ev.what === "battery"));
});

test("a smiler that reaches you in the dark makes contact", () => {
  const layout = open();
  const e = spawn(smiler, { x: 4, y: 2 });
  const sense = senseFor(layout, { x: c(2), z: c(2) });
  const events = run(smiler, e, sense, 5);
  assert.ok(events.some((ev) => ev.type === "contact"));
});

test("hounds hear a runner from far away but not a crouching player", () => {
  const e = spawn(hounds, { x: 9, y: 2 });
  const far = { x: c(2), z: c(2), noise: 1, running: true };
  assert.equal(hounds.heard(e, { player: far }), true);
  assert.equal(hounds.heard(e, { player: { ...far, running: false, crouching: true, noise: 0.15 } }), false);
  assert.equal(hounds.heard(e, { player: { ...far, running: false, noise: 0 } }), false);
});

test("hounds run to where they heard you, then lose you if you go quiet", () => {
  const layout = open(20, 12);
  // 7 cells = 16.8 m: inside a sprint's 20 m, outside a walk's 9 m
  const e = spawn(hounds, { x: 10, y: 5 }, { rng: new Rng(1) });
  const sense = senseFor(layout, { x: c(3), z: c(5), noise: 1, running: true });
  const player = sense.player;
  run(hounds, e, sense, 0.1);
  assert.equal(e.state, "hunt");
  // the player stops dead and slips a few cells away
  player.noise = 0;
  player.running = false;
  player.z = c(10);
  run(hounds, e, sense, 8);
  assert.notEqual(e.state, "hunt");
  assert.ok(Math.hypot(e.x - player.x, e.z - player.z) > 2, "it lost you");
});

test("a hound that catches a noisy player makes contact", () => {
  const layout = open(14, 8);
  // 3 cells = 7.2 m, inside walking earshot
  const e = spawn(hounds, { x: 6, y: 3 }, { rng: new Rng(2) });
  const sense = senseFor(layout, { x: c(3), z: c(3), noise: 0.45 });
  const events = run(hounds, e, sense, 6);
  assert.ok(events.some((ev) => ev.type === "contact"));
  assert.ok(events.some((ev) => ev.sound === "panting"), "the panting comes first");
});

test("idle hounds wander instead of standing still", () => {
  const layout = open();
  const e = spawn(hounds, { x: 6, y: 6 }, { rng: new Rng(5) });
  const sense = senseFor(layout, { x: c(0), z: c(0), noise: 0 });
  const start = { x: e.x, z: e.z };
  run(hounds, e, sense, 6);
  assert.ok(Math.hypot(e.x - start.x, e.z - start.z) > 1);
});

import { loadCodex, recordSurvival } from "../src/game/codex.js";

test("the codex remembers what you survived, once each, across loads", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const codex = loadCodex(storage);
  assert.equal(recordSurvival(codex, "smiler", storage), true);
  assert.equal(recordSurvival(codex, "smiler", storage), false);
  assert.deepEqual([...loadCodex(storage)], ["smiler"]);
});

test("a broken or missing store gives an empty codex instead of an error", () => {
  assert.equal(loadCodex({ getItem: () => "not json" }).size, 0);
  assert.equal(loadCodex(undefined).size, 0);
  const codex = new Set();
  assert.equal(recordSurvival(codex, "hounds", { setItem: () => { throw new Error("quota"); } }), true);
});

test("still life sleeps until you come near, then scrapes for a while before it moves", () => {
  const layout = open();
  const e = spawn(stillLife, { x: 9, y: 9 });
  const sense = { ...senseFor(layout, { x: c(1), z: c(1) }), watching: () => false };
  assert.equal(run(stillLife, e, sense, 3).length, 0, "far away it does nothing");
  sense.player.x = c(5);
  sense.player.z = c(5);
  const start = { x: e.x, z: e.z };
  const events = run(stillLife, e, sense, WAKE_TIME - 0.5);
  assert.deepEqual([e.x, e.z], [start.x, start.z], "it does not move while waking");
  assert.ok(events.filter((ev) => ev.sound === "scrape").length >= 3, "but you hear it");
});

test("still life cannot move while watched, and closes fast when it isn't", () => {
  const layout = open();
  const e = spawn(stillLife, { x: 8, y: 2 });
  let looking = true;
  const sense = { ...senseFor(layout, { x: c(2), z: c(2) }), watching: () => looking };
  run(stillLife, e, sense, WAKE_TIME + 1);
  const held = { x: e.x, z: e.z };
  run(stillLife, e, sense, 3);
  assert.deepEqual([e.x, e.z], [held.x, held.z]);
  looking = false;
  const events = run(stillLife, e, sense, 3);
  assert.ok(events.some((ev) => ev.type === "contact"), "unwatched for three seconds it reaches you");
});

test("looking back at it after it moved makes it scrape, so you know it came", () => {
  const layout = open();
  const e = spawn(stillLife, { x: 8, y: 2 });
  let looking = false;
  const sense = { ...senseFor(layout, { x: c(1), z: c(2) }), watching: () => looking };
  run(stillLife, e, sense, WAKE_TIME + 0.1);
  run(stillLife, e, sense, 0.6);
  looking = true;
  const events = run(stillLife, e, sense, 0.2);
  assert.ok(events.some((ev) => ev.sound === "scrape"));
});

test("deathmoths come for a flashlight in the dark, after a moment to notice it", () => {
  const layout = open();
  const e = spawn(deathmoths, { x: 6, y: 2 }, { rng: new Rng("m") });
  const sense = { ...senseFor(layout, { x: c(1), z: c(2) }), flashlightOn: true };
  run(deathmoths, e, sense, 1);
  assert.equal(e.state, "notice");
  const events = run(deathmoths, e, sense, 6);
  assert.ok(events.some((ev) => ev.type === "contact"));
});

test("deathmoths ignore you with the flashlight off, or under a working panel", () => {
  const layout = open();
  for (const [flashlightOn, light] of [[false, () => "dark"], [true, (x, z) => (Math.hypot(x - c(1), z - c(2)) < 2 ? "lit" : "dark")]]) {
    const e = spawn(deathmoths, { x: 6, y: 2 }, { rng: new Rng("m") });
    const sense = { ...senseFor(layout, { x: c(1), z: c(2) }, { light }), flashlightOn };
    const events = run(deathmoths, e, sense, 8);
    assert.ok(!events.some((ev) => ev.type === "contact"), `flashlight ${flashlightOn}`);
  }
});

test("switch off and they fly to where the light was, then lose interest", () => {
  const layout = open();
  const e = spawn(deathmoths, { x: 6, y: 2 }, { rng: new Rng("m") });
  const sense = { ...senseFor(layout, { x: c(1), z: c(2) }), flashlightOn: true };
  run(deathmoths, e, sense, 2.2);
  sense.flashlightOn = false;
  sense.player.x = c(1);
  sense.player.z = c(9);
  run(deathmoths, e, sense, 0.2);
  assert.equal(e.state, "search");
  run(deathmoths, e, sense, 8);
  assert.notEqual(e.state, "search");
});

test("each hound in a pack wanders its own way", () => {
  const layout = generateLayout({ seed: "pack" });
  const pack = hounds.spawn(layout, new Rng("pack"), {});
  assert.ok(pack.length >= 2);
  const sense = senseFor(layout, { x: c(layout.start.x), z: c(layout.start.y) });
  for (let t = 0; t < 20; t += 0.05) {
    sense.time = t;
    for (const h of pack) hounds.update(h, sense, 0.05);
  }
  const spots = new Set(pack.map((h) => `${h.x.toFixed(2)},${h.z.toFixed(2)}`));
  assert.equal(spots.size, pack.length);
});

function partyArena() {
  const layout = open(14, 14);
  const room = { x: 9, y: 9, w: 3, h: 3 };
  const rng = new Rng("party");
  const guests = [0, 1].map((i) => spawn(partygoers, { x: 10, y: 10 }, { room, host: i === 0, rng: rng.fork(`g${i}`) }));
  return { layout, room, guests };
}

test("partygoers stay at their party while you stay away, and you can hear it", () => {
  const { layout, room, guests } = partyArena();
  const sense = senseFor(layout, { x: c(3), z: c(3) });
  const events = [];
  for (let t = 0; t < 15; t += 0.05) {
    sense.time = t;
    for (const g of guests) events.push(...partygoers.update(g, sense, 0.05));
  }
  assert.ok(events.some((ev) => ev.sound === "party"));
  assert.ok(!events.some((ev) => ev.type === "contact"));
  for (const g of guests) assert.ok(inRoom(room, g.x, g.z, CELL), "still in the room");
});

test("walk into the party and they greet you, then come for you", () => {
  const { layout, guests } = partyArena();
  const sense = senseFor(layout, { x: c(9), z: c(9) });
  const events = [];
  for (let t = 0; t < 6; t += 0.05) {
    sense.time = t;
    for (const g of guests) events.push(...partygoers.update(g, sense, 0.05));
    if (t < 0.5) assert.ok(guests.every((g) => g.state === "greet" || g.state === "mingle"));
  }
  assert.ok(events.some((ev) => ev.type === "contact"));
});

test("get far enough from the party and they give up and go back", () => {
  const { layout, room, guests } = partyArena();
  const sense = senseFor(layout, { x: c(9), z: c(9) });
  for (let t = 0; t < 1.5; t += 0.05) {
    sense.time = t;
    for (const g of guests) partygoers.update(g, sense, 0.05);
  }
  sense.player.x = c(0);
  sense.player.z = c(0);
  for (let t = 1.5; t < 25; t += 0.05) {
    sense.time = t;
    for (const g of guests) partygoers.update(g, sense, 0.05);
  }
  for (const g of guests) assert.ok(inRoom(room, g.x, g.z, CELL), `back at the party (${g.state})`);
});

test("the party room is dressed: balloons inside it, a sign on one of its walls", () => {
  const layout = generateLayout({ seed: "dressed" });
  const guests = partygoers.spawn(layout, new Rng("dressed"));
  const props = partygoers.props(guests, layout, new Rng("dressed-props"));
  const room = guests[0].room;
  const balloons = props.filter((p) => p.kind === "balloon");
  assert.ok(balloons.length >= 4);
  for (const b of balloons) assert.ok(inRoom(room, b.x, b.z), "balloon inside the room");
  for (const s of props.filter((p) => p.kind === "sign")) {
    assert.equal(s.text, "=)");
    const y = s.side.dy === -1 ? s.y : s.y + 1;
    assert.ok(layout.north[y][s.x], "taped to a real wall");
  }
});
