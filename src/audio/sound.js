// All sound is synthesised - no audio files. The hum is the Backrooms: mains
// frequency and its harmonics, a buzzing ballast through a resonant filter,
// and a slow beat between two near-identical tones so it never quite sits
// still. Some entities live in the hum; when it stops, something is wrong.

export function createAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  const ctx = new Context();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // --- the hum ---
  const hum = ctx.createGain();
  hum.gain.value = 0;
  hum.connect(master);
  const tones = [[60, 0.05], [120, 0.08], [180, 0.025], [240, 0.012], [120.6, 0.05]].map(([freq, level]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(hum);
    osc.start();
    return osc;
  });
  const ballast = ctx.createOscillator();
  ballast.type = "sawtooth";
  ballast.frequency.value = 120;
  const ballastFilter = ctx.createBiquadFilter();
  ballastFilter.type = "bandpass";
  ballastFilter.frequency.value = 2400;
  ballastFilter.Q.value = 8;
  const ballastGain = ctx.createGain();
  ballastGain.gain.value = 0.012;
  ballast.connect(ballastFilter).connect(ballastGain).connect(hum);
  ballast.start();

  // --- room tone: soft filtered noise, the air of a big empty office ---
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const room = ctx.createBufferSource();
  room.buffer = noiseBuffer;
  room.loop = true;
  const roomFilter = ctx.createBiquadFilter();
  roomFilter.type = "lowpass";
  roomFilter.frequency.value = 400;
  const roomGain = ctx.createGain();
  roomGain.gain.value = 0.025;
  room.connect(roomFilter).connect(roomGain).connect(master);
  room.start();

  function noiseBurst({ duration, frequency, q = 1, level, type = "lowpass", at = ctx.currentTime, destination = master }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter).connect(gain).connect(destination);
    src.start(at, Math.random() * 1.5, duration + 0.05);
    return gain;
  }

  // a positioned source for things in the level; the listener follows the camera
  function panner(x, y, z, refDistance = 2) {
    const node = ctx.createPanner();
    node.panningModel = "HRTF";
    node.distanceModel = "inverse";
    node.refDistance = refDistance;
    node.rolloffFactor = 1.4;
    node.positionX.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
    node.connect(master);
    return node;
  }

  const burst = noiseBurst;
  let voiceNode = null;

  return {
    ctx,
    master,
    resume() {
      return ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
    },
    // 0..1; 0 is the silence some entities wait for
    setHum(level, seconds = 0.4) {
      hum.gain.cancelScheduledValues(ctx.currentTime);
      hum.gain.setTargetAtTime(level, ctx.currentTime, seconds / 3);
    },
    // the hum drifts a few cents - unsettling when you notice it
    detune(cents) {
      for (const osc of tones) osc.detune.setTargetAtTime(cents, ctx.currentTime, 0.5);
      ballast.detune.setTargetAtTime(cents, ctx.currentTime, 0.5);
    },
    footstep(running, crouching) {
      const level = crouching ? 0.05 : running ? 0.32 : 0.16;
      burst({ duration: running ? 0.12 : 0.18, frequency: crouching ? 300 : 520, level });
      // the damp squelch under it
      burst({ duration: 0.09, frequency: 1600, q: 4, type: "bandpass", level: level * 0.25, at: ctx.currentTime + 0.03 });
    },
    flickerTick(x, y, z) {
      burst({ duration: 0.04, frequency: 3000, q: 6, type: "bandpass", level: 0.25, destination: panner(x, y, z, 1.5) });
    },
    listen(position, yaw) {
      const l = ctx.listener;
      if (l.positionX) {
        l.positionX.value = position.x;
        l.positionY.value = position.y;
        l.positionZ.value = position.z;
        l.forwardX.value = -Math.sin(yaw);
        l.forwardY.value = 0;
        l.forwardZ.value = -Math.cos(yaw);
      }
    },
    // an entity's tell, from where it is
    entity(sound, x, y, z, volume = 1) {
      const dest = panner(x, y, z, 1.6);
      const t = ctx.currentTime;
      // every call a little different, so the ear never stops hearing it
      const detune = 0.94 + Math.random() * 0.12;
      const burst = (options) => noiseBurst({ ...options, frequency: options.frequency * detune });
      if (sound === "teeth") {
        for (let i = 0; i < 3; i++) {
          burst({ duration: 0.03, frequency: 4200 + i * 300, q: 10, type: "bandpass", level: 0.5 * volume, at: t + i * 0.09, destination: dest });
        }
      } else if (sound === "panting") {
        for (let i = 0; i < 2; i++) {
          burst({ duration: 0.22, frequency: 900, q: 1.5, type: "bandpass", level: 0.35 * volume, at: t + i * 0.32, destination: dest });
        }
        burst({ duration: 0.05, frequency: 2600, q: 5, type: "bandpass", level: 0.2 * volume, at: t + 0.15, destination: dest });
      } else if (sound === "flutter") {
        // dozens of papery wingbeats
        for (let i = 0; i < 9; i++) {
          burst({ duration: 0.025, frequency: 2200 + ((i * 431) % 1800), q: 1.2, type: "bandpass", level: 0.22 * volume, at: t + i * 0.045 + (i % 3) * 0.01, destination: dest });
        }
      } else if (sound === "party") {
        // a cheerful little tune through a wall, a beat too slow
        const muffle = ctx.createBiquadFilter();
        muffle.type = "lowpass";
        muffle.frequency.value = 700;
        muffle.connect(dest);
        const notes = [523.25, 659.25, 783.99, 659.25];
        notes.forEach((f, i) => {
          const at = t + i * 0.42;
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = f * 0.985 * detune;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.16 * volume, at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
          osc.connect(g).connect(muffle);
          osc.start(at);
          osc.stop(at + 0.4);
        });
        for (let i = 0; i < 4; i++) burst({ duration: 0.09, frequency: 90, q: 1, type: "lowpass", level: 0.35 * volume, at: t + i * 0.42, destination: dest });
      } else if (sound === "whine") {
        // a thin rising tone, like a held breath through the nose
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(700 + volume * 500, t);
        osc.frequency.linearRampToValueAtTime(900 + volume * 700, t + 0.45);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08 * volume + 0.01, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
        osc.connect(g).connect(dest);
        osc.start(t);
        osc.stop(t + 0.5);
      } else if (sound === "cry") {
        // a thin wavering wail, muffled as if through plasterboard
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        const wobble = ctx.createOscillator();
        wobble.frequency.value = 6;
        const depth = ctx.createGain();
        depth.gain.value = 30;
        wobble.connect(depth).connect(osc.frequency);
        osc.frequency.setValueAtTime(430 * detune, t);
        osc.frequency.linearRampToValueAtTime(560 * detune, t + 0.35);
        osc.frequency.linearRampToValueAtTime(380 * detune, t + 0.9);
        const muffle = ctx.createBiquadFilter();
        muffle.type = "bandpass";
        muffle.frequency.value = 900;
        muffle.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12 * volume + 0.005, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        osc.connect(muffle).connect(g).connect(dest);
        osc.start(t);
        wobble.start(t);
        osc.stop(t + 1);
        wobble.stop(t + 1);
      } else if (sound === "creak") {
        // long joints, and ceiling tiles knocked in their frames overhead
        burst({ duration: 0.5, frequency: 320, q: 9, type: "bandpass", level: 0.25 * volume, at: t, destination: dest });
        for (let i = 0; i < 3; i++) {
          burst({ duration: 0.04, frequency: 1100 + i * 140, q: 3, type: "bandpass", level: 0.22 * volume, at: t + 0.25 + i * 0.11, destination: dest });
        }
      } else if (sound === "scrape") {
        // something heavy dragged a little way over carpet and stopped
        burst({ duration: 0.45, frequency: 260, q: 3, type: "bandpass", level: 0.6 * volume, at: t, destination: dest });
        burst({ duration: 0.3, frequency: 1400, q: 2, type: "bandpass", level: 0.18 * volume, at: t + 0.05, destination: dest });
      }
    },
    // the building: far-off things that make the place feel lived in, by
    // someone. None of them mean anything. Probably.
    ambient(kind, x, y, z) {
      const dest = panner(x, y, z, 0.9);
      const t = ctx.currentTime;
      if (kind === "slam") {
        burst({ duration: 0.35, frequency: 110, level: 0.9, at: t, destination: dest });
        burst({ duration: 0.08, frequency: 900, q: 2, type: "bandpass", level: 0.35, at: t, destination: dest });
      } else if (kind === "ring") {
        // one ring of an old desk phone, then nothing
        for (const at of [t, t + 0.05 * 7]) {
          const osc = ctx.createOscillator();
          osc.type = "square";
          osc.frequency.value = 440;
          const trem = ctx.createOscillator();
          trem.frequency.value = 20;
          const tg = ctx.createGain();
          tg.gain.value = 0.5;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
          g.gain.setValueAtTime(0.05, at + 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
          trem.connect(tg).connect(g.gain);
          const soft = ctx.createBiquadFilter();
          soft.type = "lowpass";
          soft.frequency.value = 1800;
          osc.connect(soft).connect(g).connect(dest);
          osc.start(at);
          trem.start(at);
          osc.stop(at + 0.36);
          trem.stop(at + 0.36);
        }
      } else if (kind === "steps") {
        // someone walking, a long way off, who stops when you do
        for (let i = 0; i < 6; i++) burst({ duration: 0.12, frequency: 420, level: 0.4, at: t + i * 0.55, destination: dest });
      } else if (kind === "vent") {
        for (let i = 0; i < 7; i++) burst({ duration: 0.05, frequency: 700 + (i % 3) * 200, q: 3, type: "bandpass", level: 0.25, at: t + i * 0.07, destination: dest });
      }
    },
    // falling through the floor of the level: a rushing sweep downward
    fall() {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const sweep = ctx.createBiquadFilter();
      sweep.type = "bandpass";
      sweep.Q.value = 2;
      sweep.frequency.setValueAtTime(2400, t);
      sweep.frequency.exponentialRampToValueAtTime(120, t + 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      src.connect(sweep).connect(g).connect(master);
      src.start(t);
      src.stop(t + 1.35);
    },
    // your own voice, humming under your breath while V is held
    voice(on) {
      if (on && !voiceNode) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = 132 + Math.random() * 20;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.15);
        const soft = ctx.createBiquadFilter();
        soft.type = "lowpass";
        soft.frequency.value = 700;
        osc.connect(soft).connect(g).connect(master);
        osc.start();
        voiceNode = { osc, g };
      } else if (!on && voiceNode) {
        const { osc, g } = voiceNode;
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        osc.stop(ctx.currentTime + 0.3);
        voiceNode = null;
      }
    },
    // your own breath after a sprint: in, out, faster the more spent you are
    breath(effort) {
      const t = ctx.currentTime;
      burst({ duration: 0.32, frequency: 650, q: 0.9, type: "bandpass", level: 0.1 + effort * 0.2, at: t });
      burst({ duration: 0.4, frequency: 480, q: 0.9, type: "bandpass", level: 0.12 + effort * 0.22, at: t + 0.38 });
    },
    setVolume(volume) {
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    },
    // paper peeled off a wall
    rustle(x, y, z) {
      const dest = panner(x, y, z, 1);
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) burst({ duration: 0.07, frequency: 3200 + i * 500, q: 0.8, type: "bandpass", level: 0.18, at: t + i * 0.06, destination: dest });
    },
    // a breaker thrown: a heavy clunk, then the buzz of power coming back
    clunk(x, y, z) {
      const dest = panner(x, y, z, 1.2);
      const t = ctx.currentTime;
      burst({ duration: 0.12, frequency: 180, q: 2, type: "bandpass", level: 0.9, at: t, destination: dest });
      burst({ duration: 0.04, frequency: 2400, q: 4, type: "bandpass", level: 0.4, at: t, destination: dest });
      const buzz = ctx.createOscillator();
      buzz.type = "sawtooth";
      buzz.frequency.value = 120;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      buzz.connect(g).connect(dest);
      buzz.start(t + 0.15);
      buzz.stop(t + 1.7);
    },
    // the knock-down: a low thump and a ring in the ears
    hit() {
      const t = ctx.currentTime;
      burst({ duration: 0.5, frequency: 120, level: 0.9, at: t });
      const ring = ctx.createOscillator();
      ring.frequency.value = 5200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      ring.connect(g).connect(master);
      ring.start(t);
      ring.stop(t + 3);
    },
    burst,
    panner,
    noiseBuffer,
  };
}
