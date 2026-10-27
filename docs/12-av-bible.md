# 12. Audio-visual bible

Every texture is painted on a canvas at startup, and every sound is
synthesized with WebAudio. There are no image or audio files in the
repository. This keeps the game small, procedural and consistent, and it
forces the look and sound to come from rules rather than assets.

## Look

**Palette.** The yellow of the lobby is the anchor, and everything else is
measured against it.

| Swatch | Hex | Use |
|--------|-----|-----|
| wallpaper | `#c9b458` | walls, with a faint chevron and band motif |
| carpet | `#a99456` | floor, with damp stains |
| panel light | `#fff6d0` / point light `#fff1c4` | the fluorescent warmth |
| fog | `#3b3316`, density 0.048 | how far you can see in the lobby |
| exit red | `#d23a2a` | the only saturated colour in the lobby, on purpose |
| dead panel | `#3a3628` | a panel that is off |

**Rules:**

- **One saturated thing per scene.** In the lobby it is the exit sign. On a
  party level it is the balloons. Colour means attention.
- **Fog is the draw distance and the mood.** Archetypes set it (pillar hall
  0.036, so you see far; cubicle maze 0.055; dim wing 0.07).
- **Light pooling.** Ten real point lights follow the panels nearest you,
  and every other panel is emissive only. You never see the trick, because
  far panels are lost in the fog.
- **Entities are readable silhouettes.** Each has one shape that reads at 20
  m: the Smiler's grin, the Hounds' low long body, the Still Life's
  mannequin posture, the Deathmoths' cloud, the Partygoer's balloon and paper hat,
  the Faceling's grey wrappings, the Hushbaby's arms with their elbows
  above its back, and the Attendant bent double over his mop.
- **Every entity has one thing that reads in the dark** (see the table
  below), so a dead level hides the body but never the warning.
- **Low lucidity distorts what you see, never the rules.** It brings
  vignette, desaturation, a breathing field of view and blinking. It never
  hides a real tell.

**What reads in the dark.** With the panels dead and the flashlight off,
this is what you see of each thing, and from how far.

| Entity | In the dark | Range |
|--------|-------------|-------|
| Smiler | the grin and two pale points | across a room |
| Hounds | eyeshine, green-gold, slow blink while they listen **[built]** | 15 m |
| Still Life | pale cracked plaster, barely | 6 m |
| Deathmoths | the glowing dust and a breathing smear of light | 12 m |
| Partygoers | the grin, whose teeth catch any light, and the balloon | 10 m |
| Facelings | nothing: they are only seen in light, and only do harm if looked at | - |
| Hushbaby | nothing until it comes; then the glint on two wet black eyes | 5 m |
| Stilts | the pale head, far above where a head should be | 10 m |
| The Attendant | two dull red points in the hole of his face, when following | 6 m |
| Deadline | it is the dark: the panels going out is the tell | - |
| The Wretch | its red, flayed body, faintly | 5 m |
| The Drowned | the wet shine on his oilskin | 6 m |
| Monochrome | the colour draining from the floor round it | the grey patch |

Where an entry says nothing, the tell is a sound (see `04-entities.md`).
The ranges are targets; the critique shots (`17-critique.md`) check them.

## Sound

**The hum** is two detuned sawtooth oscillators around 60/120 Hz through a
lowpass, plus a room tone of filtered noise. It never stops, except on a
**silent hum** rule shift. A mercy period softens it, and players learn to
feel that as relief.

**Footsteps** are built like a real step: the heel lands (a low thud that
drops in pitch), the foot rolls, the toe follows, and the carpet pile
scuffs, damp. A run rolls quickly, a crouch slowly and quietly. Concrete
adds a hard heel and a slap back from the room; water sloshes. No two
steps are the same, left and right sit a little to each side, and a touch
of the reverb puts them in the room. Stride length triggers them, not time.

**Every entity has a voice.** Most are synthesized; where a real throat
is needed a CC0 or public-domain recording is layered on top (credits in
`assets/sfx/CREDITS.md`), played at a different pitch each time and often
slowed. If the recordings don't load, the synthesis plays alone.

| Entity | Sound | How it's made |
|--------|-------|---------------|
| Smiler | wet chewing and clicking teeth | recorded chewing at 0.8 speed under three short high bandpass bursts |
| Hounds | panting, and now and then a growl under it | mid bandpass breaths and a click; a recorded growl at 0.7 speed |
| Still Life | stone scraping on carpet | low bandpass drag and a high scratch |
| Deathmoths | papery flutter | nine tiny high bursts in a ragged rhythm |
| Partygoers | a music box through the wall playing "Happy Birthday" | synthesized steel tines, a few beats per call, flatter and slower each time round |
| Facelings | a thin rising whine | a sine sweep that gets louder as you stare |
| Hushbaby | an infant crying in the wall; out of it, the same cry doubled an octave down | recorded cries, muffled and slowed in the wall |
| The Wretch | a rasp; on sight a scream | recorded growl; recorded scream at 0.8 speed over a growl at 0.6 |
| The Drowned | a wet retch | recorded burbles at 0.72 speed and drips |
| (any, on sight) | the sting | a dissonant cluster, a noise slash, and a roar slowed to 0.55 |
| (the building) | slams, a phone, steps, vents, moans far off | synthesized; the moans are recordings, lowpassed |
| You | breath after a sprint | in and out noise bands, faster when spent |

**The rooms.** Everything placed in the level is also sent to one shared
reverb: an impulse made at start-up, 2.2 s of noise that darkens as it dies,
a little different in each ear, like a long low office with soft walls. A
limiter at the end keeps a scream over a chase from clipping.

**Mixing rules:**

- Tells are spatial (HRTF panner), so headphones tell you where.
- The player's own sounds (breath, footsteps) are not spatial; they sit in
  your head.
- Nothing is louder than the hit sound (a low thump and ear ring on
  contact). It is the one sound that should make you flinch.

## UI

- A small HUD bottom-left showing level, battery and almond water. Lucidity
  is shown on the screen (vignette, saturation), not as a number.
- Toasts are short, lower-case and in-world. Notes use a handwriting face.
- The death screen is red-black. It shows the name large, then the rule
  and what works.
- Monospace everywhere else. The game should feel like a terminal from
  1996 that has been left on.
