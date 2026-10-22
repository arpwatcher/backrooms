// Milestones: quiet lines on the title screen, not trophies. Each is checked
// against something that just happened in the game.

const KEY = "noclip.milestones.v1";

export const MILESTONES = [
  { id: "first-contact", text: "survived your first contact" },
  { id: "clean-nine", text: "got through level 9 without being touched" },
  { id: "met-all", text: "met everything that lives down here" },
  { id: "depth-25", text: "reached level 25" },
  { id: "power-smiler", text: "restored power with a smiler on the level" },
  { id: "silent", text: "got through a level where nothing lived (you heard it anyway)" },
  { id: "party", text: "walked past a party without going in" },
  { id: "out", text: "found the way out" },
];

export function loadMilestones(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "[]");
    return new Set(saved.filter((id) => MILESTONES.some((m) => m.id === id)));
  } catch {
    return new Set();
  }
}

// event: { type, ... } from the game; returns the milestones newly earned
export function checkMilestones(earned, event, storage = globalThis.localStorage) {
  const fresh = [];
  const award = (id) => {
    if (!earned.has(id)) {
      earned.add(id);
      fresh.push(MILESTONES.find((m) => m.id === id));
    }
  };
  if (event.type === "survived") award("first-contact");
  if (event.type === "met" && event.known >= event.total) award("met-all");
  if (event.type === "left") {
    if (event.depth === 9 && event.touchesThisRun === 0) award("clean-nine");
    if (event.depth + 1 >= 25) award("depth-25");
    if (event.pace === "silence") award("silent");
    if (event.roster.includes("partygoers") && !event.enteredParty) award("party");
  }
  if (event.type === "task" && event.roster.includes("smiler")) award("power-smiler");
  if (event.type === "ending") award("out");
  if (fresh.length) {
    try {
      storage?.setItem(KEY, JSON.stringify([...earned]));
    } catch {
      // storage blocked: kept for this visit
    }
  }
  return fresh;
}
