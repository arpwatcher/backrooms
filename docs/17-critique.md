# 17. Critique list

A running list of what looks bad or isn't scary, written from screenshots of
the live game. It is reshot at the start of each work session, and the worst
problems are fixed first. When an item is fixed it moves to the bottom with
the date.

The shots come from `node tools/critique.mjs <dir>`: every entity, close up,
lit and in the dark.

## Open (worst first)

1. **Every monster is a toy.** They are smooth primitives with flat colours
   and no texture, and they read as placeholder NPCs, not things. They need
   real skin (mottled, veined, dirty), wrong proportions, detail that holds
   up at 2 m, and eyes that catch the light.
3. **Nothing moves wrong.** Animation is smooth sine-wave bobbing. Scary
   things twitch, freeze, jerk their heads and move in bursts.
4. **No reaction when one sees you.** There is no sting, no shake and no
   distortion, so the moment of being spotted is silent.
5. **The Smiler is a sticker on a wall.** The grin is a flat sprite with no
   depth and no body; it should hang in a black shape in the dark.
6. **The Hounds are a black blob.** They're unreadable. They need a
   hairless, starved, too-long body, a visible rib cage, and a head that is
   almost a face.
7. **The Partygoers are a cartoon smiley.** That is comedy, not horror. The
   grin should be too wide, with real teeth, and the skin stretched and
   waxy.
8. **The Hushbaby looks like a pig.** It should be pale, too thin, with a
   head too big and a mouth open too far.
9. **The Attendant is a toy figure.** His face should never be seen: he
   keeps it to the wall, with his neck at the wrong angle.
10. **Deadline is three cylinders.** It should be a wall of moving black with
    shapes in it, not geometry.
12. **Monsters are rarely seen.** Most of a level passes without seeing
    anything. They should patrol toward you and cross your sightlines more,
    and hunt harder on harder tiers.
13. **No help in game.** There is no controls overlay and no first-level
    hints; new players miss F, E and V.

## Fixed

- 2026-10-22: the flashlight blowing everything out to white (ACES filmic tone
  mapping, a cooler beam), and the image being too clean (a post pass: film
  grain, vignette and colour fringing, all pushed harder by fear and low
  lucidity).
