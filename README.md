# NOCLIP ∞

A Backrooms horror game that runs in the browser. It has the same yellow
wallpaper, the same damp carpet and the same hum, but every level is built
from a seed, and the things that live in it each follow one rule you have to
learn.

Work in progress. The design lives in [`docs/`](docs/) and the game in
[`src/`](src/).

## What is in it

- **A story.** You noclip into the Backrooms with a radio in your hand.
  Elena, who came through long ago, talks you down through the levels to the
  way out:

  | Level | Place | What lives there |
  |-------|-------|------------------|
  | 0 | The Lobby | nothing (yet) |
  | 1 | Habitable Zone | the Wretch |
  | 2 | Pipe Dreams | Hounds |
  | 3 | Electrical Station | the Smiler |
  | 4 | Abandoned Office | Facelings |
  | 6 | Lights Out | Deathmoths |
  | 37 | The Poolrooms | the Drowned, and the way out |

  After the ending you can keep going down. Endless levels are generated
  from the seed, with more entities.
- **Things that hunt you.** Thirteen entities, each with one rule. Something
  new is always met alone first. Seven are real animated 3D models:
  - The Wretch sees you in light, hears you when you're loud, and runs you
    down. Break its line of sight and keep still, and it gives up.
  - The Hounds, a flayed dog that hunts by sound.
  - The Facelings, bound in cloth with no face.
  - Stilts, a faceless man in a suit, far too tall.
  - Still Life, a plaster mannequin that moves only when you don't look.
  - The Drowned, who moves only while you move, and as fast as you do.
  - Monochrome, who drains the colour from the rooms around it and can only
    walk in its own grey. Stay under the warm panels.

  When something is after you, lockers in dead ends are somewhere to hide:
  crouch inside one and nothing that hunts by sight can see you.
- **Scary, not punishing.**
  - Every entity gives a warning at least 5 seconds before it can reach you.
  - The first touch only knocks you down.
  - The death screen shows what got you and the rule you broke.
  - There's a checkpoint at the Lights Out level.
  - Four difficulty tiers. The easiest has an arrow to the exit.
- **Atmosphere.**
  - Film grain and filmic light.
  - A sting and a camera jolt when something sees you.
  - A chase drone and a heartbeat when something is after you.
  - Hallucinations at low lucidity.
  - Footsteps that sound like the floor.
- Textures are painted on canvas and sounds are synthesized with WebAudio.
  The exceptions are the 3D models credited below.
- **Co-op, on its way.** Four players is the goal. Built so far: every
  player has their own marks, and in a group the dead become Echoes. There is
  a wire protocol, a host and peers on a test transport, and other players
  drawn from snapshots, smoothed between them. Monsters go for whoever is
  nearest. Add `?bot` to the address to walk alongside a stand-in second
  player and watch things hunt it. Networking between real browsers is next
  (see `docs/16-coop-tech.md`).

## Controls

| Key | Does |
|-----|------|
| WASD / arrows | move |
| mouse | look |
| Shift | run (loud) |
| C / Ctrl | crouch (quiet) |
| F | flashlight |
| E | use (breakers, ...) |
| Q | drink almond water |
| V (hold) | hum under your breath |
| H | help: every key, and what to do |
| Esc | pause and settings |

Play with headphones. Most of the game is in what you hear.

## Running it

There is no build step. Serve the folder and open it:

```
npm run serve        # then http://localhost:8080
```

Add `?seed=anything` to the URL to play or share a specific run,
`&tier=lucid|uneasy|lost|noclip` to pick a difficulty, and `&depth=4` to
start on a given level.

## Tests

```
npm test             # logic: generation, entities, director, fairness (node --test)
npm run smoke        # plays the real game in headless Chromium and checks it
```

three.js and its glTF loader are vendored under `vendor/three/` (MIT, see its LICENSE).

The monster models are free assets found online: CC0 models by
HorrorGameMaker.com, codyanka, Noah Summers and burning_barb, and two models
by bitkiln (free for commercial use, "Art by bitkiln"). Authors, licences and
what was changed are in [`assets/models/CREDITS.md`](assets/models/CREDITS.md).
