// The flashlight: a battery that drains while it's on and a beam that some
// things fear and other things follow. The battery never fully strands you -
// a dead flashlight still gives a few seconds of weak light after a rest.

export const BATTERY_DRAIN = 1 / 240; // four minutes from full
export const LOW = 0.15;

export function createFlashlight() {
  return { on: false, battery: 1 };
}

export function toggleFlashlight(light) {
  if (!light.on && light.battery <= 0) return light;
  light.on = !light.on;
  return light;
}

export function stepFlashlight(light, dt) {
  if (!light.on) return light;
  light.battery = Math.max(0, light.battery - BATTERY_DRAIN * dt);
  if (light.battery === 0) light.on = false;
  return light;
}

// 0..1 output: full until the battery is low, then it browns out and
// stutters. `interference` (0..1) is how close something hunting you is:
// near one the beam stutters too, more the closer it gets - a tell you can
// see, and the worst moment for it.
export function beamStrength(light, time, interference = 0) {
  if (!light.on) return 0;
  let strength = 1;
  if (light.battery <= LOW) {
    const fade = light.battery / LOW;
    const stutter = Math.sin(time * 23) * Math.sin(time * 7.3) > 0.6 ? 0.2 : 1;
    strength = Math.max(0.15, fade) * stutter;
  }
  if (interference > 0) {
    const flick = Math.sin(time * 31) * Math.sin(time * 13.7 + 1.3) * Math.sin(time * 5.1);
    if (flick > 0.5 - interference * 0.45) strength *= 0.12 + 0.3 * (1 - interference);
  }
  return strength;
}

// how close the nearest thing that is hunting you is, as 0 (12 m or more,
// or none) to 1 (on top of you)
export const INTERFERENCE_RANGE = 12;
export function interference(things, x, z) {
  let near = 0;
  for (const t of things) {
    if (!t.hunting) continue;
    near = Math.max(near, 1 - Math.hypot(t.x - x, t.z - z) / INTERFERENCE_RANGE);
  }
  return Math.max(0, Math.min(1, near));
}

export function recharge(light, amount) {
  light.battery = Math.min(1, light.battery + amount);
  return light;
}
