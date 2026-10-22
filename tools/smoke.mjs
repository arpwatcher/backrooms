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

  const firstHint = await page.evaluate(() => window.__noclip.hint);
  check(/walk/.test(firstHint), `level 0 opens with an on-screen hint (${firstHint})`);
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
  await page.keyboard.press("KeyH");
  await frames();
  const helpOpen = await page.evaluate(() => window.__noclip.helpShown && document.querySelectorAll("#help tr").length);
  await page.keyboard.press("KeyH");
  await frames();
  check(helpOpen >= 8 && !(await page.evaluate(() => window.__noclip.helpShown)), `H opens and closes the help (${helpOpen} keys listed)`);
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
    for (let depth = 3; depth < 30; depth++) for (const id of window.__noclip.preview(depth).roster) kinds.add(id);
    return [...kinds].sort();
  });
  check(all.length >= 10, `entities met on levels 3-29: ${all.join(", ")}`);
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

  const batteryDepth = await page.evaluate(() => {
    for (let depth = 1; depth < 12; depth++) {
      window.__noclip.goToDepth(depth);
      if (window.__noclip.items.some((i) => i.kind === "battery")) return depth;
    }
    return null;
  });
  if (batteryDepth !== null) {
    const cell = await page.evaluate(() => {
      window.__noclip.flashlight.battery = 0.2;
      return window.__noclip.items.find((i) => i.kind === "battery");
    });
    await page.evaluate(([x, z]) => window.__noclip.stand(x, z), [cell.x, cell.z]);
    await frames();
    const charge = await page.evaluate(() => window.__noclip.flashlight.battery);
    check(charge > 0.7, `picking up a battery recharges the flashlight (${charge.toFixed(2)})`);
  } else check(false, "a battery turns up somewhere in the first levels");

  // level 6 is the damp floor: puddles, and wet shoes leave prints
  await page.evaluate(() => window.__noclip.goToDepth(6));
  const wet = await page.evaluate(() => window.__noclip.tracks);
  check(wet.puddles > 0, `the damp floor has puddles (${wet.puddles} wet cells)`);
  if (wet.first) {
    const [px, py] = wet.first;
    await page.evaluate(([x, z]) => window.__noclip.stand(x, z), [(px + 0.5) * 2.4, (py + 0.5) * 2.4]);
    await frames();
    // a dry neighbour you can walk to without crossing a wall
    const step = await page.evaluate(([px, py]) => {
      const n = window.__noclip;
      const { width, height, north, west } = n.layout;
      const open = { "1,0": !west[py]?.[px + 1], "-1,0": !west[py]?.[px], "0,1": !north[py + 1]?.[px], "0,-1": !north[py]?.[px] };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= width || y >= height || n.wetAt(x, y) || !open[`${dx},${dy}`]) continue;
        return [(x + 0.5) * 2.4, (y + 0.5) * 2.4];
      }
      return null;
    }, [px, py]);
    if (step) {
      await page.evaluate(([x, z]) => window.__noclip.stand(x, z), step);
      await frames();
      const after = await page.evaluate(() => window.__noclip.tracks.prints);
      check(after >= 1, `stepping out of a puddle leaves a wet print (${after})`);
    } else check(false, "a puddle has a dry cell next to it");
  }

  // deadline's debut: push its front forward and the lights behind it die
  const deadlineDepth = await page.evaluate(() => {
    for (let depth = 10; depth < 30; depth++) if (window.__noclip.preview(depth).roster.includes("deadline")) return depth;
    return null;
  });
  if (deadlineDepth !== null) {
    await page.evaluate((d) => window.__noclip.goToDepth(d), deadlineDepth);
    const lit = await page.evaluate(() => {
      const e = window.__noclip.entities.find((x) => x.kind === "deadline");
      e.front = 12;
      return window.__noclip.litPanels;
    });
    await frames();
    const after = await page.evaluate(() => window.__noclip.litPanels);
    check(after < lit, `deadline puts the lights out behind it (${lit} -> ${after} lit panels)`);
  } else check(false, "deadline turns up by level 29");

  const recordLine = await page.evaluate(() => document.getElementById("records").textContent);
  check(/deepest: .*uneasy \d+/.test(recordLine), `the deepest level is remembered (${recordLine})`);

  await page.evaluate(() => window.__noclip.goToDepth(3));
  await page.evaluate(() => (window.__noclip.player.lucidity = 0.05));
  const phantom = await page
    .waitForFunction(() => window.__noclip.phantom, null, { timeout: 20000 })
    .then((h) => h.jsonValue(), () => null);
  check(phantom !== null, `at low lucidity something shows at the edge of vision (${phantom?.kind})`);
  await page.evaluate(() => (window.__noclip.player.lucidity = 1));

  await page.evaluate(() => window.__noclip.touch(0));
  const firstTouch = await page.evaluate(() => ({
    down: window.__noclip.player.downUntil > 0, dead: window.__noclip.dead, marks: [...window.__noclip.marks()],
  }));
  check(firstTouch.down && !firstTouch.dead && firstTouch.marks.length === 1, "first contact knocks you down and marks you");
  const earnedLine = await page.evaluate(() => document.getElementById("milestones").textContent);
  check(earnedLine.includes("survived your first contact"), "surviving it earns a milestone on the title");
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

  const deep = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await deep.goto(`http://localhost:${port}/index.html?seed=smoke&smoke&depth=4`);
  await deep.waitForFunction(() => window.__noclip && window.__noclip.frames > 1, null, { timeout: 30000 });
  const startedAt = await deep.evaluate(() => window.__noclip.run.depth);
  check(startedAt === 4, `?depth=4 starts the run on level 4 (${startedAt})`);
  await deep.close();

  const audio = await page.evaluate(() => window.__noclip.audio && window.__noclip.audio.ctx.state);
  check(Boolean(audio), `entering starts the sound (audio context ${audio})`);
  const voices = await page.evaluate(() => {
    const a = window.__noclip.audio;
    const played = [];
    for (const sound of ["teeth", "panting", "scrape", "flutter", "party", "whine", "creak", "cry", "mop", "tone"]) {
      a.entity(sound, 3, 1.2, 3, 0.8);
      played.push(sound);
    }
    for (const kind of ["slam", "ring", "steps", "vent"]) a.ambient(kind, 20, 1.5, 20);
    a.fall();
    a.sting(2, 1.4, 2);
    a.squelch();
    a.breath(0.7);
    a.voice(true);
    a.voice(false);
    a.clunk(1, 1.4, 1);
    a.rustle(1, 1.4, 1);
    a.hit();
    a.setVolume(0.5);
    return played.length + 5;
  });
  check(voices === 15, "every entity voice and player sound plays without an error");
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} catch (e) {
  check(false, e.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
