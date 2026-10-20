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
