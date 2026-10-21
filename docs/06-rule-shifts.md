# 6. Rule shifts

A rule shift changes one of the game's rules for a single level. It is the
Backrooms being wrong in a new way. Shifts follow three rules of their own:

1. **One at a time.** A level never has more than one shift.
2. **The level tells you.** A note by the start, the feel of the carpet, or a
   sound: every shift has a diegetic tell that comes before it matters
   **[built]**: a note at the start.
3. **Never contradict the entity.** The director will not pair a shift
   with an entity whose counter it removes, unless the tier is noclip.
   For example, a dead battery never goes with a Smiler on a level without
   working panels.

Frequency **[built]**: none before level 3, then 25%, rising by 5% per
level to a cap of 60%.

## Built

| Shift | Tell | Effect |
|-------|------|--------|
| **Soaked** | the carpet is visibly darker and squelches | you cannot run |
| **Dead battery** | "click. nothing." | no flashlight this level |
| **Lights out behind you** | a note: DON'T STOP | every panel you pass under goes dead 14 s later |
| **Shy lights** | a note, and panels that dim as you look up | panels go dark when looked at directly, and stay on everywhere else |

## Designed [next / later]

**Light and dark**

5. **Strobe**: all panels flicker in sync, so you move in the dark beats.
6. **Breathing lights**: panels dim and brighten on a slow 12 s cycle.
7. **Colour drift**: lights shift toward red as you near the exit.
8. **Heavy dark**: the flashlight cone is half as wide.
9. **Generous dark**: dark doesn't drain lucidity, but light doesn't
   restore it either.
10. **Borrowed light**: your flashlight only works under a dead panel.

**Space**

11. **Longer every time**: turning 180 degrees adds a cell to the hall
    behind you.
12. **Doors remember**: a door you came through leads somewhere else on the
    way back.
13. **Loop**: walking off one edge brings you in at the other.
14. **Rotated**: the level is the previous level, turned 90 degrees.
15. **Shrinking**: the outer ring of cells walls itself off every 60 s.
16. **One-way**: some walls are only there from one side.
17. **Stacked**: there are two exits and only one goes down. The other goes
    up a level.

**Body**

18. **Heavy legs**: stamina is halved.
19. **Light feet**: crouching makes no sound at all, but walking is as loud
    as running.
20. **Tinnitus**: a ringing covers all quiet sounds, including tells, so
    other cues get louder to compensate.
21. **Fever**: lucidity drains steadily but slowly everywhere, and almond
    water restores double.
22. **Sleepwalker**: when you stand still for 10 s, you start walking.
23. **Echo body**: every sound you make plays again 3 s later, somewhere
    else.

**Sound**

24. **Silent hum**: the hum stops, and every other sound is louder in the
    silence.
25. **Wrong footsteps**: your footsteps play a half-second late.
26. **Muffled**: all sound is low-passed, and tells come later but are still
    over 5 s.
27. **Radio**: a radio somewhere plays music, so entities that hunt sound
    hunt it too.

**Items and the exit**

28. **Fake exits**: two exits, one of them painted on.
29. **Locked exit**: the exit needs a key hidden somewhere on the level.
30. **Moving exit**: the exit moves to a new far cell every 90 s.
31. **Dry level**: there is no almond water here.
32. **Plenty**: double items and double entities.
33. **Exchange**: the exit takes one item to let you through.

**Time**

34. **Slow time**: entities move at 80%, and you do too.
35. **Clock**: a 6-minute timer, then the lights go out for good.
36. **Rewind**: at 50% lucidity you jump back to where you were 20 s ago.

**Social (co-op)**

37. **Separated**: players start in different corners.
38. **Swapped voices**: your voice comes out of a teammate's position.
39. **One light**: there is one flashlight between the whole team.
40. **Tethered**: lucidity drains when players are more than 15 m apart.
41. **Last one out**: the exit only opens when everyone is standing at it.
42. **Mute**: proximity voice is off, so you have to use pings and gestures.

Each shift is a data entry: `{ id, name, minDepth, note, effects }`.
The effects are flags the game reads, such as `noRun`, `noFlashlight`,
`lightsDieBehind` and `shyLights`, so adding a shift means adding a flag and
one place that reads it.
