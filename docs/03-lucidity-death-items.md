# 3. Lucidity, death and items

## Lucidity [built]

Lucidity replaces the usual sanity meter. It runs from 1 to 0 and moves like
this:

| Situation | Change per second |
|-----------|-------------------|
| under a working panel | +0.006 |
| only your flashlight | -0.004 |
| full dark | -0.012 |
| each entity within 12 m | up to -0.03, scaled by closeness |
| almond water (one bottle) | +0.35 at once |
| first contact with an entity | -0.30 at once |

It has four stages, and each one changes what you perceive, not what you can
do:

- **Lucid (0.66+).** Everything is as it is.
- **Uneasy (0.33+).** The field of view breathes slowly **[built]**, the edges
  of the screen crawl, and the hum detunes.
- **Slipping (0.12+).** Phantom footsteps and figures at the edge of vision
  appear, and some fake entity tells play. Real tells are never removed.
- **Gone (<0.12).** The Guest's fate draws near (§5). Lights you're under
  start to fail. You can still recover with almond water and light.

> The low stages add fake tells but never hide real ones. Low lucidity makes
> the game harder to read without making it unfair.

## Contact and death [built]

- **First contact** with an entity knocks you down for about two seconds,
  costs lucidity, flashes the screen and marks you. The entity backs off to
  where it came from, and the codex records it.
- **Second contact** with the **same kind** on the same level kills you. On the
  easiest tier (lucid) you survive two touches and the third kills.
- **The death screen** names the entity, states its rule and says what works
  against it. Then you wake at the last checkpoint.

## Hiding: lockers [built]

Metal lockers stand in dead ends and corners: two on the first levels, one
more every three levels, up to five, never two within four cells of each
other, never near the start. Crouch inside one and anything that hunts by
sight can't see you; the screen goes to the slats of the door. Sound still
carries, so the Hounds and the Hushbaby don't care, and a thing that saw you
go in may come and stand outside. In co-op a locker holds one player.

## Echo deaths (co-op) [later]

A dead player in co-op becomes an Echo until the level ends:

- An Echo is a faint flicker that only other players see, and only under
  working light.
- An Echo can **flick one panel per minute** on or off, which is enough to save
  someone from a Smiler or to mark a door.
- An Echo **hears entities through walls** and can ping a spot (a short
  flicker at the panel nearest it).
- Echoes come back at the next exit if at least one living player reaches it.
  If everyone becomes an Echo, the group wakes at the checkpoint.

## Items

| Item | Effect | Status |
|------|--------|--------|
| Almond water | +0.35 lucidity, Q to drink | built |
| Flashlight | 240 s battery, browns out at 15% | built |
| Battery | refills the flashlight to full | next |
| Chalk | draws a mark on a wall; marks stay for the level | next |
| Wind-up radio | plays static that covers your footsteps for 10 s (hounds), but attracts Partygoers | later |
| Level key | opens one locked door; some tasks need it | later |
| Moth jelly | throw it to draw Deathmoths to a spot for 20 s | later |
| Firesalt | a burning flare that lasts 30 s; Smilers hate it, Deathmoths love it | later |
| Note | lore and a hint about this level's entity or rule shift | next |

Inventory is small on purpose: four slots, plus almond water stacking up to
three. Choosing what to carry is part of the game.
