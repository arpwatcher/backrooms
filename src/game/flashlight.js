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

// 0..1 output: full until the battery is low, then it browns out and stutters
export function beamStrength(light, time) {
  if (!light.on) return 0;
  if (light.battery > LOW) return 1;
  const fade = light.battery / LOW;
  const stutter = Math.sin(time * 23) * Math.sin(time * 7.3) > 0.6 ? 0.2 : 1;
  return Math.max(0.15, fade) * stutter;
}

export function recharge(light, amount) {
  light.battery = Math.min(1, light.battery + amount);
  return light;
}
