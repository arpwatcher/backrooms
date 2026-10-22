// The end of the story: what's on the other side of the door, and a choice -
// go back to the surface you just found, or turn round and keep going down.

import { ENDING } from "../game/story.js";

export function createEnding({ onContinue, onRestart }) {
  const screen = document.createElement("div");
  screen.id = "ending";
  screen.className = "screen hidden";
  document.body.appendChild(screen);
  return {
    show({ deaths, depth }) {
      const lines = ENDING.lines.map((l) => `<p>${l}</p>`).join("");
      screen.innerHTML = `<h1>${ENDING.title}</h1>${lines}
        <p class="small">level ${depth} reached &middot; woke up ${deaths} time${deaths === 1 ? "" : "s"}</p>
        <div class="row"><button id="ending-continue">keep going down</button><button id="ending-restart">start again</button></div>`;
      screen.querySelector("#ending-continue").onclick = () => {
        screen.classList.add("hidden");
        onContinue();
      };
      screen.querySelector("#ending-restart").onclick = onRestart;
      screen.classList.remove("hidden");
      document.exitPointerLock?.();
    },
    get shown() {
      return !screen.classList.contains("hidden");
    },
  };
}
