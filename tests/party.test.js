import { test } from "node:test";
import assert from "node:assert/strict";
import { createParty, touch, reachExit, startLevel, flick, alive, join, FLICK_EVERY } from "../src/game/party.js";

test("alone, it is the old rule: a second touch from the same thing ends the run", () => {
  const party = createParty();
  assert.deepEqual(touch(party, "p1", "smiler"), { fatal: false, first: true, echo: false, wipe: false });
  assert.equal(touch(party, "p1", "hounds").fatal, false, "a different thing is a first touch again");
  const last = touch(party, "p1", "smiler");
  assert.ok(last.fatal && last.wipe);
});

test("each player carries their own marks", () => {
  const party = createParty(["a", "b"]);
  touch(party, "a", "smiler");
  assert.equal(touch(party, "b", "smiler").first, true, "b has never been touched by it");
  assert.equal(touch(party, "a", "smiler").fatal, true);
});

test("in a group, the dead become Echoes and the run goes on", () => {
  const party = createParty(["a", "b"]);
  touch(party, "a", "hounds");
  const dead = touch(party, "a", "hounds");
  assert.ok(dead.fatal && dead.echo && !dead.wipe);
  assert.deepEqual(alive(party).map((p) => p.id), ["b"]);
  assert.equal(touch(party, "a", "hounds").fatal, false, "nothing more can happen to an Echo");
});

test("Echoes come back at the next exit if someone living reaches it", () => {
  const party = createParty(["a", "b"]);
  touch(party, "a", "x");
  touch(party, "a", "x");
  reachExit(party, "a");
  startLevel(party);
  assert.equal(alive(party).length, 1, "an Echo walking out alone doesn't count");
  reachExit(party, "b");
  startLevel(party);
  assert.equal(alive(party).length, 2);
  assert.equal(party.players.get("a").marks.size, 0, "and marks are forgotten");
});

test("if everyone falls, the whole group wakes at the checkpoint", () => {
  const party = createParty(["a", "b"]);
  for (const id of ["a", "b"]) {
    touch(party, id, "x");
    touch(party, id, "x");
  }
  assert.equal(alive(party).length, 0);
  startLevel(party, { wiped: true });
  assert.equal(alive(party).length, 2);
  for (const id of ["a", "b"]) {
    touch(party, id, "y");
    touch(party, id, "y");
  }
  startLevel(party);
  assert.equal(alive(party).length, 2, "even if nobody said it was a wipe");
});

test("an Echo flicks one panel a minute", () => {
  const party = createParty(["a", "b"]);
  assert.equal(flick(party, "a", 0), false, "the living can't");
  touch(party, "a", "x", 2, 5);
  touch(party, "a", "x", 2, 6);
  assert.equal(flick(party, "a", 10), true);
  assert.equal(flick(party, "a", 10 + FLICK_EVERY - 1), false);
  assert.equal(flick(party, "a", 10 + FLICK_EVERY), true);
});

test("someone joining mid-run starts unmarked, and turns a solo death into an echo", () => {
  const party = createParty(["p1"]);
  touch(party, "p1", "x");
  join(party, "p2");
  assert.equal(party.players.get("p2").marks.size, 0);
  const second = touch(party, "p1", "x");
  assert.ok(second.fatal && !second.wipe, "p2 is still standing");
});
