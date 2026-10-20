# 2. Core loop and co-op

## A level, start to finish

1. **Arrive.** The screen fades in to the hum. The first room is always lit
   and always safe **[built]**, and it gives you a few seconds to look around.
2. **Read the level.** What do the lights look like? Is the carpet wet? Is
   there a sound under the hum? The level's archetype and any rule shift are
   meant to be read from the environment, never from a text box.
3. **Explore toward an exit.** Exits sit far from the start **[built]**.
   Almond water, batteries and notes lie along the way **[built]**:
   almond water and exits.
4. **Meet what lives here.** Something new is always met alone the first time
   **[built]**: the director debuts an entity on its own. Its tell comes
   first, then its behaviour, then (if you break its rule) contact.
5. **Do the task, if there is one.** Some levels lock the exit behind a task
   (§6 tasks) **[next]**.
6. **Leave.** Walking into the exit fades you out and you descend **[built]**.

## The meters a player watches

- **Lucidity** - drains in the dark and near entities, and comes back under
  working light and with almond water **[built]**.
- **Battery** - the flashlight lasts four minutes and browns out when it is
  low **[built]**.
- **Stamina** - running burns it, and once it is gone you are exhausted and
  can only walk until it comes back **[built]**.
- **Noise** - not shown as a meter but always felt: running is loud,
  walking is quieter and crouching is almost silent **[built]**.

## Co-op (up to four) [later]

The browser build is single-player for now. These are the rules multiplayer
will be built to.

- **Shared level, separate bodies.** Each player has their own lucidity,
  battery and stamina, and a shared inventory pool at the exit.
- **Marks are per player.** An entity that has touched you once will kill
  you on the next touch, but your friend is still unmarked.
- **Down, not out.** A killed player becomes an **Echo** (§3) and can still
  help in limited ways. The run ends only when everyone is down at once.
- **Proximity voice.** Voice chat is positional and travels through the level,
  and **entities can hear it**. Hounds hunt voices exactly like footsteps.
  Hushbaby punishes silence instead.
- **Two-key moments.** Some tasks and some entities need two players doing
  different things at the same time: one holds the light on the Smiler while
  the other crosses the dark, or one answers the phone while the other
  watches the hallway.
- **Scaling.** The director's budget scales by `1 + 0.35 x (players - 1)`,
  and each extra player adds one more entity at most, so four players never
  face four times the threat.
- **Splitting up.** Splitting covers more ground and is always tempting.
  Several entities (the Census Taker, Ushers) are worse against people on
  their own, and a few (Clumps) are worse against groups. Neither choice
  is always right.

## Session flow

Title (pick a tier) -> level 0 (tutorial-safe) -> levels 1-4 (the director
debuts one thing per level) -> level 5 (checkpoint, a handcrafted level) ->
more. Dying sends you back to the last checkpoint with the same run seed, so
the levels are the same and what you learned still holds **[built]**.
