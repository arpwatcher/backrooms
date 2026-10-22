# 17. Critique list

A running list of what looks bad or isn't scary, written from screenshots of
the live game. It is reshot at the start of each work session, and the worst
problems are fixed first. When an item is fixed it moves to the bottom with
the date.

The shots come from `node tools/critique.mjs <dir>`: every entity, close up,
lit and in the dark.

## Open (worst first)

1. **No real chases.** A hunting thing just walks at you. A chase needs a
   lunge when it closes, music that tells you you're being chased, and
   escapes: corners that break its line, doors, a light to stand under.
2. **Monsters float.** They cast no shadow, so they don't sit on the
   carpet. A soft dark blot under each would ground them.
3. **Facelings: a pill with an egg on top.** The torso has no chest or
   shoulders and the head has no skull shape. They need real anatomy, so
   the missing face is the only wrong thing.
4. **Deathmoths haven't been touched.** From a distance their wings read as
   confetti. They need dust, bodies and a fluttering glow.
5. **Deadline still reads as a column.** It should be a wall of dark across
   the corridor, not a pillar of it.
6. **The death screen is only text.** It should show the face of what got
   you, close.
7. **Partygoers: short legs, stick arms.** The proportions sell "too tall"
   from the neck up but not below.

## Fixed

- 2026-10-22: every monster rebuilt from the kit in `src/render/flesh.js`, with
  painted skin, normal maps, lumpy flesh, glowing eyes and a rim light:
  - Hounds: starved, ribbed, a nearly-human skull.
  - Smiler: a black hole in the room with a lit grin.
  - Partygoers: waxy and too tall, with a carved smile.
  - Facelings: real skin and clothes.
  - Hushbaby: pale, with a screaming mouth.
  - The Attendant: no face under the cap.
  - Still Life: cracked plaster with ball joints.
  - Stilts: a black suit, long fingers, a pale head.
  - Deadline: black smoke with figures in it.
- 2026-10-22: nothing moving wrong. Heads and limbs now twitch and jerk.
- 2026-10-22: no reaction when one sees you. There is now a sting, a camera
  jolt and the image tearing.
- 2026-10-22: monsters rarely seen. Wandering things drift toward you, more on
  harder tiers.
- 2026-10-22: no help in game. Added H for help, first-level hints and the
  lucid exit arrow.
- 2026-10-22: skin tearing into a grid of cracks along triangle edges.
  Displacement now follows smooth normals.

- 2026-10-22: the flashlight blowing everything out to white (ACES filmic tone
  mapping, a cooler beam), and the image being too clean (a post pass: film
  grain, vignette and colour fringing, all pushed harder by fear and low
  lucidity).
