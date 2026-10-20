// Full-screen moments: being knocked down, and dying. A death always says
// what did it and which rule you broke - you should leave knowing what to do
// differently, not just that you lost.

export function createScreens() {
  const death = document.createElement("div");
  death.id = "death";
  death.className = "screen hidden";
  death.innerHTML = `
    <p class="sub">you were taken by</p>
    <h1 id="death-name"></h1>
    <p id="death-rule"></p>
    <p id="death-counter" class="hint"></p>
    <button id="death-wake">wake up</button>`;
  document.body.appendChild(death);
  const flash = document.createElement("div");
  flash.id = "flash";
  document.body.appendChild(flash);
  return {
    hit() {
      flash.style.transition = "none";
      flash.style.opacity = "0.75";
      requestAnimationFrame(() => {
        flash.style.transition = "opacity 2.5s";
        flash.style.opacity = "0";
      });
    },
    die(def, onWake) {
      death.querySelector("#death-name").textContent = def.name;
      death.querySelector("#death-rule").textContent = `the rule: ${def.rule}`;
      death.querySelector("#death-counter").textContent = `what works: ${def.counter}`;
      death.classList.remove("hidden");
      document.exitPointerLock?.();
      const button = death.querySelector("#death-wake");
      button.onclick = () => {
        death.classList.add("hidden");
        onWake();
      };
    },
    get dead() {
      return !death.classList.contains("hidden");
    },
  };
}
