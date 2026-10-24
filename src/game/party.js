// Who is in the run and how each of them is doing: co-op step 2. Every
// player carries their own marks (one touch from a thing knocks you down,
// the next from the same thing ends you), and in a group a player who dies
// becomes an Echo for the rest of the level instead of ending the run. When
// everyone is an Echo the group wakes at the checkpoint. With one player
// this is exactly the old single-player rule.

import { contact } from "../entities/core.js";

export const FLICK_EVERY = 60; // seconds between an Echo's panel flicks

export function createParty(ids = ["p1"]) {
  return { players: new Map(ids.map((id) => [id, { id, marks: new Map(), echo: null, reachedExit: false }])) };
}

// someone joins mid-run: they start unmarked and alive
export function join(party, id) {
  if (!party.players.has(id)) party.players.set(id, { id, marks: new Map(), echo: null, reachedExit: false });
  return party.players.get(id);
}

export function member(party, id) {
  return party.players.get(id) ?? party.players.values().next().value;
}

export function alive(party) {
  return [...party.players.values()].filter((p) => !p.echo);
}

// a touch from `kind`: { fatal, first, echo, wipe }. fatal means this player
// is done for the level; wipe means nobody is left standing.
export function touch(party, id, kind, allowed = 2, time = 0) {
  const p = member(party, id);
  if (p.echo) return { fatal: false, first: false, echo: true, wipe: false };
  const { fatal, first } = contact(p.marks, kind, allowed);
  if (fatal) p.echo = { since: time, flickedAt: -Infinity };
  const wipe = alive(party).length === 0;
  return { fatal, first, echo: Boolean(p.echo), wipe };
}

export function reachExit(party, id) {
  const p = member(party, id);
  if (!p.echo) p.reachedExit = true;
}

// a new level: marks are forgotten, and Echoes come back if anyone living
// made it to the exit (after a wipe, the checkpoint brings everyone back)
export function startLevel(party, { wiped = false } = {}) {
  const someoneOut = [...party.players.values()].some((p) => p.reachedExit);
  // nobody standing is a wipe however the new level was reached
  const back = wiped || someoneOut || alive(party).length === 0;
  for (const p of party.players.values()) {
    p.marks = new Map();
    if (back) p.echo = null;
    p.reachedExit = false;
  }
  return party;
}

// an Echo can flick one panel a minute
export function flick(party, id, time) {
  const p = member(party, id);
  if (!p.echo || time - p.echo.flickedAt < FLICK_EVERY) return false;
  p.echo.flickedAt = time;
  return true;
}
