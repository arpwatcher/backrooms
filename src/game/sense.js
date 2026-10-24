// What an entity can know about the players this frame: where they are,
// whether it can see them, whether they are watching a spot, whether the
// beam is on it. Kept free of three.js so the rules can be tested in node.

import { lineOfSight } from "../world/sight.js";

// a little inside the real edge of the screen, so "I could see it" is true
export const WATCH_HALF_ANGLE = 0.8;

// `others` are the other players in the room (co-op), each { id, x, z,
// noise, running, crouching, ... }; entities go for whoever is nearest
export function makeSense({ player, flashlight, camera, layout, paths, lightAt, time, darkCells: dark, prints = [], hidden = false, others = [] }) {
  const forward = { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
  return {
    player,
    players: [player, ...others.filter((o) => !o.echo)],
    paths,
    time,
    darkCells: dark,
    prints,
    lightAt,
    flashlightOn: flashlight.on && flashlight.battery > 0,
    hidden,
    // can it see this player (you, by default)? inside a locker, nothing sees you
    canSee(entity, range, target = player) {
      return (
        !(target === player && hidden) &&
        Math.hypot(entity.x - target.x, entity.z - target.z) <= range &&
        lineOfSight(layout, entity.x, entity.z, target.x, target.z)
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
