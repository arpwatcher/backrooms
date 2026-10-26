// Shoots every entity up close, lit and in the dark, for the critique list
// (docs/17-critique.md): node tools/critique.mjs <outdir> [kind,kind]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const http = require("node:http"); const fs = require("node:fs"); const path = require("node:path");
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const only = process.argv[3];
const root = new URL("..", import.meta.url).pathname;
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(new URL(q.url, "http://x").pathname)); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : p.endsWith(".html") ? "text/html" : "application/octet-stream" }); r.end(b); }); });
await new Promise((ok) => srv.listen(0, ok));
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// a fresh page for every entity: one page kept through all thirteen levels
// and two dozen shots under software gl starts handing back black frames
async function freshPage() {
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  pg.on("pageerror", (e) => console.log("pageerror", e.message));
  pg.on("console", (m) => m.type() === "error" && console.log("console", m.text().slice(0, 200)));
  pg.on("crash", () => console.log("page crashed"));
  await pg.goto(`http://localhost:${srv.address().port}/index.html?seed=crit&smoke`);
  await pg.waitForFunction(() => window.__noclip && window.__noclip.frames > 3, null, { timeout: 60000 });
  return pg;
}
const shots = [["wretch", 1], ["hounds", 2], ["smiler", 3], ["facelings", 4], ["deathmoths", 5], ["drowned", 6], ["stillLife", 7], ["partygoers", 8], ["stilts", 9], ["monochrome", 10], ["hushbaby", 11], ["attendant", 12], ["deadline", 13]].filter(([k]) => !only || only.split(",").includes(k));
for (const [kind, depth] of shots) {
  const pg = await freshPage();
  for (const mode of ["lit", "dark"]) {
    const info = await pg.evaluate(([kind, depth, mode]) => {
      const n = window.__noclip;
      n.goToDepth(depth);
      const e = n.entities.find((x) => x.kind === kind);
      if (!e) return "missing";
      e.stunnedUntil = 1e9;
      if (kind === "hushbaby") e.state = "coming";
      if (kind === "deadline") { e.front = Math.max(e.front, 3); e.state = "coming"; }
      const p = n.player;
      const L = n.layout, cx = Math.floor(e.x / 2.4), cy = Math.floor(e.z / 2.4);
      // frozen it can't drain: lay its grey around it by hand
      if (kind === "monochrome") for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) e.grey.set(`${cx + dx},${cy + dy}`, 1e9);
      // look for a spot with a clear view: walk round the entity at a few
      // distances and take the furthest one that the game itself says can
      // see it (and can see past both its shoulders, so a pillar doesn't
      // cut it in half), well away from any wall, and never on an exit -
      // walking into one starts the fall and the shot catches the fade
      const exits = new Set((L.exits ?? []).map((x) => `${x.x},${x.y}`));
      const pillars = new Set((L.pillars ?? []).map((x) => `${x.x},${x.y}`));
      const roomy = (x, z) => {
        const gx = Math.floor(x / 2.4), gy = Math.floor(z / 2.4);
        if (gx < 0 || gy < 0 || gx >= L.width || gy >= L.height || exits.has(`${gx},${gy}`) || pillars.has(`${gx},${gy}`)) return false;
        const fx = x / 2.4 - gx, fy = z / 2.4 - gy;
        return !((fx < 0.2 && L.west[gy][gx]) || (fx > 0.8 && L.west[gy][gx + 1]) || (fy < 0.2 && L.north[gy][gx]) || (fy > 0.8 && L.north[gy + 1][gx]));
      };
      let spot = null;
      for (const d of [3.4, 2.8, 2.2, 1.7]) {
        for (let k = 0; k < 16 && !spot; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = e.x + Math.sin(a) * d, z = e.z + Math.cos(a) * d;
          const sx = Math.cos(a) * 0.45, sz = -Math.sin(a) * 0.45;
          if (roomy(x, z) && n.sees(x, z, e.x, e.z) && n.sees(x, z, e.x + sx, e.z + sz) && n.sees(x, z, e.x - sx, e.z - sz)) spot = [x, z];
        }
        if (spot) break;
      }
      if (!spot) {
        const opts = [[1, 0, !L.west[cy][cx + 1]], [-1, 0, !L.west[cy][cx]], [0, 1, !L.north[cy + 1][cx]], [0, -1, !L.north[cy][cx]]];
        const o = opts.find((v) => v[2] && !exits.has(`${cx + v[0]},${cy + v[1]}`)) || opts.find((v) => v[2]) || [1, 0];
        spot = [e.x + o[0] * 2.6, e.z + o[1] * 2.6];
      }
      [p.x, p.z] = spot;
      p.yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z)); p.pitch = 0.05;
      e.facing = Math.atan2(p.x - e.x, p.z - e.z);
      if (mode === "dark") {
        n.darkAll();
        n.flashlight.on = true; n.flashlight.battery = 1;
      }
      return "ok";
    }, [kind, depth, mode]);
    await pg.waitForTimeout(900);
    const state = await pg.evaluate(() => ({ fade: getComputedStyle(document.getElementById("fade")).opacity, frames: window.__noclip.frames, dead: window.__noclip.dead, depth: window.__noclip.run.depth }));
    await pg.screenshot({ path: `${out}/${kind}-${mode}.png` });
    if (process.env.CRIT_DEBUG) console.log(JSON.stringify(state));
    console.log(kind, mode, info);
  }
  await pg.close();
}
await b.close(); srv.close();
