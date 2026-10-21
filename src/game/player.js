// The player's body: position, look, stamina, posture, and how much noise
// each step makes. Pure - input arrives as a plain object - so movement and
// noise rules are tested without a browser.

import { moveCircle, cellOf } from "../world/collide.js";

export const WALK_SPEED = 2.3;
export const RUN_SPEED = 4.6;
export const CROUCH_SPEED = 1.1;
export const EYE_HEIGHT = 1.62;
export const CROUCH_HEIGHT = 1.0;
export const RADIUS = 0.3;
const STAMINA_DRAIN = 0.22; // per second of running
const STAMINA_REGEN = 0.14;

// noise is what most entities hunt by: running is loud, crouching is
// nearly silent, standing still is silent
// hum: holding V, humming under your breath - about as loud as walking quietly
export const NOISE = { still: 0, crouch: 0.15, hum: 0.3, walk: 0.45, run: 1 };

export function createPlayer(x, z, yaw = 0) {
  return {
    x, z, yaw, pitch: 0,
    height: EYE_HEIGHT,
    stamina: 1,
    exhausted: false,
    crouching: false,
    running: false,
    noise: 0,
    stride: 0,
    steps: 0,
    lucidity: 1,
  };
}

export function stepPlayer(player, input, dt, layout) {
  player.yaw -= (input.lookX || 0) * 0.0022;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - (input.lookY || 0) * 0.0022));
  player.crouching = Boolean(input.crouch) || Boolean(input.forceCrouch);

  const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const moving = forward !== 0 || strafe !== 0;
  const wantsRun = Boolean(input.run) && moving && !player.crouching && forward > 0;
  player.running = wantsRun && !player.exhausted && !input.cannotRun;

  if (player.running) {
    player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN * dt);
    if (player.stamina === 0) player.exhausted = true;
  } else {
    player.stamina = Math.min(1, player.stamina + STAMINA_REGEN * dt * (moving ? 0.6 : 1));
    if (player.exhausted && player.stamina > 0.35) player.exhausted = false;
  }

  const speed = player.crouching ? CROUCH_SPEED : player.running ? RUN_SPEED : WALK_SPEED;
  const length = Math.hypot(forward, strafe) || 1;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const dx = ((-sin * forward + cos * strafe) / length) * speed * dt;
  const dz = ((-cos * forward - sin * strafe) / length) * speed * dt;
  const before = { x: player.x, z: player.z };
  const after = moving ? moveCircle(layout, player.x, player.z, dx, dz, RADIUS) : before;
  const travelled = Math.hypot(after.x - before.x, after.z - before.z);
  player.x = after.x;
  player.z = after.z;

  const target = player.crouching ? CROUCH_HEIGHT : EYE_HEIGHT;
  player.height += (target - player.height) * Math.min(1, dt * 10);

  const steps = travelled < 1e-4 ? NOISE.still : player.crouching ? NOISE.crouch : player.running ? NOISE.run : NOISE.walk;
  player.humming = Boolean(input.hum);
  player.noise = Math.max(steps, player.humming ? NOISE.hum : 0);
  player.stride += travelled;
  const strideLength = player.running ? 1.6 : 1.15;
  let stepped = false;
  if (player.stride >= strideLength) {
    player.stride -= strideLength;
    player.steps++;
    stepped = true;
  }
  return { stepped, travelled, cell: cellOf(player.x, player.z) };
}
