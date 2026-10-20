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

  function burst({ duration, frequency, q = 1, level, type = "lowpass", at = ctx.currentTime, destination = master }) {
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
      if (sound === "teeth") {
        for (let i = 0; i < 3; i++) {
          burst({ duration: 0.03, frequency: 4200 + i * 300, q: 10, type: "bandpass", level: 0.5 * volume, at: t + i * 0.09, destination: dest });
        }
      } else if (sound === "panting") {
        for (let i = 0; i < 2; i++) {
          burst({ duration: 0.22, frequency: 900, q: 1.5, type: "bandpass", level: 0.35 * volume, at: t + i * 0.32, destination: dest });
        }
        burst({ duration: 0.05, frequency: 2600, q: 5, type: "bandpass", level: 0.2 * volume, at: t + 0.15, destination: dest });
      } else if (sound === "scrape") {
        // something heavy dragged a little way over carpet and stopped
        burst({ duration: 0.45, frequency: 260, q: 3, type: "bandpass", level: 0.6 * volume, at: t, destination: dest });
        burst({ duration: 0.3, frequency: 1400, q: 2, type: "bandpass", level: 0.18 * volume, at: t + 0.05, destination: dest });
      }
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
