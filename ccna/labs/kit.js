// Small builders so each lab reads as its topology, tasks and answer.

export const cfg = (...lines) => ["enable", "configure terminal", ...lines, "end"];
export const EN = ["enable", "configure terminal"];

export const R = (name, x, y, setup = [], extra = {}) => ({ name, type: "router", x, y, setup, ...extra });
export const S = (name, x, y, setup = [], extra = {}) => ({ name, type: "switch", x, y, setup, ...extra });
export const L3 = (name, x, y, setup = [], extra = {}) => ({ name, type: "l3switch", x, y, setup, ...extra });
export const PC = (name, x, y, ip, gateway) => ({ name, type: "pc", x, y, ip, gateway });
export const SRV = (name, x, y, ip, gateway) => ({ name, type: "server", x, y, ip, gateway });
export const ISP = (name, x, y) => ({ name, type: "cloud", x, y });

// a lab is { id, module, title, kind, cmds, devices, links, intro, tasks,
// solution, teach }; this fills the usual defaults
export function lab(def) {
  return { kind: "micro", links: [], cmds: [], ...def };
}

// a check that fails with a message
export const need = (ok, msg) => (ok ? true : msg);

// a PC with a terminal: os is "windows", "linux" or "mac"; opts may hold ip
// ("a.b.c.d/nn"), gateway, dns [..], domain, dhcp, dhcpServer, mac
export const HOST = (name, x, y, os, opts = {}) => ({ name, type: "pc", x, y, os, ...opts });

// comparing what was typed in a task's answer box
const hex = (s) => {
  const groups = s.trim().toLowerCase().split(/[-:.]/);
  if (groups.length === 6) return groups.map((g) => g.padStart(2, "0")).join("");
  if (groups.length === 3) return groups.map((g) => g.padStart(4, "0")).join("");
  return s.toLowerCase().replace(/[^0-9a-f]/g, "");
};
const words = (s) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
export const is = {
  ip: (reply, want) => reply.trim() === want,
  mac: (reply, want) => hex(reply).length === 12 && hex(reply) === hex(want),
  text: (reply, ...wants) => wants.some((w) => words(reply) === words(w)),
  num: (reply, want) => Number(reply.trim()) === want,
  // "/24", "24" or "255.255.255.0"
  prefix: (reply, bits) => {
    const r = reply.trim().replace(/^\//, "");
    if (/^\d+$/.test(r)) return Number(r) === bits;
    const n = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return r === [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  },
};
