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
  | 37 | The Poolrooms | the ending |

  After the ending you can keep going down. Endless levels are generated
  from the seed, with more entities.
- **Things that hunt you.** The Wretch is a real 3D model with walk and run
  animations:
  - It sees you in light, hears you when you're loud, and runs you down.
  - Break its line of sight, hide in the dark and keep still, and it gives
    up.

  Eleven entities in all, each with one rule. Something new is always met
  alone first.
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
  The one exception is the 3D model credited below.

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

The Wretch model is CC0, by HorrorGameMaker.com via OpenGameArt. See
[`assets/models/CREDITS.md`](assets/models/CREDITS.md).
