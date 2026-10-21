// Keyboard and mouse into the plain input object the player model reads.
// Mouse look only while the pointer is locked to the canvas.

const KEYS = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  ShiftLeft: "run", ShiftRight: "run",
  KeyC: "crouch", ControlLeft: "crouch",
  KeyV: "hum",
};

export function createInput(canvas) {
  const state = { lookX: 0, lookY: 0, pressed: new Set() };
  const held = {};
  window.addEventListener("keydown", (e) => {
    if (KEYS[e.code]) held[KEYS[e.code]] = true;
    if (!e.repeat) state.pressed.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    if (KEYS[e.code]) held[KEYS[e.code]] = false;
  });
  window.addEventListener("blur", () => {
    for (const key of Object.keys(held)) held[key] = false;
  });
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    state.lookX += e.movementX;
    state.lookY += e.movementY;
  });
  return {
    lock() {
      canvas.requestPointerLock?.();
    },
    get locked() {
      return document.pointerLockElement === canvas;
    },
    // one frame's worth of input; mouse deltas and key presses are consumed
    read() {
      const frame = { ...held, lookX: state.lookX, lookY: state.lookY, pressed: state.pressed };
      state.lookX = 0;
      state.lookY = 0;
      state.pressed = new Set();
      return frame;
    },
  };
}
