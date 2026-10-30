// The topology drawing: Cisco-style icons, links with their interface names
// and a link light at each end (green up, amber coming up, red down), the
// way Packet Tracer and the exam draw them.

import { normalize } from "./engine/iface.js";

const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, parent) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

// icons are drawn in a 64x44 box centred on the device position
const ICONS = {
  router(g) {
    el("ellipse", { cx: 0, cy: 6, rx: 26, ry: 10, class: "ico-side" }, g);
    el("rect", { x: -26, y: -4, width: 52, height: 10, class: "ico-side" }, g);
    el("ellipse", { cx: 0, cy: -4, rx: 26, ry: 10, class: "ico-top" }, g);
    // the four arrows: two in, two out
    const arrow = (x1, y1, x2, y2) => el("path", { d: `M${x1},${y1} L${x2},${y2}`, class: "ico-arrow", "marker-end": "url(#arrowhead)" }, g);
    arrow(-21, -8, -9, -5);
    arrow(21, 0, 9, -3);
    arrow(-3, -1, -15, 1);
    arrow(3, -7, 15, -10);
  },
  switch(g, l3) {
    el("path", { d: "M-28,-4 L-18,-14 L30,-14 L20,-4 Z", class: "ico-top" }, g);
    el("rect", { x: -28, y: -4, width: 48, height: 16, class: "ico-side" }, g);
    el("path", { d: "M20,-4 L30,-14 L30,2 L20,12 Z", class: "ico-end" }, g);
    const arrow = (x1, y1, x2, y2) => el("path", { d: `M${x1},${y1} L${x2},${y2}`, class: "ico-arrow", "marker-end": "url(#arrowhead)" }, g);
    arrow(-20, -6.5, -4, -6.5);
    arrow(8, -11.5, -8, -11.5);
    arrow(-6, -9, 10, -9);
    arrow(18, -4, 2, -4);
    if (l3) {
      el("circle", { cx: -4, cy: 4, r: 4.5, class: "ico-l3" }, g);
      el("path", { d: "M-7,4 L-1,4 M-4,1 L-4,7", class: "ico-l3-mark" }, g);
    }
  },
  pc(g) {
    el("rect", { x: -16, y: -16, width: 32, height: 22, rx: 2, class: "ico-pc" }, g);
    el("rect", { x: -13, y: -13, width: 26, height: 16, class: "ico-screen" }, g);
    el("path", { d: "M-6,6 L6,6 L9,12 L-9,12 Z", class: "ico-pc" }, g);
  },
  server(g) {
    el("rect", { x: -11, y: -18, width: 22, height: 32, rx: 2, class: "ico-pc" }, g);
    for (const y of [-13, -6, 1]) el("rect", { x: -7, y, width: 14, height: 4, class: "ico-screen" }, g);
    el("circle", { cx: 5, cy: 9, r: 1.6, class: "ico-led" }, g);
  },
  cloud(g) {
    el("path", { d: "M-24,8 C-34,8 -34,-6 -22,-6 C-22,-18 -4,-20 0,-10 C4,-20 24,-18 22,-6 C34,-6 34,8 24,8 Z", class: "ico-cloud" }, g);
  },
};

const SCALE = 2.2;
// half the icon's size once scaled, for placing lights where the cable leaves it
// (below the icon the name, and the address if any, count as part of it)
const RX = 30 * SCALE, RY = 22 * SCALE;
const edge = (ux, uy, d) => 1 / Math.hypot(ux / RX, uy / (uy > 0 ? 26 * SCALE + (d.ip || d.os ? 50 : 26) : RY));

// a viewBox around the devices, padded for labels, between 5:3 and 5:4 so
// tall topologies are not shrunk to nothing; never so small that a
// one-router lab is drawn huge
function fit(points) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  // PCs carry an "OS · address" line under them, the widest label there is
  let x0 = Math.min(...xs) - 170, x1 = Math.max(...xs) + 170;
  let y0 = Math.min(...ys) - 90, y1 = Math.max(...ys) + 120;
  let w = Math.max(x1 - x0, 760), h = Math.max(y1 - y0, 456);
  if (w / h > 5 / 3) h = (w * 3) / 5;
  else if (w / h < 5 / 4) w = (h * 5) / 4;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { box: `${cx - w / 2} ${cy - h / 2} ${w} ${h}`, ratio: w / h };
}

export function drawTopology(svg, lab, { onPick, selected, statusOf }) {
  svg.innerHTML = "";
  const defs = el("defs", {}, svg);
  const marker = el("marker", { id: "arrowhead", viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 3, markerHeight: 3, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "ico-arrowhead" }, marker);
  const pos = {};
  const byName = {};
  for (const d of lab.def.devices) (pos[d.name] = { x: d.x * 10, y: d.y * 10 }), (byName[d.name] = d);
  const { box, ratio } = fit(Object.values(pos));
  svg.setAttribute("viewBox", box);
  svg.style.aspectRatio = String(ratio);
  const links = el("g", { class: "links" }, svg);
  const labels = el("g", { class: "labels" }, svg);
  // links between the same two devices are drawn side by side, and an
  // EtherChannel's are circled where they run together
  const pairs = {};
  for (const l of lab.def.links) (pairs[[l[0], l[2]].sort().join("|")] ??= []).push(l);
  for (const group of Object.values(pairs)) {
    if (group.length < 2) continue;
    const A = pos[group[0][0]], B = pos[group[0][2]];
    const ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
    const channel = group.every((l) => lab.devices[l[0]].interfaces[normalize(l[1])]?.channel);
    if (channel) el("ellipse", { cx: (A.x + B.x) / 2, cy: (A.y + B.y) / 2, rx: 16, ry: group.length * 14 + 10, transform: `rotate(${ang} ${(A.x + B.x) / 2} ${(A.y + B.y) / 2})`, class: "bundle" }, labels);
  }
  for (const link of lab.def.links) {
    const [a, ai, b, bi] = link;
    const group = pairs[[a, b].sort().join("|")];
    let A = pos[a], B = pos[b];
    if (group.length > 1) {
      // keep the offset's direction the same whichever end a link lists first
      const [P, Q] = a < b ? [A, B] : [B, A];
      const len = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
      const off = (group.indexOf(link) - (group.length - 1) / 2) * 28;
      const nx = (-(Q.y - P.y) / len) * off, ny = ((Q.x - P.x) / len) * off;
      A = { x: A.x + nx, y: A.y + ny };
      B = { x: B.x + nx, y: B.y + ny };
    }
    el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: "link" }, links);
    // lights and labels a little way along the cable from each end
    for (const [P, Q, name, iface] of [[A, B, a, ai], [B, A, b, bi]]) {
      const dx = Q.x - P.x, dy = Q.y - P.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const out = Math.min(edge(ux, uy, byName[name]), len / 2 - 40);
      const state = statusOf(name, iface);
      el("circle", { cx: P.x + ux * (out + 12), cy: P.y + uy * (out + 12), r: 8, class: `light ${state}` }, labels);
      // the interface name sits beside the cable, not on it
      // on steep cables the name hangs off to its side of the cable, so the
      // two ends of a short vertical link don't print over each other
      const along = out + 52, side = 16, px = -uy;
      const anchor = px < -0.5 ? "end" : px > 0.5 ? "start" : "middle";
      const label = el("text", { x: P.x + ux * along + px * side, y: P.y + uy * along + ux * side + 6, class: "iflabel", "text-anchor": anchor }, labels);
      label.textContent = shortName(iface);
    }
  }
  for (const d of lab.def.devices) {
    const g = el("g", { class: `device ${d.type}${d.name === selected ? " selected" : ""}`, transform: `translate(${pos[d.name].x},${pos[d.name].y})`, tabindex: 0, role: "button", "aria-label": d.name }, svg);
    const icon = el("g", { transform: `scale(${SCALE})` }, g);
    el("rect", { x: -36, y: -26, width: 72, height: 66, rx: 8, class: "hit" }, icon);
    (ICONS[d.type] ?? ICONS.router)(icon, d.type === "l3switch");
    const name = el("text", { x: 0, y: 26 * SCALE + 14, class: "devname", "text-anchor": "middle" }, g);
    name.textContent = lab.devices[d.name].hostname ?? d.name;
    // a PC with a terminal says which OS it runs
    const sub = [d.os && { windows: "Win", linux: "Linux", mac: "Mac" }[d.os], d.ip].filter(Boolean).join(" · ");
    if (sub) {
      const ip = el("text", { x: 0, y: 26 * SCALE + 38, class: "devip", "text-anchor": "middle" }, g);
      ip.textContent = sub;
    }
    g.addEventListener("click", () => onPick(d.name));
    g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && onPick(d.name));
  }
  // lights and port names go over the icons, never under them
  svg.appendChild(labels);
}

function shortName(text) {
  const m = /^([a-zA-Z-]+)\s*(.*)$/.exec(text);
  if (!m) return text;
  const map = { g: "G", gi: "G", gig: "G", gigabitethernet: "G", f: "F", fa: "F", fastethernet: "F", s: "S", se: "S", serial: "S", e: "E", eth: "E" };
  return (map[m[1].toLowerCase()] ?? m[1]) + m[2];
}
