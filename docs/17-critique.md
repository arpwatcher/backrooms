# 17. Critique list

A running list of what looks bad or isn't scary, written from screenshots of
the live game. It is reshot at the start of each work session, and the worst
problems are fixed first. When an item is fixed it moves to the bottom with
the date.

The shots come from `node tools/critique.mjs <dir>`: every entity, close up,
lit and in the dark.

## Open (worst first)

1. **Five monsters are still built from code** (Smiler, Partygoers,
   Hushbaby, Attendant, Deadline) next to six real models, and the gap
   shows. No free model fits them yet; Smiler and Deathmoths hold up best
   because you only see eyes and teeth in the dark.
2. **The hound's textures are 256 px.** Fine at running distance, soft up
   close and on the death screen.

## Fixed

- 2026-10-24: the Hushbaby looking like a cute egg with legs. It now stands
  on arms far too long for it, elbows above its back, legs dragging, its
  head hanging upside down on a stretched neck, with sunken slit eyes and a
  long mouth ringed with milk teeth.
- 2026-10-24: levels never giving back their textures (99 after ten level
  changes), which eventually blacked out the screen. Old levels, their
  monsters and props are now freed.
- 2026-10-24: the Drowned's coat lighting up bright green in the
  flashlight beam. The colour now comes out in the shader.

- 2026-10-23: chases with nowhere to go. Metal lockers now stand in dead
  ends and corners (two on early levels, up to five deeper). Crouch inside
  one and anything that hunts by sight can't see you; the screen goes to
  the slats of the door. Doors you can shut behind you are still to come.

- 2026-10-23: Deadline reading as a column. It is now a wall of dark the
  width of the corridor, three sheets of smoke with black behind them,
  always turned to face you. (The critique shot also had it hidden: the
  tool now puts it in its coming state.)

- 2026-10-23: Partygoers with short legs and stick arms. A shorter torso on
  long legs with knees and feet, full upper arms with shoulders and elbows,
  hands down past the knees.

- 2026-10-23: Still Life too clean at a distance. Darker, dirtier plaster,
  black joints, and when it settles the head can be turned further than a
  neck allows.

- 2026-10-23: monsters that looked like placeholder NPCs. Four now use real
  rigged models found online (licences in `assets/models/CREDITS.md`): the
  Hounds (a flayed dog that walks, howls and runs), the Facelings (bound in
  cloth with no face), Stilts (a faceless man in a suit, 2.6 m tall, posed
  by code) and Still Life (a jointed mannequin in cracked plaster). New on
  the last story level: the Drowned, a real model too.
- 2026-10-23: the Drowned looking like a cartoon in the bright poolrooms.
  His colours are washed out and he looks wet, a dark shape against the
  white tile.

- 2026-10-22: the Deathmoths reading as confetti. They now have bodies,
  bigger wings and a fall of dust in the beam.

- 2026-10-22: monsters floating. Each now has a soft shadow on the carpet.
- 2026-10-22: Facelings as a pill with an egg on top. They now have a chest,
  waist, belt, shoulders, ears, a jaw and cheekbones.
- 2026-10-22: the death screen being only text. It now shows the face of what
  got you, close up and lit red from below.
- 2026-10-22: chases with no shape. There is now a chase drone that swells, a
  heartbeat that quickens and a lunge in the last three metres.

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
