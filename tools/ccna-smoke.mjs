// Drives the CCNA labs page in headless Chromium the way a person would:
// opens labs, types each model answer into the right console, presses
// Check and expects every task ticked; then opens the command index and
// the exam view. Any console error fails it.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try {
    const body = await readFile(join(root, path || "ccna/index.html"));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}/ccna/index.html`;

// one of each kind: single device, two routers, a switch sim, a sim with
// prompts, PCs with terminals and answer boxes, and two challenge labs
const LABS = ["hostname", "sim-dhcp", "sim-access-security", "ssh", "sim-ospf", "win-apipa", "sim-three-hosts", "ch-floor-dhcp", "ch-bundle-stp"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
let failed = 0;
const ok = (good, what) => {
  console.log(`${good ? "ok" : "not ok"} - ${what}`);
  if (!good) failed++;
};

await page.goto(base);
await page.waitForFunction(() => window.__ccna);
for (const id of LABS) {
  await page.goto(`${base}#lab/${id}`);
  await page.waitForFunction((want) => window.__ccna.current?.def.id === want, id);
  const { solution, answers } = await page.evaluate(() => ({ solution: window.__ccna.current.def.solution, answers: window.__ccna.current.def.answers ?? {} }));
  for (const [key, lines] of Object.entries(solution)) {
    const name = key.split("#")[0];
    const index = await page.evaluate((n) => window.__ccna.current.consoles.indexOf(n), name);
    await page.locator(".tabs button").nth(index).click();
    for (const line of lines) {
      await page.fill(".cmd", line);
      await page.press(".cmd", "Enter");
    }
  }
  for (const [i, a] of Object.entries(answers)) {
    const box = page.locator(".tasks li").nth(Number(i)).locator(".answer");
    if ((await box.evaluate((e) => e.tagName)) === "SELECT") await box.selectOption(a);
    else await box.fill(a);
  }
  await page.click(".check");
  const ticks = await page.$$eval(".tasks li", (lis) => lis.map((li) => li.className));
  ok(ticks.length > 0 && ticks.every((c) => c === "ok"), `${id}: typing the answer ticks every task (${ticks.join(" ")})`);
  ok((await page.textContent(".result")).includes("Correct"), `${id}: the result says so`);
}

// a challenge lab draws its topology across the full width, and the bundle
// it built is circled
ok(await page.locator(".work.wide").count() === 1, "a challenge lab gets the wide layout");
ok(await page.locator(".topo ellipse.bundle").count() === 1, "the EtherChannel is drawn as a bundle");
await page.goto(`${base}#exam`);
await page.waitForTimeout(200);
await page.click("[data-hard]");
await page.waitForFunction(() => window.__ccna.current?.def);
ok(await page.evaluate(() => window.__ccna.current.def.hard === true), "the harder exam starts with a challenge lab");

await page.goto(`${base}#commands`);
await page.waitForTimeout(200);
ok((await page.locator("main").innerText()).includes("ip helper-address"), "the command index lists commands");
ok((await page.locator("main").innerText()).includes("ipconfig /all"), "the command index lists the PC commands");
await page.goto(`${base}#exam`);
await page.waitForTimeout(200);
ok((await page.locator("main").innerText()).length > 50, "the exam view renders");

ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
