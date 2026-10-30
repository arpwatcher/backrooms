# NOCLIP ∞

A Backrooms horror game that runs in the browser. It has the same yellow
wallpaper, the same damp carpet and the same hum, but every level is built
from a seed, and the things that live in it each follow one rule you have to
learn.

Work in progress. The design lives in [`docs/`](docs/) and the game in
[`src/`](src/).

## What is in it

- **A story.** You noclip into the Backrooms with a radio in your hand.
  Elena, who came through long ago, talks you down through the levels to the
  way out:

  | Level | Place | What lives there |
  |-------|-------|------------------|
  | 0 | The Lobby | nothing (yet) |
  | 1 | Habitable Zone | the Wretch |
  | 2 | Pipe Dreams | Hounds |
  | 3 | Electrical Station | the Smiler |
  | 4 | Abandoned Office | Facelings |
  | 6 | Lights Out | Deathmoths |
  | 37 | The Poolrooms | the Drowned, and the way out |

  After the ending you can keep going down. Endless levels are generated
  from the seed, with more entities.
- **Things that hunt you.** Thirteen entities, each with one rule. Something
  new is always met alone first. Seven are real animated 3D models:
  - The Wretch sees you in light, hears you when you're loud, and runs you
    down. Break its line of sight and keep still, and it gives up.
  - The Hounds, a flayed dog that hunts by sound.
  - The Facelings, bound in cloth with no face.
  - Stilts, a faceless man in a suit, far too tall.
  - Still Life, a plaster mannequin that moves only when you don't look.
  - The Drowned, who moves only while you move, and as fast as you do.
  - Monochrome, who drains the colour from the rooms around it and can only
    walk in its own grey. Stay under the warm panels.

  When something is after you, lockers in dead ends are somewhere to hide:
  crouch inside one and nothing that hunts by sight can see you.
- **Scary, not punishing.**
  - Every entity gives a warning at least 5 seconds before it can reach you.
  - The first touch only knocks you down.
  - The death screen shows what got you and the rule you broke.
  - There's a checkpoint at the Lights Out level.
  - Four difficulty tiers. The easiest has an arrow to the exit.
- **Atmosphere.**
  - Film grain and filmic light.
  - A sting and a camera jolt when something sees you.
  - A chase drone and a heartbeat when something is after you.
  - A flashlight that throws the monsters' shadows (on machines fast enough)
    and stutters when something hunting you is close.
  - Hallucinations at low lucidity.
  - Footsteps that sound like the floor.
- Textures are painted on canvas. Sounds are synthesized with WebAudio, with
  real CC0 recordings (growls, screams, moans; `assets/sfx/CREDITS.md`)
  layered on top, and everything in the level rings in a shared reverb.
  The exceptions are the 3D models credited below.
- **Co-op.** Up to four players, browser to browser, no server. Press Esc,
  then co-op: the host makes an invite code, a friend pastes it into join
  and sends back an answer code, the host pastes that, and the friend is in
  the host's level. Send the codes by any chat. The host runs the monsters,
  which go for whoever is nearest. Each player keeps a colour (backpack,
  armband, name) so you can tell who is who from behind. Every player has
  their own marks, and in a group the dead become Echoes. Add `?bot` to the
  address to walk with a stand-in second player on your own. Still to come:
  voice, and an Echo's own view (see `docs/16-coop-tech.md`).

## Controls

| Key | Does |
|-----|------|
| WASD / arrows | move |
| mouse | look |
| Shift | run (loud) |
| C / Ctrl | crouch (quiet) |
| F | flashlight |
| E | use (breakers, ...) |
| Q | drink almond water |
| V (hold) | hum under your breath |
| H | help: every key, and what to do |
| Esc | pause and settings |

Play with headphones. Most of the game is in what you hear.

## Running it

There is no build step. Serve the folder and open it:

```
npm run serve        # then http://localhost:8080
```

Add `?seed=anything` to the URL to play or share a specific run,
`&tier=lucid|uneasy|lost|noclip` to pick a difficulty, and `&depth=4` to
start on a given level.

## CCNA CLI labs

[`ccna/`](ccna/) is a separate page in the same repo, with Cisco IOS command
labs for the CCNA 200-301 exam:
<https://arpwatcher.github.io/backrooms/ccna/>. Like the exam, it is all in
English.

- **Mini labs like the exam's.** Each lab has a small topology (two or three
  devices, as on the exam), a task list, and a console for every device.
  Every command in the syllabus has its own lab. Each module ends with a
  bigger "sim" lab. Modules: IOS basics, VLANs and trunks, STP, EtherChannel,
  inter-VLAN routing, static routing, OSPFv2, connectivity troubleshooting
  (ping, extended ping, traceroute, debug), HSRP, IP services (DHCP, DNS,
  NTP, syslog, SNMP, CDP/LLDP), NAT, ACLs, security (SSH, port security,
  DHCP snooping, DAI), IPv6, device management, and host OS commands.
  RIP, EIGRP, VTP and multi-area OSPF are left in as clearly marked extras.
- **PCs with a terminal.** In the host OS chapter the PCs run Windows,
  Linux or macOS, with the commands for checking a client's settings:
  `ipconfig` (`/all`, `/release`, `/renew`, `/displaydns`, `/flushdns`),
  `ip addr`, `ip route`, `ip neigh`, `ifconfig`, `netstat -rn`, `scutil --dns`,
  `resolvectl status`, `arp`, `nslookup`, `dig`, `ping`, `tracert` and
  `traceroute`. Their output comes from the lab: a renew gets a lease only
  when a router on the segment has a pool for it (or a relay to one), and
  otherwise the PC falls back to 169.254.x.x. Some tasks are questions
  answered from that output.
- **A console that behaves like IOS.** It accepts abbreviations (`conf t`,
  `sh ip int br`) and answers with IOS's own errors (`% Ambiguous command`,
  `% Invalid input` with the caret). It also has `?` help, Tab completion,
  `do`, pipes (`| include`, `| section`), and the real prompts for `enable`,
  `copy`, `reload` and `crypto key`. The `show` output is built from what you
  configured; spanning tree, for one, works out root path costs, root ports
  and the blocked ports the way 802.1D does.
- **Checking is done on the result, not the typing.** "Check" inspects the
  configuration that resulted (adjacencies, trunks, the root bridge, the
  HSRP active router, NAT and ACL entries), so any correct answer passes.
  When a task fails, it says what is missing.
- **Troubleshooting and reading output, as the exam asks.** Most modules
  have a sim that starts broken (a native VLAN mismatch, a passive OSPF
  interface and an area mismatch, NAT roles swapped, an ACL in the wrong
  direction, HSRP peers in different groups, an err-disabled port, a DHCP
  pool on the wrong network, a stray root priority) and labs whose tasks
  are questions answered from `show` output.
- **Challenge labs, harder than the exam.** A separate chapter of sims with
  four to eight devices and nine or ten tasks each, mixing topics the way a
  real network does: a three-switch campus with STP questions, a five-fault
  VLAN ticket, an OSPF triangle with an Internet edge and PAT, HSRP on two
  Layer 3 switches over LACP, DHCP for two sites through a relay, an access
  switch hardened end to end, an Internet edge with static NAT and a
  filtered DMZ, OSPF broken in four places, a FastEthernet bundle that
  spanning tree routes around, a floating static that only fails over one
  way, a new floor whose DHCP is stopped by five faults, and SSH locked to
  one admin PC. Exam mode has a harder option made only of these. 203
  labs, 40 of them sims.
- **A network that behaves like one.** OSPF routes are worked out from the
  adjacencies you actually brought up (costs, O IA, the O*E2 default), a
  PC only reaches what its VLAN, the trunks and the routers' tables allow,
  a ping needs a route back, HSRP answers ARP with its virtual MAC, and
  nothing on the Internet answers a private address that was not NATed.
  ACLs filter the packets themselves (echo and echo-reply separately, a
  DHCP Discover from 0.0.0.0 too), a ping leaves its NAT translation and a
  renew its DHCP binding, a router's first ping shows `.!!!!` (and
  `ping ... source` tests from another interface), telnet and ssh from a
  router or a PC are refused or let in by transport input, RSA keys,
  access-class and login local, NTP syncs only to a server that answers
  and has time itself, and spanning tree runs over port-channels with their
  real cost. `show ip route` prints the classful headings IOS 15
  does. A test replays every model answer and fails if one of its pings
  gets no reply.
- **Exam mode.** Timed random labs with no hints, scored out of 1000
  (pass at 825).

The engine is in `ccna/engine/` and the labs are in `ccna/labs/`, one file
per module. Each lab is plain data: devices, links, tasks with a check
function, and a model answer. The tests require every model answer to pass
every task, and require an empty attempt to fail.

## Tests

```
npm test             # logic: generation, entities, director, fairness (node --test)
npm run smoke        # plays the real game in headless Chromium and checks it
npm run smoke:ccna   # types lab answers into the CCNA page and checks them
```

three.js and its glTF loader are vendored under `vendor/three/` (MIT, see its LICENSE).

The monster models are free assets found online: CC0 models by
HorrorGameMaker.com, codyanka, Noah Summers and burning_barb, and two models
by bitkiln (free for commercial use, "Art by bitkiln"). Authors, licences and
what was changed are in [`assets/models/CREDITS.md`](assets/models/CREDITS.md).
