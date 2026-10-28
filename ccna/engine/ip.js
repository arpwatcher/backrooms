// IPv4 and IPv6 helpers for the lab engine. Plain integer maths, no
// libraries; kept free of the DOM so the tests run in node.

export function parseIp(text) {
  if (typeof text !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return null;
  const parts = text.split(".").map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function ipText(n) {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

// a mask is contiguous ones then zeros; returns its prefix length or -1
export function maskBits(text) {
  const n = parseIp(text);
  if (n === null) return -1;
  const inv = (~n) >>> 0;
  if (((inv + 1) & inv) !== 0) return -1;
  let bits = 0;
  for (let m = n; m & 0x80000000; m = (m << 1) >>> 0) bits++;
  return bits;
}

export function bitsMask(bits) {
  return ipText(bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0);
}

// wildcard masks: contiguous zeros then ones (the inverse of a mask)
export function wildcardBits(text) {
  const n = parseIp(text);
  if (n === null) return -1;
  return maskBits(ipText((~n) >>> 0));
}

export function network(ip, bits) {
  const n = parseIp(ip);
  const m = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ipText((n & m) >>> 0);
}

export function broadcast(ip, bits) {
  const n = parseIp(ip);
  const m = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ipText(((n & m) | (~m >>> 0)) >>> 0);
}

export function sameSubnet(a, b, bits) {
  return network(a, bits) === network(b, bits);
}

export function inPrefix(ip, net, bits) {
  return network(ip, bits) === network(net, bits);
}

// does "net wildcard" (as in an ACL or an OSPF network statement) match ip?
export function wildcardMatch(ip, net, wild) {
  const a = parseIp(ip), n = parseIp(net), w = parseIp(wild);
  if (a === null || n === null || w === null) return false;
  return ((a & ~w) >>> 0) === ((n & ~w) >>> 0);
}

export function isMac(text) {
  return /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(text);
}

// IPv6: expand to 8 groups of 4 hex digits, lower case; null if invalid
export function expandIpv6(text) {
  if (typeof text !== "string" || !/^[0-9a-fA-F:]+$/.test(text) || text.includes(":::")) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.toLowerCase().padStart(4, "0")).join(":");
}

// the short form IOS prints: leading zeros dropped, the longest run of zero
// groups (two or more) as ::
export function compressIpv6(text) {
  const full = expandIpv6(text);
  if (!full) return text;
  const groups = full.split(":").map((g) => g.replace(/^0+(?=.)/, ""));
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8; i++) {
    let j = i;
    while (j < 8 && groups[j] === "0") j++;
    if (j - i > bestLen && j - i > 1) [best, bestLen] = [i, j - i];
    i = Math.max(i, j);
  }
  if (best < 0) return groups.join(":").toUpperCase();
  const head = groups.slice(0, best).join(":");
  const tail = groups.slice(best + bestLen).join(":");
  return `${head}::${tail}`.toUpperCase();
}

// "2001:db8:1::1/64" -> { addr, bits } or null
export function parseIpv6Prefix(text) {
  const m = /^([0-9a-fA-F:]+)\/(\d{1,3})$/.exec(text ?? "");
  if (!m || Number(m[2]) > 128 || !expandIpv6(m[1])) return null;
  return { addr: expandIpv6(m[1]), bits: Number(m[2]) };
}

export function ipv6Network(addr, bits) {
  const full = expandIpv6(addr);
  if (!full) return null;
  const hex = full.replace(/:/g, "");
  let bin = [...hex].map((h) => parseInt(h, 16).toString(2).padStart(4, "0")).join("");
  bin = bin.slice(0, bits).padEnd(128, "0");
  const out = [];
  for (let i = 0; i < 128; i += 16) out.push(parseInt(bin.slice(i, i + 16), 2).toString(16).padStart(4, "0"));
  return out.join(":");
}

// EUI-64 interface id from a MAC (aaaa.bbbb.cccc): flip the 7th bit, put
// fffe in the middle
export function eui64(prefixAddr, mac) {
  const hex = mac.replace(/\./g, "").toLowerCase();
  const first = (parseInt(hex.slice(0, 2), 16) ^ 0x02).toString(16).padStart(2, "0");
  const id = first + hex.slice(2, 6) + "fffe" + hex.slice(6);
  const net = expandIpv6(prefixAddr).split(":").slice(0, 4);
  const tail = [id.slice(0, 4), id.slice(4, 8), id.slice(8, 12), id.slice(12, 16)];
  return [...net, ...tail].join(":");
}
