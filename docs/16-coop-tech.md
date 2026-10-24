# 16. Co-op: the technical plan

The game is single-player today. This chapter is the plan for up to four
players, written against the code as it actually is, so the next sessions can
build it in small, tested steps.

## What makes this tractable

The simulation is already split from rendering:

- **Entities are pure state machines** (`src/entities/*.js`). They read a
  plain `sense` object and return events. They don't know about three.js, so
  the same code runs on a host with no renderer.
- **Levels are pure functions of the seed** (`src/game/plan.js`,
  `src/world/layout.js`). Every client can build the same level from
  `runSeed/L<depth>` with no level data sent over the wire.
- **The player model is pure** (`src/game/player.js`): input in, position,
  noise and stamina out.

## Topology: host-authoritative, peer-to-peer

```
          +--------------------+
          |  host (player 1)   |  runs entities, director, tasks, contact
          |  authoritative     |
          +--------------------+
           ^   |   ^   |   ^   |
   inputs  |   v   |   v   |   v   snapshots (entities, events)
          p2      p3      p4       render locally, predict own movement
```

- **Transport:** WebRTC data channels, unordered and unreliable for
  snapshots, reliable for events. Signalling goes through a tiny stateless
  relay: a room code and an SDP exchange, nothing stored. **[later]**
- **No dedicated server.** The host is a player. If the host leaves, the
  lowest-numbered remaining peer becomes host. All state needed to take over
  is in the last snapshot, plus the seed.

## What goes over the wire

| Message | Direction | Rate | Content |
|---------|-----------|------|---------|
| hello | peer to host | once | name, build hash (must match) |
| start | host to all | per level | run seed, depth, tier |
| input | peer to host | 30 Hz | keys held, yaw/pitch, flashlight, hum, crouch |
| snapshot | host to all | 15 Hz | every player's x/z/yaw/height/noise/lucidity; every entity's id/x/z/facing/state |
| event | host to all | as they happen | contact, death, item taken, breaker thrown, note read, door locked/unlocked, darken |
| voice | peer to peer | WebRTC audio | positional voice chat, also fed to the host as player noise |

The level is not sent: the seed builds it. Entity positions use quantized
16-bit coordinates (cell size 2.4 m means 1 cm precision over a 32-cell
level).

## How `sense` changes

Today `sense.player` is one player. With co-op, every entity update needs to
know about everyone:

```js
sense.players = [{ id, x, z, noise, running, crouching, exhausted, humming, lucidity, ... }]
sense.player  = nearest(sense.players, entity)   // keeps every current entity working unchanged
```

Each existing entity keeps working against its nearest player. Co-op
entities (Census Taker, Clump) read `sense.players` directly. Contact events
carry a player id, and marks become per player (`marks[playerId]`).

## Voice as noise

Proximity voice is the co-op feature that sells the game. The host measures
each player's voice level and treats talking above a whisper as noise 0.3
(the same as humming), and shouting as 1. Hounds hear voices. Hushbaby is
settled by them.

## Rollout, in testable steps

1. **`sense.players`** with a single player. **[built]** A refactor with no behaviour
   change. All existing tests still pass, and new tests with two players
   assert each entity goes for the nearest.
2. **Per-player marks and Echo state** (§3), tested in node. **[built]**:
   `src/game/party.js`; the game runs as a party of one.
3. **A loopback transport**: two simulated clients in one node process,
   asserting identical level builds and that host snapshots converge. **[built]**:
   `src/net/protocol.js`, `loopback.js`, `session.js`; tested with a third of
   the snapshots dropped.
4. **Snapshot interpolation** in the renderer: other players as simple
   figures with a name. **[built]**: `src/net/interpolate.js`,
   `src/render/remotes.js`. `?bot` (or `__noclip.addBot()`) puts a stand-in
   second player on a loopback host to see it working in the real game.
5. **WebRTC transport** behind the same interface as the loopback.
6. **Voice**, then voice as noise.
7. **Co-op entities**: Census Taker, Clump, Skin-stealer.

Each step lands with its own tests, and the smoke test grows a two-page run
(two headless browsers in one room) at step 5.
