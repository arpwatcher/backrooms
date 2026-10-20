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
    burst,
    panner,
    noiseBuffer,
  };
}
