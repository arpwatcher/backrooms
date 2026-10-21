# 10. The entity generator

Twenty hand-made entities and thirty-two famous ones aren't enough for an
infinite descent. The generator combines tables into new entities that still
fit on one card. **[built]** as data and a pure function in
`src/entities/generator.js`, tested in `tests/generator.test.js`. It is not
yet wired into the director: generated entities need a behaviour module per
sense (§ below), and those are being built one at a time.

## How a card is made

```
name      = The <adjective> <role>           24 x 24 = 576 names
sense     = what it hunts by                 12 senses  -> the rule and the counter
trigger   = when the rule applies            5 (always is weighted 4x)
movement  = how it gets to you               6 ways, each with a speed
body      = what you see                     16 bodies
tell      = what you hear or notice first    12 tells, plus the sense's own tell hint
threat    = 0.5 + speed / 6 (+ 0.4 if always on), rounded to 0.25
```

**The sense decides the counter.** A generated card can't be unsolvable,
because its counter comes from the same table row as its rule. This is
checked across 300 seeds.

**Nonsense pairs are filtered out.** A ceiling-crawler that hunts by height,
a blinker that only moves unobserved (it would never be seen to move), and a
drifter that sees only motion are all filtered out.

## The tables

### Senses (the rule)

| Sense | Rule | Counter | Tell hint |
|-------|------|---------|-----------|
| sound | it hunts by sound | move quietly - crouch, or stand still | it sniffs and listens, head cocked |
| light | it is drawn to light | turn your light off, and stay out of lit rooms | it turns toward every bulb |
| dark | it only moves in the dark | stay under working lights | it waits where the panels are dead |
| gaze | it only moves while nobody is looking at it | keep it in view and back away | it is never where it was |
| stare | it attacks whoever looks at it too long | look away | it turns its face to you |
| motion | it only sees what moves | freeze when it faces you | its head jerks toward any movement |
| solitude | it hunts whoever is alone | stay near someone | it counts out loud |
| crowd | it is drawn to groups | split up | many voices from one place |
| silence | it comes when it has been quiet too long | keep making noise | a sound that swells whenever you're quiet |
| trail | it follows the way you came | never backtrack | something on the carpet behind you |
| height | it sees only what stands tall | crouch when it looks your way | a shadow above the walls |
| lucidity | it follows whoever is losing their mind | drink almond water, get under the light | it only shows up at the edge of your vision |

### Triggers

| Trigger | Adds to the rule |
|---------|------------------|
| always | (nothing - always on) |
| near | but only within a few rooms of its nest |
| timer | once a clock you can hear runs out |
| marked | once you have touched something of its |
| dark-only | and only on levels with dead panels |

### Movement

| Movement | Description | Speed (m/s) |
|----------|-------------|-------------|
| stalk | walks after you at a steady pace | 2.2 |
| dash | waits, then crosses a room in a second | 6 |
| crawl | drags itself low along the floor | 1.4 |
| ceiling | moves through the ceiling tiles | 2.8 |
| blink | is simply somewhere else each time you look | 4 |
| drift | drifts slowly, never stopping | 0.9 |

### Bodies

1. a person-shaped stain
2. a tall figure in a stained suit
3. a cluster of mannequin hands
4. a child's coat with nothing in it
5. an office chair that turns to face you
6. a long dog with too many joints
7. a smiling face on a sheet of paper
8. a swarm of paper scraps
9. a janitor with his face to the wall
10. a television on a trolley, showing static
11. a shape made of wet carpet
12. a woman in a raincoat, dripping
13. a pale thing with a lightbulb for a head
14. a pile of shoes that walks
15. a figure made of ceiling tiles
16. a projector that walks on its tripod

### Tells

1. a ringing phone that stops when you answer
2. wet footsteps one beat behind yours
3. a music box, slightly too slow
4. a fluorescent tube buzzing out of tune
5. a voice reading numbers
6. a smell of rain indoors
7. someone humming your favourite song
8. the hum dropping half a tone
9. chairs scraping in an empty room
10. a radio between stations
11. breathing from inside the walls
12. a lift bell somewhere it shouldn't be

## Thirty samples

Generated with `node tools/entity-samples.mjs 30 gdd-samples`. The output is
the same every time, and is pasted here unedited.

| # | Name | Body | Rule | Tell | Counter | Threat |
|---|------|------|------|------|---------|--------|
| 1 | **The Lost Witness** | a smiling face on a sheet of paper; it waits, then crosses a room in a second | it follows whoever is losing their mind, but only within a few rooms of its nest | breathing from inside the walls; it only shows up at the edge of your vision | drink almond water, get under the light | 1.5 |
| 2 | **The Folded Lodger** | a figure made of ceiling tiles; it waits, then crosses a room in a second | it sees only what stands tall | a radio between stations; a shadow above the walls | crouch when it looks your way | 2 |
| 3 | **The Borrowed Caller** | a smiling face on a sheet of paper; it moves through the ceiling tiles | it follows the way you came, but only within a few rooms of its nest | someone humming your favourite song; something on the carpet behind you | never backtrack | 1 |
| 4 | **The Low Cashier** | a pale thing with a lightbulb for a head; it waits, then crosses a room in a second | it only moves in the dark | wet footsteps one beat behind yours; it waits where the panels are dead | stay under working lights | 2 |
| 5 | **The Paper Tenant** | a cluster of mannequin hands; it is simply somewhere else each time you look | it is drawn to groups, once you have touched something of its | a lift bell somewhere it shouldn't be; many voices from one place | split up | 1.25 |
| 6 | **The Last Tenant** | a smiling face on a sheet of paper; it moves through the ceiling tiles | it only sees what moves, and only on levels with dead panels | a voice reading numbers; its head jerks toward any movement | freeze when it faces you | 1 |
| 7 | **The Hollow Lifeguard** | a child's coat with nothing in it; it is simply somewhere else each time you look | it follows whoever is losing their mind | a radio between stations; it only shows up at the edge of your vision | drink almond water, get under the light | 1.5 |
| 8 | **The Grey Lodger** | a television on a trolley, showing static; it moves through the ceiling tiles | it comes when it has been quiet too long | a radio between stations; a sound that swells whenever you're quiet | keep making noise | 1.25 |
| 9 | **The Still Friend** | a pale thing with a lightbulb for a head; it drags itself low along the floor | it hunts whoever is alone, and only on levels with dead panels | a voice reading numbers; it counts out loud | stay near someone | 0.75 |
| 10 | **The Second Caller** | a long dog with too many joints; it waits, then crosses a room in a second | it only moves while nobody is looking at it | chairs scraping in an empty room; it is never where it was | keep it in view and back away | 2 |
| 11 | **The Second Attendant** | a cluster of mannequin hands; it is simply somewhere else each time you look | it hunts whoever is alone, once you have touched something of its | a music box, slightly too slow; it counts out loud | stay near someone | 1.25 |
| 12 | **The Late Tenant** | a person-shaped stain; it drifts slowly, never stopping | it attacks whoever looks at it too long | wet footsteps one beat behind yours; it turns its face to you | look away | 1 |
| 13 | **The Kind Witness** | a janitor with his face to the wall; it moves through the ceiling tiles | it is drawn to groups | breathing from inside the walls; many voices from one place | split up | 1.25 |
| 14 | **The Second Visitor** | a pale thing with a lightbulb for a head; it moves through the ceiling tiles | it follows the way you came, but only within a few rooms of its nest | chairs scraping in an empty room; something on the carpet behind you | never backtrack | 1 |
| 15 | **The Humming Agent** | a television on a trolley, showing static; it waits, then crosses a room in a second | it is drawn to groups | a music box, slightly too slow; many voices from one place | split up | 2 |
| 16 | **The Grey Host** | a smiling face on a sheet of paper; it drifts slowly, never stopping | it attacks whoever looks at it too long, once a clock you can hear runs out | a ringing phone that stops when you answer; it turns its face to you | look away | 0.75 |
| 17 | **The Kind Host** | a smiling face on a sheet of paper; it drags itself low along the floor | it hunts whoever is alone | a ringing phone that stops when you answer; it counts out loud | stay near someone | 1.25 |
| 18 | **The Wet Caller** | a child's coat with nothing in it; it drags itself low along the floor | it sees only what stands tall | a voice reading numbers; a shadow above the walls | crouch when it looks your way | 1.25 |
| 19 | **The Quiet Attendant** | a long dog with too many joints; it waits, then crosses a room in a second | it hunts by sound, and only on levels with dead panels | the hum dropping half a tone; it sniffs and listens, head cocked | move quietly - crouch, or stand still | 1.5 |
| 20 | **The Low Host** | a smiling face on a sheet of paper; it walks after you at a steady pace | it is drawn to groups, once a clock you can hear runs out | the hum dropping half a tone; many voices from one place | split up | 0.75 |
| 21 | **The Pale Host** | a pile of shoes that walks; it drags itself low along the floor | it attacks whoever looks at it too long | someone humming your favourite song; it turns its face to you | look away | 1.25 |
| 22 | **The Carpet Cashier** | a tall figure in a stained suit; it waits, then crosses a room in a second | it comes when it has been quiet too long | breathing from inside the walls; a sound that swells whenever you're quiet | keep making noise | 2 |
| 23 | **The Smiling Twin** | a child's coat with nothing in it; it walks after you at a steady pace | it attacks whoever looks at it too long | a smell of rain indoors; it turns its face to you | look away | 1.25 |
| 24 | **The Tall Clerk** | a television on a trolley, showing static; it drifts slowly, never stopping | it follows the way you came | breathing from inside the walls; something on the carpet behind you | never backtrack | 1 |
| 25 | **The Grey Lifeguard** | a shape made of wet carpet; it drags itself low along the floor | it is drawn to light, and only on levels with dead panels | a radio between stations; it turns toward every bulb | turn your light off, and stay out of lit rooms | 0.75 |
| 26 | **The Bright Visitor** | a pale thing with a lightbulb for a head; it walks after you at a steady pace | it only sees what moves, once you have touched something of its | chairs scraping in an empty room; its head jerks toward any movement | freeze when it faces you | 0.75 |
| 27 | **The Late Passenger** | a cluster of mannequin hands; it waits, then crosses a room in a second | it follows whoever is losing their mind, but only within a few rooms of its nest | a smell of rain indoors; it only shows up at the edge of your vision | drink almond water, get under the light | 1.5 |
| 28 | **The Late Guest** | a projector that walks on its tripod; it drags itself low along the floor | it is drawn to light | chairs scraping in an empty room; it turns toward every bulb | turn your light off, and stay out of lit rooms | 1.25 |
| 29 | **The Hungry Lodger** | a woman in a raincoat, dripping; it waits, then crosses a room in a second | it comes when it has been quiet too long, and only on levels with dead panels | a voice reading numbers; a sound that swells whenever you're quiet | keep making noise | 1.5 |
| 30 | **The Smiling Sleeper** | a tall figure in a stained suit; it is simply somewhere else each time you look | it sees only what stands tall | a music box, slightly too slow; a shadow above the walls | crouch when it looks your way | 1.5 |

## From card to behaviour [next]

Each sense becomes one reusable behaviour module, the same shape as the
hand-made entities (`spawn`, `update(e, sense, dt)` returning events):

| Sense | Reuses | Status |
|-------|--------|--------|
| sound | Hounds' hearing ranges | next |
| light | Deathmoths' brightest-light pull | next |
| dark | Smiler's dark-only approach | next |
| gaze | Still Life's watched check | next |
| stare | Facelings' stare timer | next |
| motion | new: speed above walking freezes it | later |
| solitude, crowd | need co-op | later |
| silence | needs the hum key (V) | later |
| trail | new: the visited-cells set | later |
| height | new: the crouch check | later |
| lucidity | the lucidity stages | later |

The director will add generated entities to its pool from depth 15, at most
one per level, and always as a debut on its first appearance, so the
"learn the rule alone" promise still holds.
