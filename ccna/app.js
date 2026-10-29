// The page: the lab menu, a lab (topology, tasks, a console per device),
// the command index and the exam mode.

import { LABS, MODULES } from "./labs/index.js";
import { buildLab, checkLab } from "./engine/lab.js";
import { exec, prompt, help, complete } from "./engine/device.js";
import { status } from "./engine/net.js";
import { normalize } from "./engine/iface.js";
import { drawTopology } from "./topo.js";
import { hostBanner } from "./engine/host.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// `code` in task text becomes <code>
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

// --- progress (this browser only) ----------------------------------------------------------

const KEY = "ccna-labs.v1";
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? { done: {} };
  } catch {
    return { done: {} };
  }
}
let progress = loadProgress();
function saveProgress() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* private mode: progress lasts for the visit */
  }
}

// --- menu ---------------------------------------------------------------------------------------

const byModule = (id) => LABS.filter((l) => l.module === id);
function renderMenu(filter = "") {
  const box = $("#modules");
  const q = filter.trim().toLowerCase();
  box.innerHTML = "";
  for (const m of MODULES) {
    const labs = byModule(m.id).filter((l) => !q || l.title.toLowerCase().includes(q) || l.cmds.some((c) => c.toLowerCase().includes(q)) || m.title.toLowerCase().includes(q));
    if (!labs.length) continue;
    const done = labs.filter((l) => progress.done[l.id]).length;
    const wrap = document.createElement("div");
    wrap.className = "module";
    const open = q || current?.def.module === m.id || openModules.has(m.id);
    wrap.innerHTML = `<button aria-expanded="${open}"><span>${esc(m.title)}</span><span class="count">${done}/${labs.length}</span></button>`;
    const ul = document.createElement("ul");
    ul.hidden = !open;
    for (const l of labs) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="#lab/${l.id}" class="${current?.def.id === l.id ? "current" : ""}"><span class="tick">${progress.done[l.id] ? "✓" : ""}</span><span>${esc(l.title)}</span>${l.hard ? '<span class="tag hard">challenge</span>' : l.kind === "sim" ? '<span class="tag sim">sim</span>' : ""}${l.extra ? '<span class="tag extra">not on 200-301</span>' : ""}</a>`;
      ul.appendChild(li);
    }
    wrap.querySelector("button").addEventListener("click", (e) => {
      ul.hidden = !ul.hidden;
      e.currentTarget.setAttribute("aria-expanded", String(!ul.hidden));
      if (ul.hidden) openModules.delete(m.id);
      else openModules.add(m.id);
    });
    wrap.appendChild(ul);
    box.appendChild(wrap);
  }
  const total = LABS.length;
  const done = LABS.filter((l) => progress.done[l.id]).length;
  $("#progress").innerHTML = `<b>${done}</b> / ${total} labs`;
}
const openModules = new Set();

// --- a lab --------------------------------------------------------------------------------------

let current = null; // { def, lab, selected, buffers, histories, exam }

function openLab(def, { exam = null } = {}) {
  const lab = buildLab(def);
  // routers and switches always have a console; a PC has one when it has an OS
  const consoles = def.devices.filter((d) => ["router", "switch", "l3switch"].includes(d.type) || d.os).map((d) => d.name);
  current = { def, lab, selected: consoles[0], consoles, buffers: {}, histories: {}, cursor: {}, exam, checked: null };
  for (const name of consoles) {
    const dev = lab.devices[name];
    current.buffers[name] = dev.host ? hostBanner(dev) : `\n${dev.banner ? dev.banner + "\n" : ""}\nPress RETURN to get started.\n\n`;
    current.histories[name] = [];
  }
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild($("#lab-view").content.cloneNode(true));
  $(".work").classList.toggle("wide", !!def.hard);
  const mod = MODULES.find((m) => m.id === def.module);
  $(".crumbs").innerHTML = exam ? `<span>Exam · question ${exam.index + 1} of ${exam.list.length}</span>` : `<span>${esc(mod?.title ?? "")}</span>${def.hard ? '<span class="tag hard">challenge</span>' : def.kind === "sim" ? '<span class="tag sim">simulation</span>' : '<span class="tag">mini lab</span>'}${def.cmds.slice(0, 6).map((c) => `<span class="tag">${esc(c)}</span>`).join("")}`;
  $(".lab-title").textContent = def.title;
  $(".intro").innerHTML = rich(def.intro ?? "");
  renderTasks();
  renderTabs();
  renderTopology();
  renderScreen();
  wireLab();
  if (exam) {
    $(".theory-btn").hidden = true;
    $(".solution-btn").hidden = true;
    $(".check").textContent = exam.index + 1 < exam.list.length ? "Next question →" : "End exam";
    $(".reset-btn").hidden = false;
    const timer = $(".timer");
    timer.hidden = false;
    tickTimer();
  }
  renderMenu($("#search").value);
  $(".cmd").focus({ preventScroll: true });
}

function renderTasks(results) {
  const ol = $(".tasks");
  ol.innerHTML = "";
  current.def.tasks.forEach((task, i) => {
    const li = document.createElement("li");
    const r = results?.[i];
    if (r) li.className = r.ok ? "ok" : "bad";
    li.innerHTML = rich(task.text) + answerBox(task, i) + (r && !r.ok && r.why ? `<span class="why">${rich(r.why)}</span>` : "");
    ol.appendChild(li);
    const box = li.querySelector(".answer");
    if (box) box.addEventListener(box.tagName === "SELECT" ? "change" : "input", () => (current.lab.answers[i] = box.value));
  });
}

// a task that asks something gets a text box, or a list when it has choices
function answerBox(task, i) {
  const v = current.lab.answers[i] ?? "";
  if (task.choices) return `<select class="answer" aria-label="Answer"><option value="">Choose…</option>${task.choices.map((c) => `<option${c === v ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
  if (task.ask) return `<input class="answer" type="text" spellcheck="false" autocomplete="off" placeholder="${esc(task.ask)}" value="${esc(v)}" aria-label="Answer">`;
  return "";
}

function renderTabs() {
  const tabs = $(".tabs");
  tabs.innerHTML = "";
  for (const name of current.consoles) {
    const b = document.createElement("button");
    b.textContent = current.lab.devices[name].hostname;
    b.className = name === current.selected ? "on" : "";
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => select(name));
    tabs.appendChild(b);
  }
}

// the light at one end of a link: green if both ends are up, amber while
// a switch port is still coming up after no shutdown, red if down
function lightOf(name, ifname) {
  const dev = current.lab.devices[name];
  const f = dev.interfaces[normalize(ifname)];
  if (!f) return "none";
  if (["pc", "server", "cloud"].includes(dev.type)) {
    const end = dev.links[f.name];
    const other = end?.device.interfaces[end.iface];
    return other && !other.shutdown ? "up" : "down";
  }
  const [st, pr] = status(dev, f);
  if (st === "up" && pr === "up") return f.channel && !isBundledSafe(dev, f) ? "amber" : "up";
  return "down";
}
function isBundledSafe(dev, f) {
  return true;
}

function renderTopology() {
  drawTopology($(".topo"), current.lab, {
    selected: current.selected,
    statusOf: lightOf,
    onPick: (name) => {
      const d = current.def.devices.find((x) => x.name === name);
      if (current.consoles.includes(name)) {
        $(".pc-info").hidden = true;
        select(name);
      } else {
        const box = $(".pc-info");
        box.hidden = !box.hidden && box.dataset.name === name;
        box.dataset.name = name;
        box.textContent = `${name}\nIPv4 Address . . : ${d.ip?.split("/")[0] ?? "DHCP"}\nSubnet Mask  . . : ${d.ip ? maskText(Number(d.ip.split("/")[1])) : "-"}\nDefault Gateway  : ${d.gateway ?? "-"}`;
      }
    },
  });
}
const maskText = (bits) => {
  const n = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
};

function select(name) {
  current.selected = name;
  renderTabs();
  renderTopology();
  renderScreen();
  $(".cmd").focus({ preventScroll: true });
}

function renderScreen() {
  const dev = current.lab.devices[current.selected];
  $(".out").textContent = current.buffers[current.selected];
  $(".prompt").textContent = prompt(dev);
  const input = $(".cmd");
  input.type = dev.pending?.secret ? "password" : "text";
  const screen = $(".screen");
  screen.scrollTop = screen.scrollHeight;
}

function write(text) {
  current.buffers[current.selected] += text;
}

function submit(line) {
  const name = current.selected;
  const dev = current.lab.devices[name];
  const secret = dev.pending?.secret;
  const shown = secret ? "" : line;
  write(prompt(dev) + shown + "\n");
  if (!secret && line.trim()) {
    current.histories[name].push(line);
    current.cursor[name] = current.histories[name].length;
  }
  const out = exec(dev, line);
  // cls / clear
  if (out === "\f") current.buffers[name] = "";
  else if (out) write(out.replace(/\n?$/, "\n"));
  // a hostname change renames the tab and the icon
  renderTabs();
  renderTopology();
  renderScreen();
}

function wireLab() {
  const input = $(".cmd");
  input.addEventListener("keydown", (e) => {
    const name = current.selected;
    const dev = current.lab.devices[name];
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input.value;
      input.value = "";
      submit(v);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (!dev.pending) input.value = complete(dev, input.value);
    } else if (e.key === "?" && !dev.pending && !dev.host) {
      e.preventDefault();
      write(prompt(dev) + input.value + "?\n" + help(dev, input.value) + "\n");
      renderScreen();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const h = current.histories[name];
      let c = current.cursor[name] ?? h.length;
      c = Math.max(0, Math.min(h.length, c + (e.key === "ArrowUp" ? -1 : 1)));
      current.cursor[name] = c;
      input.value = h[c] ?? "";
    } else if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      write(prompt(dev) + input.value + "^Z\n");
      input.value = "";
      const out = exec(dev, "^z");
      if (out) write(out + "\n");
      renderScreen();
    } else if (e.ctrlKey && (e.key === "c" || e.key === "C") && !window.getSelection()?.toString()) {
      e.preventDefault();
      write(prompt(dev) + input.value + "\n");
      input.value = "";
      if (dev.pending) dev.pending = null;
      renderScreen();
    }
  });
  $(".screen").addEventListener("click", () => {
    if (!window.getSelection()?.toString()) input.focus({ preventScroll: true });
  });
  $(".check").addEventListener("click", () => {
    if (current.exam) return examNext();
    const results = checkLab(current.lab);
    renderTasks(results);
    const ok = results.every((r) => r.ok);
    const res = $(".result");
    res.className = `result ${ok ? "ok" : "bad"}`;
    res.textContent = ok ? "Correct! All tasks are complete." : `${results.filter((r) => r.ok).length} of ${results.length} tasks correct.`;
    if (ok) {
      progress.done[current.def.id] = Date.now();
      saveProgress();
      renderMenu($("#search").value);
      const next = nextLab(current.def);
      if (next) {
        const b = $(".next-btn");
        b.hidden = false;
        b.onclick = () => (location.hash = `#lab/${next.id}`);
      }
    }
  });
  $(".theory-btn").addEventListener("click", () => {
    const box = $(".theory");
    box.hidden = !box.hidden;
    box.innerHTML = `<h3>Theory</h3><p>${rich(current.def.teach ?? "")}</p>${current.def.cmds.length ? `<h3>Commands</h3><p>${current.def.cmds.map((c) => `<code>${esc(c)}</code>`).join(" · ")}</p>` : ""}`;
  });
  $(".solution-btn").addEventListener("click", () => {
    const box = $(".solution");
    if (!box.hidden) return (box.hidden = true);
    box.hidden = false;
    box.innerHTML = "<h3>One correct answer</h3>" + Object.entries(current.def.solution).map(([dev, lines]) => `<div><b>${esc(dev.replace("#", " (then) "))}</b><pre>${esc(lines.filter((l) => l !== "").join("\n"))}</pre></div>`).join("") + Object.entries(current.def.answers ?? {}).map(([i, a]) => `<div><b>Task ${Number(i) + 1}</b><pre>${esc(a)}</pre></div>`).join("") + "<p>Try it yourself first. Other answers are correct too: the check looks at the resulting configuration, not the words you typed.</p>";
  });
  $(".reset-btn").addEventListener("click", () => openLab(current.def, { exam: current.exam }));
}

function nextLab(def) {
  const i = LABS.indexOf(def);
  return LABS[i + 1] ?? null;
}

// --- command index -------------------------------------------------------------------------------

function renderCommands() {
  current = null;
  const index = new Map();
  for (const l of LABS) for (const c of l.cmds) (index.get(c) ?? index.set(c, []).get(c)).push(l);
  const rows = [...index.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  $("#main").innerHTML = `<section class="page"><h1>Commands</h1><p class="lead">Every command and the labs that use it. ${rows.length} commands in ${LABS.length} labs.</p><div class="cmd-index">${rows.map(([c, labs]) => `<div class="cmd-row"><code>${esc(c)}</code><span class="labs">${labs.map((l) => `<a href="#lab/${l.id}">${esc(l.title)}</a>`).join("")}</span></div>`).join("")}</div></section>`;
  renderMenu($("#search").value);
}

// --- exam mode ---------------------------------------------------------------------------------------

let examState = null;
function renderExamStart() {
  current = null;
  const sims = LABS.filter((l) => l.kind === "sim" && !l.extra).length;
  $("#main").innerHTML = `<section class="page"><h1>Exam simulation</h1>
  <div class="exam-card"><h2>How it works</h2>
  <p>You get random labs like the exam simulations. There is no theory, no answers and no checking along the way, and you cannot go back to a previous question, as in the real exam. At the end you see what passed and what did not.</p>
  <p>Simulations available: ${sims}. Mini labs fill the rest of the test.</p>
  <div class="buttons"><button class="btn primary" data-n="5" data-min="25">5 questions · 25 minutes</button><button class="btn" data-n="10" data-min="45">10 questions · 45 minutes</button></div>
  <h2>Harder than the exam</h2>
  <p>Only challenge labs: bigger topologies, several topics in one lab, faults to find and questions on the output.</p>
  <div class="buttons"><button class="btn" data-n="3" data-min="45" data-hard="1">3 challenge labs · 45 minutes</button></div></div></section>`;
  for (const b of $("#main").querySelectorAll("[data-n]")) b.addEventListener("click", () => startExam(Number(b.dataset.n), Number(b.dataset.min), Boolean(b.dataset.hard)));
  renderMenu($("#search").value);
}

function startExam(n, minutes, hard = false) {
  const pool = LABS.filter((l) => !l.extra && l.module !== "basics");
  const sims = shuffle(pool.filter((l) => l.kind === "sim" && !l.hard));
  const micros = shuffle(pool.filter((l) => l.kind !== "sim"));
  const list = hard ? shuffle(pool.filter((l) => l.hard)).slice(0, n) : [...sims.slice(0, Math.ceil(n * 0.6)), ...micros].slice(0, n);
  examState = { list: shuffle(list), index: 0, results: [], ends: Date.now() + minutes * 60000 };
  openLab(examState.list[0], { exam: examState });
}
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function examNext() {
  examState.results.push({ def: current.def, results: checkLab(current.lab) });
  examState.index++;
  if (examState.index < examState.list.length && Date.now() < examState.ends) return openLab(examState.list[examState.index], { exam: examState });
  finishExam();
}
function finishExam() {
  const all = examState.results.flatMap((r) => r.results);
  const pct = all.length ? Math.round((all.filter((r) => r.ok).length / all.length) * 100) : 0;
  // the real exam is scored out of 1000, pass mark around 825
  const scaled = Math.round(300 + pct * 7);
  current = null;
  $("#main").innerHTML = `<section class="page"><h1>Score report</h1><div class="exam-card"><div class="score">${scaled} / 1000</div><p>${pct}% of tasks correct. The passing score on the real exam is about 825/1000. ${scaled >= 825 ? "Pass." : "Not yet: see below which ones you missed."}</p></div>
  <ol class="exam-results">${examState.results.map((r) => `<li><a href="#lab/${r.def.id}">${esc(r.def.title)}</a>: ${r.results.filter((x) => x.ok).length}/${r.results.length}${r.results.filter((x) => !x.ok).map((x) => `<div class="why">✗ ${rich(x.text)}</div>`).join("")}</li>`).join("")}</ol>
  <div class="buttons"><a class="btn" href="#exam">New exam</a></div></section>`;
  examState = null;
}
function tickTimer() {
  const t = $(".timer");
  if (!t || !examState) return;
  const left = Math.max(0, examState.ends - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  t.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (left <= 0) return examNext();
  setTimeout(tickTimer, 1000);
}

// --- home ------------------------------------------------------------------------------------------------

function renderHome() {
  current = null;
  $("#main").innerHTML = `<section class="welcome"><h1>CCNA CLI Labs</h1>
  <p>Mini labs for the CCNA 200-301 commands. You type IOS commands into a router or switch console (modes, abbreviations, <code>?</code>, Tab), and the check looks at whether the resulting <b>configuration</b> is correct, not whether you typed the same words.</p>
  <p>In the Host OS chapter the PCs have their own Windows, Linux or macOS terminal, for checking a client's IP settings the way the exam asks.</p>
  <p>Labs marked <span class="tag sim">sim</span> are short scenarios with 3 to 6 tasks, like the exam simulations. The others are one lab per command.</p>
  <div class="grid">${MODULES.map((m) => {
    const labs = byModule(m.id);
    const done = labs.filter((l) => progress.done[l.id]).length;
    return `<a class="mod" href="#lab/${labs[0]?.id}"><b>${esc(m.title)}</b><span>${esc(m.blurb)} · ${labs.length} labs</span><div class="bar"><i style="width:${labs.length ? (done / labs.length) * 100 : 0}%"></i></div></a>`;
  }).join("")}</div></section>`;
  renderMenu($("#search").value);
}

// --- routing -------------------------------------------------------------------------------------------------

function route() {
  const hash = location.hash.slice(1);
  for (const a of document.querySelectorAll(".views a")) a.classList.toggle("on", a.dataset.view === (hash.startsWith("commands") ? "commands" : hash.startsWith("exam") ? "exam" : "labs"));
  $("#menu").classList.remove("open");
  if (hash.startsWith("lab/")) {
    const def = LABS.find((l) => l.id === hash.slice(4));
    if (def) {
      examState = null;
      openModules.add(def.module);
      return openLab(def);
    }
  }
  if (hash === "commands") return renderCommands();
  if (hash === "exam") return renderExamStart();
  renderHome();
}

$("#search").addEventListener("input", (e) => renderMenu(e.target.value));
$("#menu-toggle").addEventListener("click", () => $("#menu").classList.toggle("open"));
window.addEventListener("hashchange", route);
route();

// for the smoke test
window.__ccna = { get current() { return current; }, LABS, checkLab };
