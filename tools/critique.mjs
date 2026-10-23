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
const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
pg.on("pageerror", (e) => console.log("pageerror", e.message));
await pg.goto(`http://localhost:${srv.address().port}/index.html?seed=crit&smoke`);
await pg.waitForFunction(() => window.__noclip && window.__noclip.frames > 3, null, { timeout: 60000 });
const shots = [["wretch", 1], ["hounds", 2], ["smiler", 3], ["facelings", 4], ["deathmoths", 5], ["drowned", 6], ["stillLife", 7], ["partygoers", 8], ["stilts", 9], ["hushbaby", 11], ["attendant", 12], ["deadline", 13]].filter(([k]) => !only || only.split(",").includes(k));
for (const [kind, depth] of shots) {
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
      // stand in the entity's own cell, offset toward the most open side
      const L = n.layout, cx = Math.floor(e.x / 2.4), cy = Math.floor(e.z / 2.4);
      const opts = [[1, 0, !L.west[cy][cx + 1]], [-1, 0, !L.west[cy][cx]], [0, 1, !L.north[cy + 1][cx]], [0, -1, !L.north[cy][cx]]];
      const o = opts.find((v) => v[2]) || [1, 0];
      p.x = e.x + o[0] * 2.6; p.z = e.z + o[1] * 2.6;
      p.yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z)); p.pitch = 0.05;
      e.facing = Math.atan2(p.x - e.x, p.z - e.z);
      if (mode === "dark") {
        n.darkAll();
        n.flashlight.on = true; n.flashlight.battery = 1;
      }
      return "ok";
    }, [kind, depth, mode]);
    await pg.waitForTimeout(900);
    await pg.screenshot({ path: `${out}/${kind}-${mode}.png` });
    console.log(kind, mode, info);
  }
}
await b.close(); srv.close();
