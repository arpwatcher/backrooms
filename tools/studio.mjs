// Screenshots one monster in the studio from a few angles:
// node tools/studio.mjs <outdir> <kind> [state] [extra query]
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary" };
const [out, kind, state = "idle", extra = ""] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
for (const [name, angle, light] of [["front", 0.15, 1], ["side", 1.3, 1], ["dark", 0.4, 0]]) {
  await page.goto(`http://localhost:${server.address().port}/tools/studio.html?kind=${kind}&state=${state}&angle=${angle}&light=${light}&${extra}`);
  await page.waitForFunction(() => window.__frames > 8, null, { timeout: 60000 });
  await page.screenshot({ path: `${out}/${kind}-${name}.png` });
}
await browser.close();
server.close();
console.log("ok");
