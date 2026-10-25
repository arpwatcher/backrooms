// H: what every key does, and the few things worth knowing. It doesn't
// pause anything - you read it with the level still going around you.

export const CONTROLS = [
  ["W A S D", "walk"],
  ["mouse", "look (click the screen first)"],
  ["Shift", "run - fast, and loud"],
  ["C / Ctrl", "crouch - slow, and almost silent"],
  ["F", "flashlight - the battery doesn't last"],
  ["E", "use (breakers)"],
  ["Q", "drink almond water - your head clears"],
  ["V (hold)", "hum under your breath"],
  ["H", "this help"],
  ["Esc", "pause and settings"],
];

export const TIPS = [
  "find the red EXIT sign and walk into it",
  "every thing down here follows one rule - learn it, and you live",
  "you hear them before you see them; play with headphones",
  "the first touch knocks you down. the second one, from the same thing, doesn't",
  "notes on the walls were left by people who came before you",
  "lockers stand in dead ends: crouch inside one and nothing that hunts by sight can see you",
  "to play with friends: Esc, then co-op - you swap two codes by any chat",
];

export function createHelp() {
  const panel = document.createElement("div");
  panel.id = "help";
  panel.className = "hidden";
  const rows = CONTROLS.map(([key, what]) => `<tr><td class="key">${key}</td><td>${what}</td></tr>`).join("");
  const tips = TIPS.map((t) => `<li>${t}</li>`).join("");
  panel.innerHTML = `<h3>help</h3><table>${rows}</table><ul>${tips}</ul><p class="small">H to close</p>`;
  document.body.appendChild(panel);
  return {
    toggle() {
      panel.classList.toggle("hidden");
    },
    get shown() {
      return !panel.classList.contains("hidden");
    },
  };
}
