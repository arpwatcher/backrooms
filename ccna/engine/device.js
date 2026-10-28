// One simulated Cisco device: its configuration as data, the mode it is in,
// and exec(line), which takes a typed line and returns what IOS would print.
// Nothing here forwards packets; the labs check the configuration itself.

import { match } from "./parse.js";
import { COMMANDS, setFreshMaker } from "./commands.js";
import { IosError, createDevice } from "./state.js";
import { hostExec, hostPrompt, hostComplete } from "./host.js";

export { createDevice } from "./state.js";

setFreshMaker(createDevice);

// show ... | include / exclude / begin / section
function filter(out, how, pattern) {
  let re;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  const lines = out.split("\n");
  if (how === "include") return lines.filter((l) => re.test(l)).join("\n");
  if (how === "exclude") return lines.filter((l) => !re.test(l)).join("\n");
  if (how === "begin") {
    const at = lines.findIndex((l) => re.test(l));
    return at < 0 ? "" : lines.slice(at).join("\n");
  }
  // section: a matching top-level line and the indented lines under it
  const keep = [];
  let inside = false;
  for (const l of lines) {
    if (!/^\s/.test(l)) inside = re.test(l);
    if (inside) keep.push(l);
  }
  return keep.join("\n");
}
const PIPE = /^(.*?\S)\s*\|\s*(i|in|inc|incl|inclu|includ|include|e|ex|exc|excl|exclu|exclud|exclude|b|be|beg|begi|begin|s|se|sec|sect|secti|sectio|section)\s+(.+)$/i;
const PIPE_KIND = (w) => ({ i: "include", e: "exclude", b: "begin", s: "section" })[w[0].toLowerCase()];

// --- prompts -------------------------------------------------------------------

const SUFFIX = {
  user: ">", priv: "#", config: "(config)#", if: "(config-if)#", subif: "(config-subif)#", range: "(config-if-range)#",
  line: "(config-line)#", router: "(config-router)#", vlan: "(config-vlan)#", dhcp: "(dhcp-config)#",
  "acl-std": "(config-std-nacl)#", "acl-ext": "(config-ext-nacl)#",
};

export function prompt(dev) {
  if (dev.host) return hostPrompt(dev);
  if (dev.pending?.prompt) return dev.pending.prompt;
  return dev.hostname + SUFFIX[dev.mode];
}

export const CONFIG_MODES = ["config", "if", "subif", "range", "line", "router", "vlan", "dhcp", "acl-std", "acl-ext"];

// --- running a line ----------------------------------------------------------------

function caret(dev, res, line) {
  if (res.error === "ambiguous") return `% Ambiguous command:  "${line.trim()}"`;
  if (res.error === "incomplete") return "% Incomplete command.";
  return `${" ".repeat(prompt(dev).length + res.at)}^\n% Invalid input detected at '^' marker.`;
}

function commandsFor(dev, mode) {
  return COMMANDS[mode].filter((c) => !c.only || c.only.includes(dev.type));
}

function run(dev, mode, res, line) {
  const words = new Set(res.words);
  const out = [];
  const ctx = {
    dev, args: res.args, words: res.words, line,
    has: (w) => words.has(w),
    no: res.words[0] === "no",
    say: (text) => out.push(text),
    mode: (m, c = {}) => {
      dev.mode = m;
      dev.ctx = c;
    },
    ask: (pending) => {
      dev.pending = pending;
    },
    // an error pointing at a place in the line, like IOS's ^ marker
    invalidAt: (at) => new IosError(`${" ".repeat(prompt(dev).length + at)}^\n% Invalid input detected at '^' marker.`),
  };
  res.command.run(ctx);
  dev.ran.push({ mode, text: res.canonical });
  return out.join("\n");
}

// try a line in a mode; returns { res } or { err }
function attempt(dev, mode, line) {
  const res = match(commandsFor(dev, mode), line);
  return res;
}

export function exec(dev, raw) {
  if (dev.host) return hostExec(dev, raw);
  const piped = PIPE.exec(raw);
  if (piped && !dev.pending && /^\s*(do\s+)?sh/i.test(piped[1])) {
    const out = execLine(dev, piped[1]);
    // an error is printed as it is
    if (/% (Invalid|Incomplete|Ambiguous)/.test(out)) return out;
    dev.history[dev.history.length - 1] = raw;
    return filter(out, PIPE_KIND(piped[2]), piped[3].trim());
  }
  return execLine(dev, raw);
}

function execLine(dev, raw) {
  const line = raw.replace(/\t/g, " ");
  // a question asked by the last command (a password, banner text, yes/no)
  if (dev.pending) {
    const pending = dev.pending;
    dev.pending = null;
    return pending.answer(line, dev) ?? "";
  }
  if (!line.trim()) return "";
  dev.history.push(line);
  // ctrl-z / end from any config mode
  if (/^\s*\^z\s*$/i.test(line)) return leaveConfig(dev);
  const mode = dev.mode;
  // do <exec command> from config modes
  const doMatch = /^\s*do\s+(.+)$/i.exec(line);
  if (CONFIG_MODES.includes(mode) && doMatch) {
    const saved = { mode: dev.mode, ctx: dev.ctx };
    dev.mode = "priv";
    let out;
    try {
      const res = attempt(dev, "priv", doMatch[1]);
      out = res.ok ? run(dev, "priv", res, doMatch[1]) : caret(dev, { ...res, at: res.at + line.indexOf(doMatch[1]) }, line);
    } catch (e) {
      if (!(e instanceof IosError)) throw e;
      out = e.message;
    }
    if (dev.mode === "priv") Object.assign(dev, saved);
    return out;
  }
  let res = attempt(dev, mode, line);
  let used = mode;
  // in a sub-mode, a global command works too, and leaves the sub-mode
  if (!res.ok && CONFIG_MODES.includes(mode) && mode !== "config") {
    const global = attempt(dev, "config", line);
    if (global.ok) {
      dev.mode = "config";
      dev.ctx = {};
      res = global;
      used = "config";
    }
  }
  if (!res.ok) return caret(dev, res, line);
  try {
    return run(dev, used, res, line);
  } catch (e) {
    if (!(e instanceof IosError)) throw e;
    return e.message;
  }
}

export function leaveConfig(dev) {
  if (!CONFIG_MODES.includes(dev.mode)) return "";
  dev.mode = "priv";
  dev.ctx = {};
  return "%SYS-5-CONFIG_I: Configured from console by console";
}

// a copy of the configuration, for startup-config and reload
const RUNTIME = new Set(["saved", "history", "ran", "mode", "ctx", "pending", "debugs", "links", "lab", "gateway"]);
export function snapshot(dev) {
  const copy = {};
  for (const [k, v] of Object.entries(dev)) if (!RUNTIME.has(k)) copy[k] = structuredClone(v);
  return copy;
}

export function restore(dev, snap) {
  const fresh = createDevice({ name: dev.name, type: dev.type, ports: Object.keys(dev.interfaces).filter((n) => !/^(Loopback|Vlan|Port-channel)|\./.test(n)) });
  for (const [k, v] of Object.entries(snap ?? fresh)) if (!RUNTIME.has(k)) dev[k] = structuredClone(v);
  dev.mode = "user";
  dev.ctx = {};
}

// run a list of commands as setup (a lab's starting state), quietly; throws
// if one of them doesn't go in, so a broken lab is caught by the tests
export function apply(dev, lines) {
  const keep = { history: dev.history, ran: dev.ran };
  dev.history = [];
  dev.ran = [];
  for (const line of lines) {
    const before = dev.mode;
    const out = exec(dev, line);
    if (/^% |\n% |Invalid input|Incomplete|Ambiguous|Bad mask|overlaps|rejected/.test(out)) throw new Error(`setup "${line}" on ${dev.name} (${before}): ${out}`);
  }
  dev.history = keep.history;
  dev.ran = keep.ran;
  dev.mode = "user";
  dev.ctx = {};
}

// --- ? help and tab completion -------------------------------------------------------------

import { options as optionsFor, tokenize } from "./parse.js";
import { KEYWORD_HELP } from "./help.js";

function scope(dev, text) {
  const m = /^(\s*do\s+)(.*)$/i.exec(text);
  if (m && CONFIG_MODES.includes(dev.mode)) return { cmds: commandsFor(dev, "priv"), text: m[2] };
  let cmds = commandsFor(dev, dev.mode);
  if (CONFIG_MODES.includes(dev.mode) && dev.mode !== "config") cmds = [...cmds, ...commandsFor(dev, "config")];
  return { cmds, text };
}

// what "?" would list for the text typed so far
export function help(dev, typed) {
  if (dev.host) return null;
  const { cmds, text } = scope(dev, typed);
  const endsInSpace = /\s$/.test(text) || text === "";
  const tokens = tokenize(text);
  const before = endsInSpace ? text : text.slice(0, tokens.length ? tokens[tokens.length - 1].at : 0);
  const partial = endsInSpace ? "" : tokens[tokens.length - 1]?.text ?? "";
  const list = optionsFor(cmds, before, partial);
  if (!list) return "% Unrecognized command";
  if (!list.length) return endsInSpace ? "% Unrecognized command" : "% Unrecognized command";
  if (!endsInSpace) return list.map((o) => o.word).join("  ");
  const width = Math.max(...list.map((o) => o.word.length)) + 2;
  return list.map((o) => `  ${o.word.padEnd(width)}${o.kind === "lit" ? KEYWORD_HELP[o.word] ?? "" : o.kind === "cr" ? "" : o.help && !/^[a-z]+$/.test(o.help) ? o.help : ""}`).join("\n");
}

// tab: complete the last word if only one keyword fits
export function complete(dev, typed) {
  if (dev.host) return hostComplete(dev, typed);
  const { cmds, text } = scope(dev, typed);
  if (/\s$/.test(text) || !text.trim()) return typed;
  const tokens = tokenize(text);
  const last = tokens[tokens.length - 1];
  const list = (optionsFor(cmds, text.slice(0, last.at), last.text) ?? []).filter((o) => o.kind === "lit");
  if (list.length !== 1) return typed;
  return typed.slice(0, typed.length - last.text.length) + list[0].word + " ";
}
