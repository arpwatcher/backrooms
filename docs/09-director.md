# 9. The threat director and synergies

The director decides who lives on each level, and it watches how hard the
level is leaning on the player. It is not trying to kill you; it is trying to
keep you scared. Everything in this chapter marked **[built]** is in
`src/game/director.js` and covered by `tests/director.test.js`.

## Choosing who lives here [built]

**Budget.** Each entity has a threat cost (Facelings 0.75, Smiler 1, Moths 1,
Partygoers 1, Still Life 1.25, Stilts 1.25, Hounds 1.5). A level's budget is

```
budget(depth) = min(1 + 0.5 x (depth - 1), 5) x tier scale     (0 on level 0)
tier scale:  lucid 0.6 · uneasy 1.0 · lost 1.3 · noclip 1.7
co-op:       x (1 + 0.35 x (players - 1))                      [later]
```

**Debut.** The first level where an entity becomes possible
(its `minDepth`), it appears **alone**. You learn one rule at a time.
Debuts: Hounds 1, Smiler 2, Still Life 3, Deathmoths 4, Partygoers 5,
Facelings 6, Stilts 7.

**Variety.** Anything you met in the last three levels is less likely to come
back. The weight drops the more recently you saw it.

**Synergy.** Once one entity is picked, any entity that forms a known synergy
with it gets 3x weight.

**Conflict.** Pairs whose counters contradict outright, so that obeying one
breaks the other, are never put on the same level below the noclip tier.

**Determinism.** The plan for depth `d` walks the run from level 0, so the
same seed always gives the same plan, however you got there, including after
a death **[built]**.

## Watching the player [built]

**Tension** (0-1) rises quickly and falls slowly:

```
target = 0.6 x closeness(nearest entity within 16 m)
       + 0.2 x (entities currently hunting, up to 3)
       + 0.4 if there was a contact in the last 20 s
```

**Mercy rule.** If tension stays above 0.75 for longer than the tier allows,
or you're touched twice within a minute, the director grants mercy:

- every entity freezes for the mercy period,
- any you can't currently see quietly goes home,
- the hum softens (a cue you learn to feel as relief).

| Tier | Overload before mercy | Mercy lasts | Touches you survive |
|------|----------------------|-------------|---------------------|
| lucid | 10 s | 25 s | 2 |
| uneasy | 18 s | 18 s | 1 |
| lost | 28 s | 12 s | 1 |
| noclip | 45 s | 8 s | 1 |

## Pacing the run [next]

The director also shapes pressure across levels:

- **Breathers.** After two high-tension levels, the next level spends 40% of
  its budget.
- **Peaks.** The level before each checkpoint spends 130%.
- **Silence.** About 1 level in 12 has no entities at all, but the director
  plays tells anyway. Nothing is there. The players don't know that.

## Thirty synergies

The pairs marked [built] are in the code. The rest are designed for entities
in §4 and §8.

| # | Pair | Why it's worse together | Status |
|---|------|-------------------------|--------|
| 1 | Smiler + Hounds | the light keeps the grin away, but running to the light brings the pack | built |
| 2 | Still Life + Hounds | back away from the mannequin slowly and quietly, never turning to run | built |
| 3 | Still Life + Smiler | both want your eyes: the beam on the grin means your back to the mannequin | built |
| 4 | Deathmoths + Smiler | the beam keeps the grin back and calls the swarm; only the panels are safe from both | built |
| 5 | Deathmoths + Hounds | lights off means moving blind, and blind means bumping, and bumping is loud | built |
| 6 | Deathmoths + Still Life | keep the mannequin in view with no light to see it by | built |
| 7 | Partygoers + Still Life | backing away from the mannequin, you can back straight into the party | built |
| 8 | Partygoers + Hounds | the music covers the panting near the party | built |
| 9 | Facelings + Still Life | one punishes your gaze and the other needs it - which figure is the mannequin? | built |
| 10 | Facelings + Smiler | the beam you need for the grin lands on blank faces too | built |
| 11 | Hounds + Stilts | crouching hides you from both, but is slow | built |
| 12 | Deadline + Still Life | you have to keep moving forward and keep looking back | later |
| 13 | Deadline + Stilts | crouching is slow, and the dark is coming | later |
| 14 | Attendant + Hounds | going around wet patches is the long, loud way | later |
| 15 | Census Taker + Clump | stay together, but don't | later (noclip only) |
| 16 | Census Taker + Still Life | groups are safe from both, which is the point of it | later |
| 17 | Intercom + Partygoers | the voice gives directions to the party | later |
| 18 | Ushers + Partygoers | sometimes they point at the party | later |
| 19 | Howler + Hounds | two different ways to be heard | later |
| 20 | Crawlspace + Deadline | you can't stop, but you have to look up | later |
| 21 | Tannoy + Hushbaby | conflict - never paired | conflict |
| 22 | Hounds + Hushbaby | conflict - never paired | conflict |
| 23 | Facelings + Skin-stealer | every figure is suspect | later |
| 24 | Smiler + Window | the window is the only light, and standing in front of it is the one thing you can't do | later |
| 25 | Deathmoths + Scratchers | every light that turns on brings one thing and the other | later |
| 26 | Death Rats + Still Life | you have to stand still and watch, but standing still brings the rats | later |
| 27 | Wretches + the Guest | low lucidity draws one and opens the door for the other | later |
| 28 | Keymaster + Intercom | two voices offering help, one of which is lying | later |
| 29 | Crawlers + Hounds | getting up onto a desk is loud | later |
| 30 | Monochrome + Smiler | warm light keeps both away, but warm light is rare | later |
| 31 | Neighborhood Watch + Deadline | you have to hurry, and you can't run | later |
| 32 | Mold Men + Attendant | wet cells are where both of them are | later |
