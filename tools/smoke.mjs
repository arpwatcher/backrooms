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

// headless rendering is slow (a few frames a second), so wait on frames, not time
async function frames(n = 2) {
  const start = await page.evaluate(() => window.__noclip.frames);
  await page.waitForFunction((target) => window.__noclip.frames >= target, start + n, { timeout: 20000 });
}

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

  const home = await page.evaluate(() => ({ x: window.__noclip.player.x, z: window.__noclip.player.z }));
  const firstNote = await page.evaluate(() => window.__noclip.notes[0]);
  check(firstNote && /EXIT/.test(firstNote.text), "level 0 has a note by the start that teaches the way out");
  await page.evaluate(([x, z]) => window.__noclip.stand(x, z), [firstNote.x, firstNote.z]);
  await frames();
  const shown = await page.evaluate(() => document.getElementById("toast").textContent);
  check(shown === firstNote.text, "walking up to a note reads it out");
  await page.evaluate(([x, z]) => window.__noclip.stand(x, z), [home.x, home.z]);

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

  await page.evaluate(() => window.__noclip.goToDepth(1));
  const debut = await page.evaluate(() => window.__noclip.plan);
  check(debut.reason === "debut" && debut.roster.length === 1, `level 1 debuts one entity alone (${debut.roster.map((d) => d.id)})`);
  await page.evaluate(() => window.__noclip.goToDepth(3));
  const { kinds, planned } = await page.evaluate(() => ({
    kinds: [...new Set(window.__noclip.entities.map((e) => e.kind))].sort(),
    planned: window.__noclip.plan.roster.map((d) => d.id).sort(),
  }));
  check(kinds.length > 0 && kinds.join() === planned.join(), `the director's roster spawns on level 3 (${kinds.join(", ")})`);
  await page.waitForTimeout(1500);
  const moving = await page.evaluate(() => window.__noclip.entities.some((e) => e.state !== "idle"));
  check(moving, "and they run their behaviour");

  // every entity the director knows can be built and run in the real game
  const all = await page.evaluate(async () => {
    const kinds = new Set();
    for (let depth = 3; depth < 16; depth++) for (const id of window.__noclip.preview(depth).roster) kinds.add(id);
    return [...kinds].sort();
  });
  check(all.length >= 6, `entities met on levels 3-15: ${all.join(", ")}`);
  const places = await page.evaluate(async () => {
    const ids = new Set();
    for (let depth = 0; depth < 16; depth++) ids.add(window.__noclip.preview(depth).archetype);
    return [...ids];
  });
  check(places.length >= 4, `levels 0-15 visit different kinds of place: ${places.join(", ")}`);
  const paces = await page.evaluate(() => {
    const kinds = new Set();
    for (let depth = 0; depth < 80; depth++) kinds.add(window.__noclip.preview(depth).pace);
    return [...kinds].sort();
  });
  check(["breather", "peak", "silence"].every((k) => paces.includes(k)), `the run has peaks, breathers and silences (${paces.join(", ")})`);
  const shifts = await page.evaluate(() => {
    const found = {};
    for (let depth = 0; depth < 40; depth++) {
      const id = window.__noclip.preview(depth).shift;
      if (id && !(id in found)) found[id] = depth;
    }
    return found;
  });
  check(Object.keys(shifts).length >= 3 && Math.min(...Object.values(shifts)) >= 3, `rule shifts turn up from level 3 on: ${JSON.stringify(shifts)}`);
  if ("flat" in shifts) {
    await page.evaluate((d) => window.__noclip.goToDepth(d), shifts.flat);
    await page.keyboard.press("KeyF");
    await frames();
    check(!(await page.evaluate(() => window.__noclip.flashlight.on)), "on a dead-battery level F does nothing");
  }
  if ("soaked" in shifts) {
    await page.evaluate((d) => window.__noclip.goToDepth(d), shifts.soaked);
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");
    await frames(3);
    const running = await page.evaluate(() => window.__noclip.player.running);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    check(!running, "on a soaked level you cannot run");
  }
  const taskDepth = await page.evaluate(() => {
    for (let depth = 2; depth < 30; depth++) if (window.__noclip.preview(depth).task) return depth;
    return null;
  });
  if (taskDepth !== null) await page.evaluate((d) => window.__noclip.goToDepth(d), taskDepth);
  check(taskDepth !== null, `a level with a task turns up (level ${taskDepth})`);
  if (taskDepth !== null) {
    await page.evaluate(() => window.__noclip.teleportToExit());
    await page.waitForTimeout(1500);
    check((await page.evaluate(() => window.__noclip.run.depth)) === taskDepth, "its exit stays shut until the task is done");
    const targets = await page.evaluate(() => window.__noclip.task.targets);
    for (const t of targets) {
      await page.evaluate(([x, z]) => window.__noclip.stand(x, z), [t.x, t.z]);
      await frames();
      await page.keyboard.press("KeyE");
      await frames();
    }
    check(await page.evaluate(() => window.__noclip.task.complete), `E at each of the ${targets.length} breakers restores power`);
    await page.evaluate(() => window.__noclip.teleportToExit());
    await page.waitForFunction((d) => window.__noclip.run.depth === d + 1, taskDepth, { timeout: 5000 }).catch(() => {});
    check((await page.evaluate(() => window.__noclip.run.depth)) === taskDepth + 1, "and then the exit lets you through");
  }

  await page.evaluate(() => window.__noclip.goToDepth(3));
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

  // the pause screen: it exists, its settings stick, and the clock stops under it
  const paused = await page.evaluate(async () => {
    const screen = document.getElementById("pause");
    screen.classList.remove("hidden");
    const slider = document.getElementById("set-volume");
    slider.value = "0.3";
    slider.dispatchEvent(new Event("input"));
    await new Promise((r) => requestAnimationFrame(r));
    const t = window.__noclip.time;
    const frames = window.__noclip.frames;
    await new Promise((r) => setTimeout(r, 1500));
    const held = window.__noclip.time === t;
    document.getElementById("pause-resume").click();
    return { held, saved: JSON.parse(localStorage.getItem("noclip.settings.v1")).volume, frames };
  });
  check(paused.held && paused.saved === 0.3, "pausing freezes the level and settings are saved");

  const cards = await page.evaluate(() => {
    document.getElementById("codex-open").click();
    const n = document.querySelectorAll("#codex .card").length;
    document.getElementById("codex-close").click();
    return n;
  });
  check(cards >= 4, `the codex lists every entity (${cards} cards)`);

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
