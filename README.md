# NOCLIP ∞

A Backrooms horror game that runs in the browser. Same yellow wallpaper, same damp carpet,
same hum - but every level runs on a different rule, and the things living in it play by
rules you have to learn.

Work in progress. The design lives in [`docs/`](docs/), the game in [`src/`](src/).

## Running it

No build step. Serve the folder and open it:

```
npm run serve        # then http://localhost:8080
```

## Tests

```
npm test             # logic: generation, entities, director (node --test)
npm run smoke        # renders a level in headless Chromium and checks it
```

three.js is vendored under `vendor/three/` (MIT, see its LICENSE).
