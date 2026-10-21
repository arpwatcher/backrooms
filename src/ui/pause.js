// Esc lets go of the mouse; that is the pause. The level waits for you.

export function createPauseScreen({ settings, onChange, onResume, onCodex }) {
  const screen = document.createElement("div");
  screen.id = "pause";
  screen.className = "screen hidden";
  screen.innerHTML = `
    <h2>paused</h2>
    <p class="sub">the hum goes on without you</p>
    <label>mouse <input id="set-sensitivity" type="range" min="0.2" max="3" step="0.1"></label>
    <label>volume <input id="set-volume" type="range" min="0" max="1" step="0.05"></label>
    <div class="row">
      <button id="pause-resume">resume</button>
      <button id="pause-codex">codex</button>
    </div>`;
  document.body.appendChild(screen);
  const sensitivity = screen.querySelector("#set-sensitivity");
  const volume = screen.querySelector("#set-volume");
  sensitivity.value = settings.sensitivity;
  volume.value = settings.volume;
  sensitivity.oninput = () => onChange({ ...settings, sensitivity: Number(sensitivity.value) });
  volume.oninput = () => onChange({ ...settings, volume: Number(volume.value) });
  screen.querySelector("#pause-resume").onclick = onResume;
  screen.querySelector("#pause-codex").onclick = onCodex;
  return {
    show() {
      screen.classList.remove("hidden");
    },
    hide() {
      screen.classList.add("hidden");
    },
    get shown() {
      return !screen.classList.contains("hidden");
    },
  };
}
