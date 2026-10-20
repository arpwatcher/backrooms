// Renders the game in headless Chromium and checks it actually drew a level:
// no console errors, frames advancing, and a screen that is mostly the
// Backrooms' yellow-brown rather than black or a flat clear colour.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try {
    const body = await readFile(join(root, path || "index.html"));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const shot = process.argv.includes("--shot");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let failed = false;
function check(ok, message) {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failed = true;
}

try {
  await page.goto(`http://localhost:${port}/index.html?seed=smoke&smoke`);
  await page.evaluate(() => document.getElementById("enter").click());
  await page.waitForFunction(() => window.__noclip && window.__noclip.frames > 5, null, { timeout: 30000 });
  check(true, "renders frames");
  const stats = await page.evaluate(() => {
    const c = document.getElementById("view");
    const probe = document.createElement("canvas");
    probe.width = 96;
    probe.height = 54;
    const ctx = probe.getContext("2d");
    ctx.drawImage(c, 0, 0, 96, 54);
    const data = ctx.getImageData(0, 0, 96, 54).data;
    let lit = 0, yellow = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r + g + b > 90) lit++;
      if (r > b + 20 && g > b + 10) yellow++;
    }
    return { lit: lit / (96 * 54), yellow: yellow / (96 * 54) };
  });
  check(stats.lit > 0.25, `the screen is lit (${(stats.lit * 100).toFixed(0)}% of pixels)`);
  check(stats.yellow > 0.35, `and it is Backrooms yellow (${(stats.yellow * 100).toFixed(0)}% of pixels)`);
  if (shot) await page.screenshot({ path: "smoke-frame.png" });

  const before = await page.evaluate(() => ({ x: window.__noclip.player.x, z: window.__noclip.player.z }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => ({ x: window.__noclip.player.x, z: window.__noclip.player.z }));
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  check(moved > 0.2, `holding W walks (${moved.toFixed(2)} m)`);
  await page.keyboard.press("KeyF");
  const lightOn = await page
    .waitForFunction(() => window.__noclip.flashlight.on, null, { timeout: 3000 })
    .then(() => true, () => false);
  check(lightOn, "F turns the flashlight on");

  await page.evaluate(() => window.__noclip.teleportToExit());
  await page.waitForFunction(() => window.__noclip.run.depth === 1, null, { timeout: 5000 });
  check(true, "walking into the exit loads the next level");

  await page.evaluate(() => window.__noclip.goToDepth(3));
  const kinds = await page.evaluate(() => [...new Set(window.__noclip.entities.map((e) => e.kind))].sort());
  check(kinds.join(",") === "hounds,smiler", `entities spawn on level 3 (${kinds.join(", ")})`);
  await page.waitForTimeout(1500);
  const moving = await page.evaluate(() => window.__noclip.entities.some((e) => e.state !== "idle"));
  check(moving, "and they run their behaviour");

  await page.evaluate(() => window.__noclip.touch(0));
  const firstTouch = await page.evaluate(() => ({
    down: window.__noclip.player.downUntil > 0, dead: window.__noclip.dead, marks: [...window.__noclip.marks()],
  }));
  check(firstTouch.down && !firstTouch.dead && firstTouch.marks.length === 1, "first contact knocks you down and marks you");
  await page.evaluate(() => window.__noclip.touch(0));
  const death = await page.evaluate(() => ({
    dead: window.__noclip.dead, name: document.getElementById("death-name").textContent,
    rule: document.getElementById("death-rule").textContent,
  }));
  check(death.dead && death.name.length > 0 && death.rule.startsWith("the rule:"), `second contact kills and names it (${death.name})`);
  if (shot) await page.screenshot({ path: "smoke-death.png" });
  await page.evaluate(() => document.getElementById("death-wake").click());
  const woke = await page.evaluate(() => ({ dead: window.__noclip.dead, depth: window.__noclip.run.depth }));
  check(!woke.dead && woke.depth === 0, `waking up goes back to the checkpoint (level ${woke.depth})`);

  const audio = await page.evaluate(() => window.__noclip.audio && window.__noclip.audio.ctx.state);
  check(Boolean(audio), `entering starts the sound (audio context ${audio})`);
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} catch (e) {
  check(false, e.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
