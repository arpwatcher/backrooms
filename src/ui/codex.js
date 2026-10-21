// The codex screen: every entity in the game, filled in only for the ones
// you have survived. The ones you haven't are just their tell - what you
// would notice first - so the codex teaches you what to listen for without
// telling you the answer.

import { ENTITIES } from "../entities/index.js";

export function createCodexScreen(codex) {
  const screen = document.createElement("div");
  screen.id = "codex";
  screen.className = "screen hidden";
  document.body.appendChild(screen);

  function render() {
    const known = ENTITIES.filter((d) => codex.has(d.id)).length;
    const cards = ENTITIES.map((d) => {
      if (!codex.has(d.id)) {
        return `<div class="card unknown"><h3>???</h3><p class="tell">${d.tell}</p><p class="small">survive it once to learn more</p></div>`;
      }
      return `<div class="card"><h3>${d.name}</h3>
        <p class="tell">${d.tell}</p>
        <p><b>rule</b> ${d.rule}</p>
        <p><b>what works</b> ${d.counter}</p>
        <p class="small">${d.lore}</p></div>`;
    }).join("");
    screen.innerHTML = `<h2>codex <span class="small">${known} of ${ENTITIES.length}</span></h2>
      <div class="cards">${cards}</div>
      <button id="codex-close">back</button>`;
    screen.querySelector("#codex-close").onclick = () => screen.classList.add("hidden");
  }

  return {
    open() {
      render();
      screen.classList.remove("hidden");
    },
    get isOpen() {
      return !screen.classList.contains("hidden");
    },
  };
}
