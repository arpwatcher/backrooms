// On-screen hints for the first levels. Each one stays up until you've done
// what it says (or long enough to have read it), then the next one comes.
// They stop for good once you've seen them all in this browser.

export const HINTS = [
  { id: "walk", depth: 0, text: "W A S D to walk, mouse to look (click the screen first)", done: (s) => s.walked > 2 },
  { id: "light", depth: 0, text: "F turns your flashlight on and off - the battery doesn't last", done: (s) => s.toggledLight },
  { id: "exit", depth: 0, text: "find the red EXIT sign and walk into it", done: (s) => s.shownFor > 10 },
  { id: "help", depth: 0, text: "H shows every key, any time", done: (s) => s.shownFor > 7 },
  { id: "run-hide", depth: 1, text: "if something sees you: run (Shift), then hide somewhere dark and keep still", done: (s) => s.shownFor > 12 },
  { id: "locker", depth: 1, text: "lockers stand in dead ends: crouch (C) inside one and nothing can see you", done: (s) => s.shownFor > 12 },
  { id: "crouch", depth: 2, text: "something here hunts by sound. C to crouch - slow, and almost silent", done: (s) => s.crouched || s.shownFor > 14 },
  { id: "flashlight-smiler", depth: 3, text: "where the panels are dead, keep your flashlight on what's waiting there", done: (s) => s.shownFor > 12 },
];

export function createHints(seen = new Set()) {
  return { seen, current: null, since: 0 };
}

// state: { depth, walked, toggledLight, crouched, time }; returns the text to
// show, or null for nothing
export function stepHints(hints, state) {
  if (hints.current) {
    const shownFor = state.time - hints.since;
    if (hints.current.depth !== state.depth || hints.current.done({ ...state, shownFor })) {
      hints.seen.add(hints.current.id);
      hints.current = null;
    }
  }
  if (!hints.current) {
    const next = HINTS.find((h) => h.depth === state.depth && !hints.seen.has(h.id));
    if (!next) return null;
    hints.current = next;
    hints.since = state.time;
  }
  return hints.current.text;
}
