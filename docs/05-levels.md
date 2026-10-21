# 5. Level generation and archetypes

## How a level is made [built]

Every level comes from a seed: `runSeed/L<depth>`. The same run seed always
gives the same levels, the same entities and the same rule shifts. Each
system draws from its own forked random stream (layout, items, director,
archetype, shift), so adding a feature to one never reshuffles the others.

1. **Archetype.** Pick what kind of place this is (below). It sets the
   generator's knobs and the look.
2. **Grid.** A 32 x 32 grid of 2.4 m cells. Walls are thin edges between
   cells, not blocks, so rooms read as offices and not as dungeon corridors.
3. **Rooms.** Carve a few open rooms, then lay random wall runs.
4. **Pillars.** Drop free-standing columns. A pillar is never placed next to
   the start and never seals off a cell.
5. **Connectivity.** Flood from the start and knock through any wall that
   separates an unreachable pocket. Every cell can be reached; this is
   tested on every archetype.
6. **Exits.** Place exits by breadth-first distance so they are far from the
   start, and spread out when there are several.
7. **Lights.** Each light is on, dead or flickering. Dark patches kill whole
   clusters for the things that live in the dark.
8. **Items.** Place items in the middle band of distance: never at the start
   and never on the exit.
9. **Director.** Choose entities to fit the budget, the debut rule, variety
   and synergies (§9), then the rule shift.

Handcrafted levels replace the generator at every checkpoint (§13).

## The twenty in full

Each entry gives the archetype's knobs, what it is for, and what goes well in
it.

| # | Archetype | Knobs | What it does to you | Good with |
|---|-----------|-------|---------------------|-----------|
| 1 | **The Lobby** [built] | defaults: 70 wall runs, 6 rooms, 4% pillars, 8% dead, 6% flicker | the baseline everyone knows; safe-feeling, which is the trap | anything |
| 2 | **Pillar Hall** [built] | 10 runs, 1 room, 20% pillars, thin fog | you can see 30 m - and be seen; nowhere to break line of sight | Still Life, Stilts |
| 3 | **Cubicle Maze** [built] | 150 runs, 3 rooms, lighter walls, thick fog | sightlines of one cell; every corner is a coin flip | Hounds, Facelings |
| 4 | **Dim Wing** [built] | 30% dead, 16% flicker, low ambient | the dark is the default, light is the landmark | Smiler, Deathmoths |
| 5 | **Damp Floor** [built] | 60 runs, green-grey tint | everything smells of rot; wet patches everywhere | the Attendant, Hounds |
| 6 | **Overtime** [built] | 45% dead, cold blue panels, 2 dark patches | after-hours; the building thinks you've gone home | Smiler, Census Taker |
| 7 | **Long Halls** [next] | wall runs biased to 10+ cells, few rooms | long straight corridors with a door at the end that keeps not getting closer | Deadline, Howler |
| 8 | **Conference Suite** [next] | many 3x4 rooms, single doors, chairs | rooms within rooms; tables to crouch under | Stilts, Ushers |
| 9 | **Poolrooms** [later] | tiled walls, 30 cm of water, high ceilings, echo | everything echoes; footsteps carry twice as far | Hounds (cruel), Hushbaby |
| 10 | **Electrical Station** [later] | narrow corridors, machinery hum, sparks | the hum is loud enough to hide your footsteps, and theirs | Hounds, Tannoy |
| 11 | **Storage Racks** [later] | aisles of shelving, ladders | aisles are long sightlines, shelves block them in one axis | Still Life, Crawlspace |
| 12 | **Red Rooms** [later] | red bulbs, everything monochrome red | the flashlight shows true colour, so wrong things show up | Facelings, Skin-stealer |
| 13 | **Ballroom** [later] | one huge carpeted room, chandeliers, music | the party is here; you can't avoid it, only cross it | Partygoers (home ground) |
| 14 | **Stairwells** [later] | vertical: 5 flights, landings, doors | you can hear things on the floors above and below | Crawlspace, Howler |
| 15 | **Open Plan** [later] | no walls at all, only desks and dividers at waist height | crouch is your only cover | Stilts (home ground) |
| 16 | **Hotel Corridor** [later] | numbered doors, carpets with a pattern, ice machines | doors open onto identical rooms; one of them is not empty | the Guest, Window |
| 17 | **Parking Level** [later] | concrete pillars, oil stains, a car alarm far away | big, grey and cold, with sodium light | Deathmoths, Howler |
| 18 | **Archive** [later] | narrow rows of filing cabinets; paper everywhere | paper rustles underfoot, so stepping in it is loud | Hounds, Census Taker |
| 19 | **Server Room** [later] | blinking racks, cold air, raised floor | it is never dark and never quiet, and the racks blink in patterns | Intercom, Tannoy |
| 20 | **The Last Office** [later] | a perfect copy of the start room, everywhere | every room is the first room; the exit is behind you | Still Life, Deadline |

## Forty more, one line each [later]

These are planned and sketched but not specified. Each would reuse the knobs
above with one new idea.

21. **Mall Food Court**: shuttered stalls; the music is always one aisle
    over.
22. **Daycare**: tiny chairs, crayon on the walls, and something that hums
    a lullaby.
23. **Laundromat**: rows of machines; one of them is always running.
24. **School Hallway**: lockers; the bell rings and the doors open on their
    own.
25. **Gym**: a hollow echo; the basketball keeps bouncing.
26. **Hospital Ward**: curtains between beds, and every bed has someone
    under the sheet.
27. **Subway Platform**: the train is coming, it's always coming.
28. **Waiting Room**: chairs facing a desk, take a number, numbers called
    are never yours.
29. **Library Stacks**: the books are blank except for one sentence each.
30. **Locker Room**: steam and dripping; the showers come on when you
    leave.
31. **Kitchen**: industrial ovens and a walk-in freezer you should not
    shut.
32. **Theater**: seats facing a curtain; the curtain is breathing.
33. **Greenhouse**: plastic plants under grow lamps, and the soil is warm.
34. **Chapel**: pews and a lectern; the hymn board shows the level number.
35. **Ice Rink**: it is slippery, so you can't stop dead.
36. **Bowling Alley**: the pins reset by themselves, very loudly.
37. **Arcade**: attract-mode music and screens that show your own back.
38. **Call Centre**: a hundred phones, and one rings at a time.
39. **Motel Exterior**: an endless strip at night with buzzing neon.
40. **Attic**: beams at head height; you crouch everywhere.
41. **Crawlspace**: 1 m of headroom, crawling only.
42. **Sewer**: knee-deep water and a current that pushes you.
43. **Train Car**: an endless chain of carriages, doors between them.
44. **Elevator Lobby**: buttons that go to levels that don't exist.
45. **Museum**: exhibits of the Backrooms themselves, with your name on a
    plaque.
46. **Cinema Foyer**: popcorn smell and a film playing to nobody.
47. **Nursery Wallpaper**: the classic yellow, but the pattern is ducks.
48. **Fog Level**: fog density x3; navigation by sound only.
49. **Mirror Hall**: every wall reflects, and one reflection is late.
50. **Upside Office**: the ceiling tiles are on the floor.
51. **Construction**: half-built walls, plastic sheeting that moves.
52. **Water Tower**: a spiral walk around a tank that knocks back.
53. **Basement Boiler**: heat haze, pipes and a furnace door.
54. **Snowed Office**: the vents blow snow and footprints stay.
55. **Dollhouse**: rooms scaled 1.5x, so you are small.
56. **Endless Stairs**: Escher, one way only.
57. **Studio Set**: three walls per room, with a camera in the fourth.
58. **Lights Off**: no panels at all; only what you carry.
59. **Overgrown Lobby**: Level 0 a hundred years later, carpet sprouting.
60. **The Exit**: it looks like the real world. It is not.
