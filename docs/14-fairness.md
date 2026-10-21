# 14. Scary, not punishing

The game should frighten people and keep them coming back. Every rule below
is a promise to the player, and most are checked by tests. If a change breaks
one of these promises, the change is wrong.

## The promises

| # | Promise | How it's kept | Checked by |
|---|---------|---------------|------------|
| 1 | **Every entity has a tell at least 5 s before contact.** | spawns are far from the start; every entity announces itself (sound, sight) from range | `tests/fairness.test.js`: nothing reaches a sprinting, lit, staring player in the first 5 s, across 12 layouts per entity |
| 2 | **Every entity fits on one card.** | name, tell, one-sentence rule, counter, lore | `fairness.test.js`: full cards, rules under 90 characters with no second sentence |
| 3 | **The first contact is survivable.** | first touch knocks you down, takes 0.3 lucidity, and the entity backs off home | `tests/entities.test.js` (contact rule), smoke test (first touch marks, doesn't kill) |
| 4 | **The death screen names the entity and the rule.** | name, "the rule:", "what works:" | smoke test (second touch shows the name and the rule) |
| 5 | **A checkpoint every 5 levels.** | `checkpointFor(depth)` | `tests/survival.test.js`, smoke test (waking goes back to the checkpoint) |
| 6 | **Four difficulty tiers.** | lucid, uneasy, lost, noclip: budget, touches survived, mercy timing | `tests/director.test.js` |
| 7 | **New things are met alone.** | the debut rule, never thinned or silenced by pacing | `tests/plan.test.js` (every entity debuts alone on its level) |
| 8 | **The director backs off.** | the mercy rule: overload or two quick touches | `tests/director.test.js` |
| 9 | **Generated entities are solvable.** | the counter comes from the same row as the rule | `tests/generator.test.js` |
| 10 | **Low lucidity never hides a real tell.** | it adds blinks, vignette and fake tells; real sounds always play | design rule (§3), reviewed per change |
| 11 | **Pausing never costs you.** | game time stops under the pause screen | smoke test (time frozen while paused) |
| 12 | **Same seed, same run.** | every system draws from its own forked stream; plans walk from level 0 | `tests/plan.test.js`, `tests/archetypes.test.js` |

## The tiers

| | lucid | uneasy | lost | noclip |
|---|---|---|---|---|
| who it's for | atmosphere first | the intended way | veterans | people who know every rule |
| entity budget | x0.6 | x1.0 | x1.3 | x1.7 |
| touches survived per entity | 2 | 1 | 1 | 1 |
| overload before mercy | 10 s | 18 s | 28 s | 45 s |
| mercy lasts | 25 s | 18 s | 12 s | 8 s |
| tells | at least 5 s | at least 5 s | at least 5 s | at least 5 s |

Tells are **never** shortened on any tier. Hard means more things at once,
not less warning.

## What a death should feel like

A good death makes the player say "I knew it was there, and I ran anyway."
A bad death makes the player say "what was that?" Every playtest death is
logged as one or the other. Bad deaths are bugs.

The death screen reads like this:

```
you were taken by
HOUNDS
the rule: they hunt by sound alone - anything louder than a crouch gives you away
what works: stop making noise - stand still or crouch-walk and they lose your trail
[wake up]
```
