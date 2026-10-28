// Interface names the way IOS takes them: any unambiguous start of the type
// ("g", "gi", "gig", "GigabitEthernet"), with or without a space before the
// number. Everything is stored under the full canonical name.

export const TYPES = [
  ["GigabitEthernet", "Gi"],
  ["FastEthernet", "Fa"],
  ["Ethernet", "Et"],
  ["Serial", "Se"],
  ["Loopback", "Lo"],
  ["Vlan", "Vl"],
  ["Port-channel", "Po"],
  ["Tunnel", "Tu"],
];

// which full type a typed prefix means (null if none or ambiguous); IOS
// reads a lone "e" as Ethernet, "t" as Tunnel and "p" as Port-channel
export function typeOf(prefix) {
  const p = prefix.toLowerCase();
  if (!p) return null;
  const hits = TYPES.filter(([full]) => full.toLowerCase().startsWith(p));
  if (hits.length === 1) return hits[0][0];
  // exact short forms that are otherwise ambiguous
  const exact = { e: "Ethernet", g: "GigabitEthernet", f: "FastEthernet", s: "Serial", l: "Loopback", v: "Vlan", p: "Port-channel", t: "Tunnel" };
  return exact[p] ?? null;
}

const NUMBER = /^\d+(\/\d+){0,2}(\.\d+)?$/;

// "g0/0" / "gi0/0.10" / "Vlan10" -> "GigabitEthernet0/0" etc., or null
export function normalize(text, number) {
  if (!text) return null;
  let type, num;
  if (number !== undefined) {
    type = typeOf(text);
    num = number;
  } else {
    const m = /^([a-zA-Z-]+)\s*(\S*)$/.exec(text);
    if (!m) return null;
    type = typeOf(m[1]);
    num = m[2];
  }
  if (!type || !NUMBER.test(num)) return null;
  return type + num;
}

// is this token only an interface type (waiting for its number)?
export function isTypeOnly(token) {
  return /^[a-zA-Z-]+$/.test(token) && typeOf(token) !== null;
}

export function short(name) {
  for (const [full, abbr] of TYPES) if (name.startsWith(full)) return abbr + name.slice(full.length);
  return name;
}

export function kind(name) {
  for (const [full] of TYPES) if (name.startsWith(full)) return full;
  return null;
}

export function isSub(name) {
  return /\.\d+$/.test(name);
}

export function parentOf(name) {
  return name.replace(/\.\d+$/, "");
}

// "fa0/1 - 5 , fa0/10" -> list of canonical names, or null
export function expandRange(text) {
  const out = [];
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-zA-Z-]+)\s*((?:\d+\/)*)(\d+)\s*(?:-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const type = typeOf(m[1]);
    if (!type) return null;
    const from = Number(m[3]);
    const to = m[4] === undefined ? from : Number(m[4]);
    if (to < from) return null;
    for (let i = from; i <= to; i++) out.push(`${type}${m[2]}${i}`);
  }
  return out.length ? out : null;
}

// sort interfaces like IOS lists them: by type order, then numerically
export function compare(a, b) {
  const ta = TYPES.findIndex(([f]) => a.startsWith(f));
  const tb = TYPES.findIndex(([f]) => b.startsWith(f));
  if (ta !== tb) return ta - tb;
  const na = a.replace(/^[A-Za-z-]+/, "").split(/[/.]/).map(Number);
  const nb = b.replace(/^[A-Za-z-]+/, "").split(/[/.]/).map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? -1) - (nb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}
