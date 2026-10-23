// What an entity can know about the players this frame: where they are,
// whether it can see them, whether they are watching a spot, whether the
// beam is on it. Kept free of three.js so the rules can be tested in node.

import { lineOfSight } from "../world/sight.js";

// a little inside the real edge of the screen, so "I could see it" is true
export const WATCH_HALF_ANGLE = 0.8;

export function makeSense({ player, flashlight, camera, layout, paths, lightAt, time, darkCells: dark, prints = [], hidden = false }) {
  const forward = { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
  return {
    player,
    players: [player],
    paths,
    time,
    darkCells: dark,
    prints,
    lightAt,
    flashlightOn: flashlight.on && flashlight.battery > 0,
    hidden,
    // inside a locker, nothing sees you
    canSee(entity, range) {
      return (
        !hidden &&
        Math.hypot(entity.x - player.x, entity.z - player.z) <= range &&
        lineOfSight(layout, entity.x, entity.z, player.x, player.z)
      );
    },
    // is this spot on screen and in plain view? (a blink counts as not looking)
    watching(x, z) {
      if (player.blinking) return false;
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > 40) return false;
      if (d < 0.5) return true;
      const cos = (dx * forward.x + dz * forward.z) / d;
      return cos > Math.cos(WATCH_HALF_ANGLE) && lineOfSight(layout, player.x, player.z, x, z);
    },
    // is the flashlight beam on this spot?
    beamOn(x, z) {
      if (!flashlight.on || flashlight.battery <= 0) return false;
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > 14 || d < 0.01) return false;
      const cos = (dx * forward.x + dz * forward.z) / d;
      return cos > Math.cos(0.38) && lineOfSight(layout, player.x, player.z, x, z);
    },
    camera,
  };
}
