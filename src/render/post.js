// The last pass over every frame: a little film grain, a vignette, colour
// fringing at the edges of the lens, and tone mapping so bright things
// roll off instead of clipping to white. `fear` (0..1) pushes all of it
// harder for a moment - the image tears a little when something sees you.

import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShader = `
uniform sampler2D frame;
uniform float time;
uniform float fear;
uniform float unease;
uniform float grey;
uniform vec2 resolution;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 37.0) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;
  float edge = dot(centred, centred);
  // a torn line or two when fear spikes
  float band = step(0.985 - fear * 0.08, fract(sin(floor(uv.y * 90.0) + floor(time * 24.0)) * 9123.4));
  uv.x += band * fear * 0.03 * (hash(vec2(floor(uv.y * 90.0), 1.0)) - 0.5);
  // colour fringing grows toward the edges, and with fear
  float split = (0.0015 + fear * 0.012 + unease * 0.003) * (0.3 + edge * 2.5);
  vec2 dir = normalize(centred + 1e-5) * split;
  vec4 c = texture2D(frame, uv);
  c.r = texture2D(frame, uv + dir).r;
  c.b = texture2D(frame, uv - dir).b;
  // colour drained away (Monochrome's grey)
  c.rgb = mix(c.rgb, vec3(dot(c.rgb, vec3(0.299, 0.587, 0.114))), grey);
  // grain
  float grain = hash(uv * resolution) - 0.5;
  c.rgb += grain * (0.05 + fear * 0.08);
  // vignette, heavier when you're losing your grip
  c.rgb *= 1.0 - edge * (0.9 + unease * 0.9 + fear * 0.6);
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createPost(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      frame: { value: target.texture },
      time: { value: 0 },
      fear: { value: 0 },
      unease: { value: 0 },
      grey: { value: 0 },
      resolution: { value: size.clone() },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const screen = new THREE.Scene();
  screen.add(quad);
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    uniforms: material.uniforms,
    resize() {
      renderer.getDrawingBufferSize(size);
      target.setSize(size.x, size.y);
      material.uniforms.resolution.value.copy(size);
    },
    render(scene, camera, { time, fear = 0, unease = 0, grey = 0 }) {
      material.uniforms.time.value = time;
      material.uniforms.fear.value = fear;
      material.uniforms.unease.value = unease;
      material.uniforms.grey.value = grey;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(screen, flat);
    },
  };
}
