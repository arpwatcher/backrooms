# NOCLIP ∞

A Backrooms horror game that runs in the browser. It has the same yellow
wallpaper, the same damp carpet and the same hum, but every level is built
from a seed, and the things that live in it each follow one rule you have to
learn.

Work in progress. The design lives in [`docs/`](docs/) and the game in
[`src/`](src/).

## What is in it

- **Generated levels.** Six kinds of place (lobby, pillar hall, cubicle
  maze, dim wing, damp floor, overtime), each from a seed. The same seed
  always gives the same run.
- **Eight entities, one rule each.**
  - Smiler: it only moves in the dark.
  - Hounds: they hunt by sound.
  - Still Life: it only moves when nobody is looking.
  - Deathmoths: they fly to the brightest light.
  - Partygoers: they only come for you if you go to the party.
  - Facelings: harmless unless you stare at their blank faces.
  - Stilts: it sees anything standing, and nothing crouched.
  - Hushbaby: it comes when you have been quiet too long.
- **A threat director.**
  - Something new is always met alone first.
  - Pairs that make each other worse turn up together.
  - It backs off when it has pushed too hard (the mercy rule).
- **Rule shifts** (soaked carpet, dead battery, lights dying behind you, shy
  lights) and **tasks** (restore power before the exit opens).
- **Fair, not punishing.**
  - Every entity has a tell at least 5 seconds before it can reach you.
  - The first contact is survivable.
  - The death screen names what killed you and the rule you broke.
  - Checkpoints every 5 levels, and four difficulty tiers.
- **A codex** of everything you've survived, kept between runs.
- All textures are painted on canvas and all sound is synthesized with
  WebAudio. There are no asset files.

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

Play with headphones. Most of the game is in what you hear.

## Running it

There is no build step. Serve the folder and open it:

```
npm run serve        # then http://localhost:8080
```

Add `?seed=anything` to the URL to play or share a specific run, and
`&tier=lucid|uneasy|lost|noclip` to pick a difficulty.

## Tests

```
npm test             # logic: generation, entities, director, fairness (node --test)
npm run smoke        # plays the real game in headless Chromium and checks it
```

three.js is vendored under `vendor/three/` (MIT, see its LICENSE).
