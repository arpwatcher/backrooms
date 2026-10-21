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
  mannequin posture, the Deathmoths' cloud, the Partygoer's balloon and the
  Faceling's office clothes.
- **Low lucidity distorts what you see, never the rules.** It brings
  vignette, desaturation, a breathing field of view and blinking. It never
  hides a real tell.

## Sound

**The hum** is two detuned sawtooth oscillators around 60/120 Hz through a
lowpass, plus a room tone of filtered noise. It never stops, except on a
**silent hum** rule shift. A mercy period softens it, and players learn to
feel that as relief.

**Footsteps** are noise bursts shaped by posture: a run is short and bright,
a crouch is low and soft. Stride length triggers them, not time.

**Every entity has a voice:**

| Entity | Sound | How it's made |
|--------|-------|---------------|
| Smiler | wet clicking teeth | three short high bandpass bursts |
| Hounds | panting, claws | two mid bandpass breaths and a click |
| Still Life | stone scraping on carpet | low bandpass drag and a high scratch |
| Deathmoths | papery flutter | nine tiny high bursts in a ragged rhythm |
| Partygoers | a cheerful tune through a wall, slightly flat | triangle arpeggio, lowpassed, with a kick |
| Facelings | a thin rising whine | a sine sweep that gets louder as you stare |
| You | breath after a sprint | in and out noise bands, faster when spent |

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
