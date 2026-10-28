// The command matcher. Commands are written as small patterns:
//
//   "ip route <net:ip> <mask:mask> (<via:ip> | <out:iface>) [<ad:num:1-255>]"
//
// literals, <name:type[:range]> placeholders, [optional] parts and
// (a | b) alternatives. Each pattern is expanded into its plain sequences
// once, and a typed line is matched against every sequence of the mode at
// the same time, a word at a time, the way IOS does: a word may be any
// unambiguous start of a keyword ("conf t", "sh ip int br"), an exact
// keyword wins, and a start that fits two keywords is ambiguous.

import { parseIp, expandIpv6, parseIpv6Prefix, isMac } from "./ip.js";
import { normalize, isTypeOnly, typeOf } from "./iface.js";

// --- patterns ----------------------------------------------------------------

function lex(pattern) {
  const out = [];
  const re = /\s*(<[^>]+>|\[|\]|\(|\)|\||[^\s[\]()|<]+)/g;
  let m;
  while ((m = re.exec(pattern))) out.push(m[1]);
  return out;
}

// parse into a tree, then expand the tree into flat sequences
function tree(tokens) {
  let i = 0;
  function seq(end) {
    const items = [];
    while (i < tokens.length && !end.includes(tokens[i])) items.push(item());
    return { t: "seq", items };
  }
  function item() {
    const tok = tokens[i++];
    if (tok === "[") {
      const inner = alts("]");
      i++;
      return { t: "opt", inner };
    }
    if (tok === "(") {
      const inner = alts(")");
      i++;
      return inner;
    }
    if (tok.startsWith("<")) {
      const [name, type = "word", range] = tok.slice(1, -1).split(":");
      const el = { t: "ph", name, type };
      if (range) {
        const [lo, hi] = range.split("-").map(Number);
        el.lo = lo;
        el.hi = hi;
      }
      return el;
    }
    return { t: "lit", word: tok.toLowerCase() };
  }
  function alts(close) {
    const options = [seq(["|", close])];
    while (tokens[i] === "|") {
      i++;
      options.push(seq(["|", close]));
    }
    return options.length === 1 ? options[0] : { t: "alt", options };
  }
  return seq([]);
}

function expand(node) {
  if (node.t === "lit" || node.t === "ph") return [[node]];
  if (node.t === "opt") return [[], ...expand(node.inner)];
  if (node.t === "alt") return node.options.flatMap(expand);
  // seq: cartesian product
  let acc = [[]];
  for (const item of node.items) {
    const next = [];
    for (const left of acc) for (const right of expand(item)) next.push([...left, ...right]);
    acc = next;
  }
  return acc;
}

export function compile(pattern) {
  return expand(tree(lex(pattern)));
}

// --- placeholders ------------------------------------------------------------

export const PLACEHOLDER_HELP = {
  word: "WORD", ip: "A.B.C.D", mask: "A.B.C.D", wild: "A.B.C.D", num: "<number>", iface: "Interface",
  rest: "LINE", vlist: "VLAN IDs (e.g. 10,20,30-35)", ipv6: "X:X:X:X::X", ipv6pfx: "X:X:X:X::X/<0-128>",
  mac: "H.H.H", hex: "0x0-0xFFFF", port: "<0-65535> or name",
};

const PORT_NAMES = { www: 80, http: 80, telnet: 23, ftp: 21, "ftp-data": 20, smtp: 25, domain: 53, pop3: 110, bootps: 67, bootpc: 68, tftp: 69, ntp: 123, snmp: 161, syslog: 514, https: 443, ssh: 22, isakmp: 500 };

function vlist(text, lo = 1, hi = 4094) {
  const out = [];
  for (const part of text.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
    if (a < lo || b > hi || b < a) return null;
    for (let v = a; v <= b; v++) out.push(v);
  }
  return out;
}

// value for a token, or undefined if it doesn't fit
function value(el, token) {
  switch (el.type) {
    case "word":
      return token;
    case "num": {
      if (!/^\d+$/.test(token)) return undefined;
      const n = Number(token);
      if (el.lo !== undefined && (n < el.lo || n > el.hi)) return undefined;
      return n;
    }
    case "ip":
    case "mask":
    case "wild":
      return parseIp(token) === null ? undefined : token;
    case "ipv6":
      return expandIpv6(token) ? token : undefined;
    case "ipv6pfx":
      return parseIpv6Prefix(token) ? token : undefined;
    case "vlist":
      return vlist(token, el.lo, el.hi) ?? undefined;
    case "mac":
      return isMac(token) ? token.toLowerCase() : undefined;
    case "hex":
      return /^0x[0-9a-f]{1,4}$/i.test(token) ? token.toLowerCase() : undefined;
    case "port":
      if (/^\d+$/.test(token) && Number(token) <= 65535) return Number(token);
      return PORT_NAMES[token.toLowerCase()];
    case "iface":
      return normalize(token) ?? undefined;
    default:
      return undefined;
  }
}

// --- tokens --------------------------------------------------------------------

export function tokenize(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) out.push({ text: m[0], at: m.index });
  return out;
}

// --- matching -------------------------------------------------------------------

// commands: [{ seqs, ...anything }]. Returns
//   { ok: true, command, args, words, canonical }
//   { ok: false, error: "invalid" | "ambiguous" | "incomplete", at }
export function match(commands, line) {
  const tokens = tokenize(line);
  if (!tokens.length) return { ok: false, error: "empty" };
  let states = [];
  for (const command of commands) for (const seq of command.seqs) states.push({ command, seq, pos: 0, args: {}, words: [], partial: null });
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    const low = tok.text.toLowerCase();
    const exact = [], prefix = [], holders = [];
    let done = false;
    for (const s of states) {
      // an interface type waiting for its number ("GigabitEthernet 0/0")
      if (s.partial) {
        const name = normalize(s.partial, tok.text);
        if (name) holders.push({ ...s, pos: s.pos + 1, partial: null, args: { ...s.args, [s.seq[s.pos].name]: name }, raw: [...(s.raw ?? []), name] });
        continue;
      }
      const el = s.seq[s.pos];
      if (!el) continue;
      if (el.t === "lit") {
        if (el.word === low) exact.push(s);
        else if (el.word.startsWith(low)) prefix.push(s);
        continue;
      }
      if (el.type === "rest") {
        const rest = line.slice(tok.at).replace(/\s+$/, "");
        holders.push({ ...s, pos: s.pos + 1, args: { ...s.args, [el.name]: rest }, rest: true, raw: [...(s.raw ?? []), rest] });
        done = true;
        continue;
      }
      const v = value(el, tok.text);
      if (v !== undefined) holders.push({ ...s, pos: s.pos + 1, args: { ...s.args, [el.name]: v }, raw: [...(s.raw ?? []), el.type === "iface" ? v : tok.text] });
      else if (el.type === "iface" && isTypeOnly(tok.text)) holders.push({ ...s, partial: typeOf(tok.text), partialText: tok.text });
    }
    let next;
    if (exact.length) {
      next = exact.map((s) => ({ ...s, pos: s.pos + 1, words: [...s.words, s.seq[s.pos].word], raw: [...(s.raw ?? []), s.seq[s.pos].word] }));
    } else if (prefix.length) {
      const words = new Set(prefix.map((s) => s.seq[s.pos].word));
      if (words.size > 1 && !holders.length) return { ok: false, error: "ambiguous", at: tok.at, token: tok.text, options: [...words].sort() };
      if (words.size > 1) next = holders;
      else next = prefix.map((s) => ({ ...s, pos: s.pos + 1, words: [...s.words, s.seq[s.pos].word], raw: [...(s.raw ?? []), s.seq[s.pos].word] }));
    } else {
      next = holders;
    }
    if (!next.length) return { ok: false, error: "invalid", at: tok.at };
    states = next;
    if (done && states.some((s) => s.rest)) {
      states = states.filter((s) => s.rest);
      break;
    }
  }
  const complete = states.filter((s) => !s.partial && s.pos === s.seq.length);
  if (!complete.length) return { ok: false, error: "incomplete", at: line.length };
  // the first registered command wins; within it, the shortest sequence
  const best = complete[0];
  return { ok: true, command: best.command, args: best.args, words: best.words, canonical: (best.raw ?? []).join(" ") };
}

// what may come next, for "?" help. `partial` is the word being typed (may be "")
export function options(commands, before, partial = "") {
  const prefixLine = before.trim();
  let states = [];
  for (const command of commands) for (const seq of command.seqs) states.push({ command, seq, pos: 0 });
  if (prefixLine) {
    // reuse the matcher a word at a time
    const tokens = tokenize(prefixLine);
    for (const tok of tokens) {
      const low = tok.text.toLowerCase();
      const exact = [], prefix = [], holders = [];
      for (const s of states) {
        if (s.partial) {
          if (normalize(s.partial, tok.text)) holders.push({ ...s, pos: s.pos + 1, partial: null });
          continue;
        }
        const el = s.seq[s.pos];
        if (!el) continue;
        if (el.t === "lit") {
          if (el.word === low) exact.push(s);
          else if (el.word.startsWith(low)) prefix.push(s);
        } else if (el.type === "rest") {
          holders.push({ ...s, restOpen: true });
        } else if (value(el, tok.text) !== undefined) holders.push({ ...s, pos: s.pos + 1 });
        else if (el.type === "iface" && isTypeOnly(tok.text)) holders.push({ ...s, partial: typeOf(tok.text) });
      }
      states = exact.length ? exact.map((s) => ({ ...s, pos: s.pos + 1 })) : prefix.length && new Set(prefix.map((s) => s.seq[s.pos].word)).size === 1 ? prefix.map((s) => ({ ...s, pos: s.pos + 1 })) : holders;
      if (!states.length) return null;
    }
  }
  const out = new Map();
  let cr = false;
  const low = partial.toLowerCase();
  for (const s of states) {
    if (s.restOpen) {
      out.set("LINE", { word: "LINE", kind: "ph", help: PLACEHOLDER_HELP.rest });
      continue;
    }
    if (s.partial) {
      out.set("<number>", { word: "<number>", kind: "ph", help: "Interface number" });
      continue;
    }
    const el = s.seq[s.pos];
    if (!el) {
      cr = true;
      continue;
    }
    if (el.t === "lit") {
      if (el.word.startsWith(low)) out.set(el.word, { word: el.word, kind: "lit", command: s.command });
    } else if (!low) {
      const label = el.type === "num" && el.lo !== undefined ? `<${el.lo}-${el.hi}>` : PLACEHOLDER_HELP[el.type] ?? el.type.toUpperCase();
      out.set(label, { word: label, kind: "ph", help: el.name });
    }
  }
  const list = [...out.values()].sort((a, b) => (a.kind === b.kind ? a.word.localeCompare(b.word) : a.kind === "lit" ? -1 : 1));
  if (cr && !low) list.push({ word: "<cr>", kind: "cr" });
  return list;
}
