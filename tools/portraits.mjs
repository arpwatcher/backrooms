// Shoots the death screen for every entity, to check the close-up framing:
// node tools/portraits.mjs <outdir> [kind,kind]
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
const shots = [["wretch", 1], ["hounds", 2], ["smiler", 3], ["facelings", 4], ["deathmoths", 5], ["drowned", 6], ["stillLife", 7], ["partygoers", 8], ["stilts", 9], ["monochrome", 10], ["hushbaby", 11], ["attendant", 12], ["deadline", 13]].filter(([k]) => !only || only.split(",").includes(k));
for (const [kind, depth] of shots) {
  // a fresh page each time: software gl tires over many levels
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  pg.on("pageerror", (e) => console.log("pageerror", e.message));
  await pg.goto(`http://localhost:${srv.address().port}/index.html?seed=crit&smoke&beam=full`);
  await pg.waitForFunction(() => window.__noclip && window.__noclip.frames > 3, null, { timeout: 60000 });
  const dead = await pg.evaluate(([kind, depth]) => {
    const n = window.__noclip;
    n.goToDepth(depth);
    const i = n.entities.findIndex((e) => e.kind === kind);
    if (i < 0) return "missing";
    for (let k = 0; k < 6 && !n.dead; k++) n.touch(i);
    return n.dead ? "dead" : "alive";
  }, [kind, depth]);
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `${out}/${kind}.png` });
  console.log(kind, dead);
  await pg.close();
}
await b.close(); srv.close();
