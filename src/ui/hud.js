// The HUD stays small: depth, battery, almond water, and lucidity shown
// mostly as what it does to the screen rather than as a number.

export function createHud() {
  const hud = document.getElementById("hud");
  const vignette = document.createElement("div");
  vignette.id = "vignette";
  document.body.appendChild(vignette);
  const toast = document.createElement("div");
  toast.id = "toast";
  document.body.appendChild(toast);
  let toastUntil = 0;
  return {
    update({ depth, battery, flashlightOn, almondWater, lucidity, time }) {
      const bars = Math.round(battery * 10);
      hud.textContent =
        `level ${depth}\n` +
        `light ${flashlightOn ? "on " : "off"} [${"|".repeat(bars)}${" ".repeat(10 - bars)}]\n` +
        `almond water ${almondWater}${almondWater ? "  (Q)" : ""}`;
      // the darker it gets at the edges, the less lucid you are
      const edge = Math.max(0, 1 - lucidity);
      vignette.style.opacity = (0.15 + edge * 0.85).toFixed(3);
      vignette.style.filter = `saturate(${(1 - edge * 0.6).toFixed(2)})`;
      if (time > toastUntil) toast.style.opacity = "0";
    },
    say(text, seconds, time) {
      toast.textContent = text;
      toast.style.opacity = "1";
      toastUntil = time + seconds;
    },
  };
}
