// Every surface is painted on a canvas at startup - no image files. The
// Backrooms look is mostly colour and wear: mustard wallpaper with a faint
// repeating pattern, carpet that is the wrong kind of damp, ceiling tiles
// with water rings. Small, tiling, slightly dirty.

import * as THREE from "three";
import { Rng } from "../core/rng.js";

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

function stain(ctx, rng, size, color, count, maxRadius) {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(maxRadius * 0.3, maxRadius);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function noise(ctx, rng, size, alpha, step = 2) {
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const v = rng.int(0, 255);
      ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      ctx.fillRect(x, y, step, step);
    }
  }
}

function finish(c, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function wallpaperTexture(seed = "wallpaper") {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#c9b458";
  ctx.fillRect(0, 0, size, size);
  // the faint repeating motif - thin vertical bands with a small chevron
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = "rgba(120,100,30,0.10)";
    ctx.fillRect(x, 0, 3, size);
    for (let y = 8; y < size; y += 32) {
      ctx.strokeStyle = "rgba(110,90,25,0.16)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 8, y);
      ctx.lineTo(x + 16, y + 8);
      ctx.lineTo(x + 24, y);
      ctx.stroke();
    }
  }
  noise(ctx, rng, size, 0.04);
  // water damage from the ceiling down, darker near the top
  const drip = ctx.createLinearGradient(0, 0, 0, size);
  drip.addColorStop(0, "rgba(90,70,20,0.18)");
  drip.addColorStop(0.25, "rgba(90,70,20,0.0)");
  ctx.fillStyle = drip;
  ctx.fillRect(0, 0, size, size);
  stain(ctx, rng, size, "rgba(110,85,30,0.18)", 5, 50);
  // baseboard
  ctx.fillStyle = "#8e7b3a";
  ctx.fillRect(0, size - 10, size, 10);
  return finish(c);
}

export function carpetTexture(seed = "carpet") {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#a99456";
  ctx.fillRect(0, 0, size, size);
  noise(ctx, rng, size, 0.12, 2);
  // damp patches - darker, slightly green
  stain(ctx, rng, size, "rgba(60,62,30,0.35)", 7, 60);
  stain(ctx, rng, size, "rgba(40,35,15,0.25)", 4, 25);
  return finish(c, 1, 1);
}

export function ceilingTexture(seed = "ceiling") {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#d8d2b0";
  ctx.fillRect(0, 0, size, size);
  noise(ctx, rng, size, 0.05, 2);
  // the tile grid
  ctx.strokeStyle = "rgba(120,110,80,0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  // water rings
  for (let i = 0; i < 3; i++) {
    const x = rng.range(20, size - 20);
    const y = rng.range(20, size - 20);
    for (let r = 6; r < 28; r += 7) {
      ctx.strokeStyle = `rgba(140,110,50,${0.18 - r / 250})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return finish(c);
}

export function panelTexture() {
  const size = 64;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#fffbe6";
  ctx.fillRect(0, 0, size, size);
  // diffuser grid
  ctx.strokeStyle = "rgba(200,190,150,0.6)";
  for (let i = 0; i <= size; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  return finish(c);
}

// --- other levels' surfaces --------------------------------------------------

// poured concrete: grey, blotchy, hairline cracks, a seam where the
// formwork joined
export function concreteTexture(seed = "concrete", base = "#8a8780") {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  noise(ctx, rng, size, 0.1, 2);
  stain(ctx, rng, size, "rgba(40,40,38,0.25)", 10, 45);
  stain(ctx, rng, size, "rgba(160,155,140,0.18)", 6, 35);
  ctx.strokeStyle = "rgba(40,38,34,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = rng.range(0, size), y = rng.range(0, size);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 12; j++) {
      x += rng.range(-9, 9);
      y += rng.range(-2, 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(30,30,28,0.25)";
  ctx.fillRect(0, size / 2 - 1, size, 2);
  return finish(c);
}

// small square pool tiles, off-white, with grey grout and old water stains
export function tileTexture(seed = "tile", base = "#dfe6e4", grout = "#9aa6a4", count = 8) {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const step = size / count;
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      const v = rng.int(-10, 10);
      ctx.fillStyle = base;
      ctx.globalAlpha = 1;
      ctx.fillRect(x * step + 1.5, y * step + 1.5, step - 3, step - 3);
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 80})` : `rgba(0,0,0,${-v / 120})`;
      ctx.fillRect(x * step + 1.5, y * step + 1.5, step - 3, step - 3);
    }
  }
  stain(ctx, rng, size, "rgba(120,140,130,0.18)", 6, 40);
  return finish(c);
}

// painted metal panels with rivets and rust at the seams
export function metalTexture(seed = "metal") {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#5c625e";
  ctx.fillRect(0, 0, size, size);
  noise(ctx, rng, size, 0.07, 2);
  ctx.strokeStyle = "rgba(20,22,20,0.7)";
  ctx.lineWidth = 3;
  for (const x of [0, 128]) {
    ctx.strokeRect(x + 2, 2, 124, size - 4);
  }
  ctx.fillStyle = "rgba(30,30,28,0.8)";
  for (const x of [8, 120, 136, 248]) {
    for (let y = 10; y < size; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  stain(ctx, rng, size, "rgba(120,60,20,0.35)", 8, 30);
  return finish(c);
}

// an office wall: off-white paint, scuffs, a dark baseboard
export function officeWallTexture(seed = "office") {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#cfcbbd";
  ctx.fillRect(0, 0, size, size);
  noise(ctx, rng, size, 0.04, 2);
  stain(ctx, rng, size, "rgba(110,100,80,0.15)", 6, 50);
  ctx.fillStyle = "#3a3a3e";
  ctx.fillRect(0, size - 12, size, 12);
  return finish(c);
}

// grey-blue office carpet tiles
export function officeCarpetTexture(seed = "office-carpet") {
  const rng = new Rng(seed);
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#4e5866";
  ctx.fillRect(0, 0, size, size);
  noise(ctx, rng, size, 0.14, 2);
  ctx.strokeStyle = "rgba(20,24,30,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  stain(ctx, rng, size, "rgba(20,20,20,0.25)", 5, 40);
  return finish(c);
}

// What a cheap flashlight actually throws: a hot centre, a bright ring and
// a darker one from the reflector, a wide soft spill that fades out rather
// than stopping at an edge, and the shadows of dust and scratches on the lens.
let cookie = null;
export function flashlightCookie() {
  if (cookie) return cookie;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const mid = size / 2;
  const rng = new Rng("lens");
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - mid + 0.5, y - mid + 0.5) / mid;
      // spill: a long soft falloff to nothing at the rim
      let v = Math.max(0, 1 - r) ** 0.9 * 0.85;
      // the hot spot
      v += Math.exp(-((r / 0.2) ** 2)) * 0.45;
      // the reflector's rings: bright, then a dark band, then a faint one
      v += Math.exp(-(((r - 0.3) / 0.035) ** 2)) * 0.16;
      v -= Math.exp(-(((r - 0.4) / 0.04) ** 2)) * 0.1;
      v += Math.exp(-(((r - 0.62) / 0.05) ** 2)) * 0.06;
      // a little lopsided, as a real one is
      v *= 1 + 0.06 * Math.cos(Math.atan2(y - mid, x - mid) * 3 + 0.7) * Math.min(1, r * 2);
      const i = (y * size + x) * 4;
      const k = Math.max(0, Math.min(255, v * 255));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // dust and a scratch or two on the lens
  g.globalCompositeOperation = "multiply";
  for (let i = 0; i < 24; i++) {
    const x = mid + rng.range(-mid * 0.7, mid * 0.7), y = mid + rng.range(-mid * 0.7, mid * 0.7);
    const r = rng.range(1, 4);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(200,200,200,${rng.range(0.25, 0.5)})`);
    grad.addColorStop(1, "rgba(255,255,255,1)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = "rgba(170,170,170,0.6)";
  for (let i = 0; i < 3; i++) {
    g.lineWidth = rng.range(0.5, 1.2);
    g.beginPath();
    const a = rng.range(0, Math.PI * 2), d = rng.range(10, mid * 0.6);
    g.moveTo(mid + Math.cos(a) * d, mid + Math.sin(a) * d);
    g.lineTo(mid + Math.cos(a) * d + rng.range(-40, 40), mid + Math.sin(a) * d + rng.range(-40, 40));
    g.stroke();
  }
  cookie = new THREE.CanvasTexture(c);
  cookie.colorSpace = THREE.SRGBColorSpace;
  return cookie;
}
