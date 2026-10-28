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
