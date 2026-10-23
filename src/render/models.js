// Real 3D models (glTF), loaded once at startup and cloned for every
// entity that uses them. Each model brings its own animation clips; an
// entity picks the clip from its state and the mixer crossfades between
// them. If a model fails to load (offline, blocked), the entity falls back
// to its procedural body, so the game still runs.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

export const MODELS = {
  creature: {
    base: "assets/models/creature.glb",
    clips: { walk: "assets/models/creature-walk.glb", run: "assets/models/creature-run.glb", jump: "assets/models/creature-jump.glb" },
    height: 1.9,
  },
  hound: {
    base: "assets/models/hound.glb",
    clips: { idle: "Idle", walk: "Walk", run: "Run", howl: "Howl", attack: "Attack" },
    scale: 1.25,
  },
  facelings: {
    base: "assets/models/facelings.glb",
    clips: { idle: "Idle_Watchful", walk: "Walk_Nervous", run: "Run_Frantic", scream: "Scream.lol" },
  },
  drowned: {
    base: "assets/models/drowned.glb",
    clips: { idle: "Idle", walk: "Walk", run: "Run", retch: "Retch", attack: "Attack" },
  },
  // no clips: the game poses its bones itself (see stiltsMesh)
  stilts: { base: "assets/models/stilts.glb", clips: {}, scale: 1.06 },
  stillLife: { base: "assets/models/stilllife.glb", clips: {}, scale: 1.04 },
};

// a clip is either its own file (a path ending in .glb) or the name of an
// animation inside the base file
function pick(base, ref) {
  return base.animations.find((a) => a.name === ref || a.name.endsWith(`|${ref}`)) ?? null;
}

const loaded = new Map();

export async function preloadModels(root = "") {
  const loader = new GLTFLoader();
  await Promise.all(
    Object.entries(MODELS).map(async ([name, spec]) => {
      try {
        const base = await loader.loadAsync(root + spec.base);
        const clips = { idle: base.animations[0] };
        for (const [clip, ref] of Object.entries(spec.clips)) {
          clips[clip] = ref.endsWith(".glb") ? (await loader.loadAsync(root + ref)).animations[0] : pick(base, ref);
        }
        for (const [clip, c] of Object.entries(clips)) if (c) clips[clip] = Object.assign(c.clone(), { name: clip });
        loaded.set(name, { scene: base.scene, clips, spec });
      } catch (error) {
        console.warn(`model ${name} could not load, using the procedural body`, error?.message ?? error);
      }
    }),
  );
  return [...loaded.keys()];
}

export function hasModel(name) {
  return loaded.has(name);
}

// a fresh copy of the model with its own mixer; `clipFor(entity)` names the
// clip to play, `speedFor(entity)` how fast to play it, and `pose(time,
// entity, bone)` may turn bones by hand after the clip has played
export function modelInstance(name, { clipFor = () => "idle", speedFor = () => 1, scale = 1, pose = null } = {}) {
  const source = loaded.get(name);
  if (!source) return null;
  const group = new THREE.Group();
  const body = clone(source.scene);
  body.scale.setScalar(scale * (source.spec.scale ?? 1));
  body.rotation.y = source.spec.yaw ?? 0;
  body.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.castShadow = false;
      if (o.material) {
        o.material = o.material.clone();
        o.material.roughness = 0.7;
        o.material.envMapIntensity = 0;
      }
    }
  });
  group.add(body);
  const mixer = new THREE.AnimationMixer(body);
  const actions = {};
  for (const [clip, c] of Object.entries(source.clips)) if (c) actions[clip] = mixer.clipAction(c);
  let current = null;
  let last = null;
  // bones by their blender name ("upper_arm.L"); the loader strips the dots
  const bones = new Map();
  body.traverse((o) => o.isBone && bones.set(o.name, o));
  const bone = (n) => bones.get(n) ?? bones.get(n.replace(/\./g, ""));
  const rest = new Map([...bones].map(([n, b]) => [n, b.quaternion.clone()]));
  group.userData.body = body;
  group.userData.animate = (time, entity) => {
    const want = clipFor(entity) ?? "idle";
    if (want !== current && actions[want]) {
      const next = actions[want];
      next.reset().play();
      if (current && actions[current]) actions[current].crossFadeTo(next, 0.25, false);
      current = want;
    }
    if (actions[current]) actions[current].timeScale = speedFor(entity);
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, time - last));
    last = time;
    mixer.update(dt);
    if (pose) {
      if (!actions[current]) for (const [n, q] of rest) bones.get(n).quaternion.copy(q);
      pose(time, entity, bone);
    }
  };
  return group;
}
