// The terminal of a PC: Windows (cmd), Linux (bash) or macOS (zsh), with the
// commands the CCNA asks about for checking a client's IP settings (1.10):
// ipconfig, ip addr, ifconfig, the routes, ARP, DNS, ping and traceroute.
// It reads the lab around it, so a ping or a DHCP renew only works when the
// network really allows it.

import { maskBits, network, parseIp, compressIpv6, eui64, wildcardMatch } from "./ip.js";
import { status, operMode, carries, hsrpRanking, aclAllows } from "./net.js";
import { routeTable } from "./show.js";

const OS_NAME = { windows: "Windows", linux: "Linux", mac: "macOS" };
export const osName = (os) => OS_NAME[os] ?? os;
const IFNAME = { windows: "Ethernet0", linux: "eth0", mac: "en0" };

// --- state -------------------------------------------------------------------------------------

// the lab definition of a PC with os: set gives it a host shell
export function makeHost(dev, d, def) {
  const f = Object.values(dev.interfaces)[0];
  const host = {
    os: d.os, user: d.user ?? "student", domain: d.domain ?? null, dns: d.dns ?? [], dhcp: Boolean(d.dhcp),
    gw: d.gateway ?? null, dhcpServer: null, records: def.records ?? {}, extern: def.extern ?? [], hops: def.hops ?? {},
    dnsCache: [], arp: [], leased: false, apipa: false,
  };
  dev.host = host;
  if (d.mac) dev.mac = d.mac;
  // a DHCP client starts with the lease it already holds, or with nothing
  if (host.dhcp) {
    if (d.ip) {
      host.leased = true;
      host.dhcpServer = d.dhcpServer ?? d.gateway ?? null;
    } else apipa(dev, f);
  }
  return host;
}

function own(dev) {
  return Object.values(dev.interfaces)[0];
}

function apipa(dev, f = own(dev)) {
  const h = dev.host;
  const n = parseInt(dev.mac.replace(/\./g, "").slice(-4), 16);
  f.ip = `169.254.${(n >> 8) % 254 + 1}.${(n & 255) % 254 + 1}`;
  f.mask = "255.255.0.0";
  h.gw = null;
  h.apipa = true;
  h.leased = false;
}

// every device and interface in the lab that owns this address
function owner(dev, ip) {
  for (const d of dev.lab?.all ?? []) {
    for (const f of Object.values(d.interfaces)) if (f.ip === ip && !f.shutdown) return { device: d, iface: f };
  }
  return null;
}

function linkUp(dev) {
  const f = own(dev);
  const end = dev.links[f.name];
  return Boolean(end && end.device.interfaces[end.iface] && !end.device.interfaces[end.iface].shutdown && !end.device.interfaces[end.iface].errdisabled);
}

const bitsOf = (dev) => maskBits(own(dev).mask);
const local = (dev, ip) => own(dev).ip && network(ip, bitsOf(dev)) === network(own(dev).ip, bitsOf(dev));

// --- layer 2: what this PC's frames reach -----------------------------------------------------

const isSwitch = (d) => d.type === "switch" || d.type === "l3switch";
// a member of an EtherChannel switches as its port-channel does
const asSwitched = (d, f) => (f.channel ? d.interfaces[`Port-channel${f.channel.group}`] ?? f : f);

// every layer 3 interface in this PC's broadcast domain: frames go out
// untagged, into the access VLAN (or the native VLAN of a trunk), across
// every switch port that carries that VLAN, tagged where a trunk tags it, and
// stop at hosts, routed ports, router (sub)interfaces and SVIs of the VLAN
export function segment(dev) {
  const start = dev.links[own(dev).name];
  if (!start) return [];
  const found = [];
  const seen = new Set();
  const flood = (sw, vlan) => {
    const key = `${sw.name}:${vlan}`;
    if (seen.has(key)) return;
    seen.add(key);
    const svi = sw.interfaces[`Vlan${vlan}`];
    if (svi?.ip && !svi.shutdown) found.push({ device: sw, iface: svi });
    for (const q of Object.values(sw.interfaces)) {
      const link = sw.links[q.name];
      if (!link || !q.switchport || q.errdisabled || status(sw, q)[0] !== "up") continue;
      const eff = asSwitched(sw, q);
      if (!carries(sw, eff, vlan)) continue;
      const tagged = operMode(sw, eff) === "trunk" && vlan !== eff.nativeVlan;
      arrive(link.device, link.device.interfaces[link.iface], vlan, tagged);
    }
  };
  const arrive = (d, f, vlan, tagged) => {
    if (!f || f.shutdown || f.errdisabled) return;
    if (isSwitch(d) && f.switchport) {
      const eff = asSwitched(d, f);
      const mode = operMode(d, eff);
      if (mode === "trunk") {
        if (!tagged) return flood(d, eff.nativeVlan);
        if (carries(d, eff, vlan)) flood(d, vlan);
        return;
      }
      if (!tagged) flood(d, eff.accessVlan);
      return;
    }
    if (d.type === "pc" || d.type === "server" || d.type === "cloud") {
      if (!tagged) found.push({ device: d, iface: f });
      return;
    }
    // a router or a routed port: the interface itself for untagged frames,
    // or the subinterface for the frame's VLAN
    for (const s of Object.values(d.interfaces)) {
      const mine = s === f || s.name.startsWith(`${f.name}.`);
      if (!mine || s.shutdown || !s.ip) continue;
      const enc = s.encap;
      if (tagged ? enc?.vlan === vlan && !enc.native : s === f ? !enc : enc?.native) found.push({ device: d, iface: s });
    }
  };
  arrive(start.device, start.device.interfaces[start.iface], null, false);
  return found;
}

// the addresses answering on this PC's segment, with the HSRP virtual IP on
// the active router
function neighbors(dev) {
  const out = [];
  for (const { device, iface } of segment(dev)) {
    out.push({ ip: iface.ip, device, iface, mac: device.mac });
    for (const [g, grp] of Object.entries(iface.hsrp?.groups ?? {})) {
      if (!grp.ip) continue;
      const active = hsrpRanking(device, grp.ip, device.lab?.all ?? [device])[0];
      if (active?.device === device && active.iface === iface) out.push({ ip: grp.ip, device, iface, mac: (iface.hsrp.version === 2 ? "0000.0c9f.f" + Number(g).toString(16).padStart(3, "0") : "0000.0c07.ac" + Number(g).toString(16).padStart(2, "0")) });
    }
  }
  return out;
}
const onSegment = (dev, ip) => neighbors(dev).find((n) => n.ip === ip) ?? null;

function learnArp(dev, ip) {
  const n = onSegment(dev, ip);
  if (!n || dev.host.arp.some((a) => a.ip === ip)) return;
  dev.host.arp.push({ ip, mac: n.mac });
}

// --- layer 3: hop by hop through the routers' tables --------------------------------------------

const ROUTER = (d) => d.type === "router" || (d.type === "l3switch" && d.ipRouting);
const ownsIp = (d, ip) => Object.values(d.interfaces).some((f) => f.ip === ip && status(d, f)[1] === "up");

// from a router, the addresses a packet for ip passes (each next router's
// ingress address), ending at ip; null when some router has no route, or
// the last subnet has no such host. With a packet, the ACLs on the way are
// checked too: inbound where it arrives (inIf), outbound where it leaves,
// except on the router that sent it (pkt.from)
function pathFrom(router, ip, seen = new Set(), pkt = null, inIf = null) {
  if (pkt && inIf?.aclIn && !aclAllows(router, inIf.aclIn, pkt)) return null;
  if (ownsIp(router, ip)) return [];
  if (seen.has(router) || seen.size > 15) return null;
  seen.add(router);
  const best = routeTable(router).filter((r) => r.code !== "L" && network(ip, r.bits) === r.net).sort((a, b) => b.bits - a.bits)[0];
  if (!best) return null;
  const exit = exitOf(router, best, ip);
  if (pkt && pkt.from !== router && exit?.aclOut && !aclAllows(router, exit.aclOut, pkt)) return null;
  if (best.code === "C") {
    const o = owner(router, ip);
    return o || router.lab?.extern?.includes(ip) ? [ip] : null;
  }
  // next hop, or the far end of the exit interface
  let next = best.via;
  if (!next && best.out) {
    const end = router.links[best.out];
    next = end && Object.values(end.device.interfaces).find((f) => f.ip && f.name === end.iface)?.ip;
  }
  const o = next && owner(router, next);
  if (!o) {
    if (isExternal(router, best)) return (seen.exit = router), [ip];
    return router.lab?.extern?.includes(ip) ? [ip] : null;
  }
  if (!ROUTER(o.device)) return null;
  const rest = pathFrom(o.device, ip, seen, pkt, o.iface);
  if (rest === null) return null;
  // the router that owns ip answers from ip itself
  return ownsIp(o.device, ip) ? [ip] : [next, ...rest];
}
// a ping or traceroute typed on a router: the hops to ip, whether a reply
// comes back to the address it was sent from (the exit interface's), and
// the first hop it has to ARP for; null when the lab has no other devices
export function fromRouter(router, ip) {
  if (!router.lab?.all) return null;
  if (ownsIp(router, ip)) return { ok: true, hops: [ip], arp: null };
  const best = routeTable(router).filter((r) => r.code !== "L" && network(ip, r.bits) === r.net).sort((a, b) => b.bits - a.bits)[0];
  if (!best) return { ok: false, hops: [], arp: null, noRoute: true };
  const first = best.code === "C" ? ip : best.via;
  const exit = best.out ?? Object.values(router.interfaces).find((f) => f.ip && f.mask && first && network(first, maskBits(f.mask)) === network(f.ip, maskBits(f.mask)))?.name;
  const src = router.interfaces[exit]?.ip;
  const seen = new Set();
  const path = pathFrom(router, ip, seen, echo(src, ip, router));
  if (path === null) return { ok: false, hops: partial(router, ip, src), arp: first };
  if (seen.exit) return { ok: true, hops: path, arp: first };
  const o = owner(router, ip);
  const target = o?.device;
  let ok = true;
  if (target && src) {
    // the reply: a router answers from its routing table, a host or a
    // switch through its gateway unless the source is on its own subnet
    const f = o.iface;
    const near = f.mask && network(src, maskBits(f.mask)) === network(f.ip, maskBits(f.mask));
    const reply = echoReply(ip, src);
    if (ROUTER(target)) ok = pathFrom(target, src, new Set(), { ...reply, from: target }) !== null;
    else if (near) ok = !router.interfaces[exit]?.aclIn || aclAllows(router, router.interfaces[exit].aclIn, reply);
    else {
      const gw = target.host ? onSegment(target, target.host.gw) : target.defaultGateway && owner(router, target.defaultGateway);
      ok = Boolean(gw && ROUTER(gw.device) && pathFrom(gw.device, src, new Set(), reply, gw.iface) !== null);
    }
  }
  return { ok, hops: ok ? path : partial(router, ip, src), arp: first };
}
// the hops a traceroute still gets answers from before the path breaks: each
// router on the way answers only if it has a route back to the source
function partial(router, ip, src) {
  const out = [];
  let r = router;
  const seen = new Set();
  while (r && !seen.has(r) && out.length < 15) {
    seen.add(r);
    const best = routeTable(r).filter((x) => x.code !== "L" && network(ip, x.bits) === x.net).sort((a, b) => b.bits - a.bits)[0];
    if (!best || best.code === "C" || !best.via) break;
    const o = owner(r, best.via);
    if (!o || !ROUTER(o.device) || (src && pathFrom(o.device, src) === null)) break;
    out.push(best.via);
    r = o.device;
  }
  return out;
}

// the interface a route leaves by
function exitOf(router, route, ip) {
  if (route.out) return router.interfaces[route.out];
  const hop = route.via ?? ip;
  return Object.values(router.interfaces).find((f) => f.ip && f.mask && network(hop, maskBits(f.mask)) === network(f.ip, maskBits(f.mask)) && status(router, f)[1] === "up");
}
const echo = (src, dst, from) => ({ proto: "icmp", icmp: "echo", src, dst, from });
const echoReply = (src, dst, from) => ({ proto: "icmp", icmp: "echo-reply", src, dst, from });

// a route that leaves the drawn network: out an interface, or to a next hop
// on a subnet, that faces an ISP cloud
function isExternal(router, route) {
  const exit = route.out ?? Object.values(router.interfaces).find((f) => f.ip && f.mask && route.via && network(route.via, maskBits(f.mask)) === network(f.ip, maskBits(f.mask)))?.name;
  const end = exit && router.links[exit];
  return end?.device.type === "cloud";
}

const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
// does this router translate this inside address: an inside and an outside
// interface, and a static entry or a dynamic rule whose ACL permits it
function natted(router, ip) {
  const ifs = Object.values(router.interfaces);
  if (!ifs.some((f) => f.nat === "inside") || !ifs.some((f) => f.nat === "outside")) return false;
  if (router.nat.statics.some((s) => s.local === ip && !s.proto)) return true;
  return router.nat.dynamic.some((d) => aclPermits(router.acls[d.acl], ip));
}
// a ping that went out through NAT leaves an icmp translation on the router,
// as show ip nat translations lists it (one per inside host and target)
// the inside global address the router would give an inside host, or null
function natGlobal(router, local) {
  if (!natted(router, local)) return null;
  const nat = router.nat;
  const st = nat.statics.find((s) => s.local === local && !s.proto);
  if (st) return st.global;
  const rule = nat.dynamic.find((d) => aclPermits(router.acls[d.acl], local));
  if (rule?.out) return router.interfaces[rule.out]?.ip ?? null;
  const p = rule?.pool && nat.pools[rule.pool];
  if (!p) return null;
  const live = nat.live ?? [];
  const used = live.filter((t) => t.pool === rule.pool && !t.overload && t.local !== local).map((t) => t.global);
  return range(p.start, p.end).find((a) => rule.overload || !used.includes(a)) ?? null;
}
function translate(router, local, target) {
  const nat = router.nat;
  const st = nat.statics.find((s) => s.local === local && !s.proto);
  const rule = !st && nat.dynamic.find((d) => aclPermits(router.acls[d.acl], local));
  nat.live ??= [];
  if (nat.live.some((t) => t.local === local && t.target === target)) return;
  const global = natGlobal(router, local);
  if (!global) return;
  const id = nat.live.filter((t) => t.global === global).length + 1;
  nat.live.push({ local, target, global, id, pool: rule?.pool ?? null, overload: Boolean(rule?.overload), dynamic: !st });
}
const range = (start, end) => {
  const out = [];
  for (let n = parseIp(start); n !== null && n <= parseIp(end) && out.length < 256; n++) out.push([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
  return out;
};
function aclPermits(acl, ip) {
  for (const e of acl?.entries ?? []) {
    const s = e.src;
    const hit = s.any || (s.host ? s.host === ip : wildcardMatch(ip, s.net, s.wild));
    if (hit) return e.action === "permit";
  }
  return false;
}

// the router a host's gateway address belongs to
function gatewayRouter(dev) {
  const gw = dev.host?.gw ?? dev.gateway;
  const n = gw && (dev.host ? onSegment(dev, gw) : null);
  return n && ROUTER(n.device) ? n.device : null;
}

// for the labs' checks: does this PC get to ip and back
export const canReach = (dev, ip) => reaches(dev, ip);

// does a packet from this PC get to ip and back (a real ping also leaves
// its NAT translation behind)
function reaches(dev, ip, ping = false) {
  const f = own(dev);
  if (ip === "127.0.0.1") return true;
  if (!f.ip || !linkUp(dev)) return false;
  if (local(dev, ip)) {
    if (!onSegment(dev, ip)) return false;
    learnArp(dev, ip);
    return true;
  }
  if (dev.host.apipa) return false;
  const gw = dev.host.gw;
  if (!gw || !local(dev, gw) || !onSegment(dev, gw)) return false;
  learnArp(dev, gw);
  const gwIf = onSegment(dev, gw).iface;
  if (dev.host.extern.includes(ip) && !(dev.lab?.all ?? []).some((d) => ownsIp(d, ip))) {
    const r = gatewayRouter(dev);
    const seen = new Set();
    if (!r || pathFrom(r, ip, seen, echo(f.ip, ip), gwIf) === null) return false;
    if (!seen.exit) return true;
    // out to the Internet, a private source needs NAT on the way out
    const global = isPrivate(f.ip) ? natGlobal(seen.exit, f.ip) : f.ip;
    if (!global) return false;
    // the reply comes in on the outside interface, still to the global
    // address, and is routed back in once translated
    const outside = exitOf(seen.exit, routeTable(seen.exit).filter((x) => x.code !== "L" && network(ip, x.bits) === x.net).sort((a, b) => b.bits - a.bits)[0] ?? {}, ip);
    if (outside?.aclIn && !aclAllows(seen.exit, outside.aclIn, echoReply(ip, global))) return false;
    if (pathFrom(seen.exit, f.ip, new Set(), echoReply(ip, f.ip)) === null) return false;
    if (ping && global !== f.ip) translate(seen.exit, f.ip, ip);
    return true;
  }
  const r = gatewayRouter(dev);
  if (!r || pathFrom(r, ip, new Set(), echo(f.ip, ip), gwIf) === null) return false;
  // and back: from the router that answers, or from the target's own gateway
  const o = owner(dev, ip);
  const target = o?.device;
  const reply = echoReply(ip, f.ip);
  if (!target || ROUTER(target)) {
    const from = target ?? r;
    return pathFrom(from, f.ip, new Set(), { ...reply, from }) !== null;
  }
  const back = target.host ? onSegment(target, target.host.gw) : target.gateway && owner(dev, target.gateway);
  return Boolean(back && ROUTER(back.device) && pathFrom(back.device, f.ip, new Set(), reply, back.iface) !== null);
}

// a name through the PC's DNS servers (the lab's records stand in for them)
function lookup(dev, name) {
  const h = dev.host;
  if (parseIp(name) !== null) return { ip: name };
  const full = name.includes(".") || !h.domain ? name.toLowerCase() : `${name}.${h.domain}`.toLowerCase();
  const cached = h.dnsCache.find((c) => c.name === full);
  if (cached) return { ip: cached.ip, name: full };
  if (!h.dns.length || !h.dns.some((s) => reaches(dev, s))) return { error: "noserver", name: full };
  const ip = h.records[full] ?? h.records[name.toLowerCase()];
  if (!ip) return { error: "nxdomain", name: full };
  h.dnsCache.push({ name: full, ip });
  return { ip, name: full };
}

// --- formatting --------------------------------------------------------------------------------

const hexes = (mac) => mac.replace(/\./g, "").toLowerCase().match(/../g);
const macWin = (mac) => hexes(mac).join("-").toUpperCase();
const macArpWin = (mac) => hexes(mac).join("-");
const macLinux = (mac) => hexes(mac).join(":");
const macMacShort = (mac) => hexes(mac).map((x) => x.replace(/^0/, "")).join(":");
const linkLocal = (dev) => compressIpv6(eui64("fe80::", dev.mac)).toLowerCase();
const hexMask = (mask) => "0x" + mask.split(".").map((o) => Number(o).toString(16).padStart(2, "0")).join("");
const broadcastOf = (ip, mask) => ip.split(".").map((o, i) => (Number(o) | (~Number(mask.split(".")[i]) & 255))).join(".");
// ipconfig's labels, dotted out exactly as Windows prints them
const WIN = {
  "Host Name": "Host Name . . . . . . . . . . . .",
  "Primary Dns Suffix": "Primary Dns Suffix  . . . . . . .",
  "Node Type": "Node Type . . . . . . . . . . . .",
  "IP Routing Enabled": "IP Routing Enabled. . . . . . . .",
  "WINS Proxy Enabled": "WINS Proxy Enabled. . . . . . . .",
  "DNS Suffix Search List": "DNS Suffix Search List. . . . . .",
  "Media State": "Media State . . . . . . . . . . .",
  "Connection-specific DNS Suffix": "Connection-specific DNS Suffix  .",
  "Description": "Description . . . . . . . . . . .",
  "Physical Address": "Physical Address. . . . . . . . .",
  "DHCP Enabled": "DHCP Enabled. . . . . . . . . . .",
  "Autoconfiguration Enabled": "Autoconfiguration Enabled . . . .",
  "Link-local IPv6 Address": "Link-local IPv6 Address . . . . .",
  "IPv4 Address": "IPv4 Address. . . . . . . . . . .",
  "Autoconfiguration IPv4 Address": "Autoconfiguration IPv4 Address. .",
  "Subnet Mask": "Subnet Mask . . . . . . . . . . .",
  "Lease Obtained": "Lease Obtained. . . . . . . . . .",
  "Lease Expires": "Lease Expires . . . . . . . . . .",
  "Default Gateway": "Default Gateway . . . . . . . . .",
  "DHCP Server": "DHCP Server . . . . . . . . . . .",
  "DNS Servers": "DNS Servers . . . . . . . . . . .",
  "NetBIOS over Tcpip": "NetBIOS over Tcpip. . . . . . . .",
};
const winLine = (label, value) => `   ${WIN[label]} : ${value}`;

// --- windows ------------------------------------------------------------------------------------

function ipconfigWin(dev, all) {
  const h = dev.host, f = own(dev);
  const out = ["", "Windows IP Configuration", ""];
  if (all) {
    out.push(winLine("Host Name", dev.hostname), winLine("Primary Dns Suffix", ""), winLine("Node Type", "Hybrid"), winLine("IP Routing Enabled", "No"), winLine("WINS Proxy Enabled", "No"));
    if (h.domain) out.push(winLine("DNS Suffix Search List", h.domain));
  }
  out.push("", `Ethernet adapter ${IFNAME.windows}:`, "");
  if (!linkUp(dev)) {
    out.push(winLine("Media State", "Media disconnected"), winLine("Connection-specific DNS Suffix", ""));
    if (all) out.push(winLine("Description", "Intel(R) Ethernet Connection I219-LM"), winLine("Physical Address", macWin(dev.mac)), winLine("DHCP Enabled", h.dhcp ? "Yes" : "No"), winLine("Autoconfiguration Enabled", "Yes"));
    return out.join("\n");
  }
  out.push(winLine("Connection-specific DNS Suffix", h.leased || !h.dhcp ? h.domain ?? "" : ""));
  if (all) out.push(winLine("Description", "Intel(R) Ethernet Connection I219-LM"), winLine("Physical Address", macWin(dev.mac)), winLine("DHCP Enabled", h.dhcp ? "Yes" : "No"), winLine("Autoconfiguration Enabled", "Yes"));
  const pref = all ? "(Preferred)" : "";
  out.push(winLine("Link-local IPv6 Address", `${linkLocal(dev)}%12${pref}`));
  if (f.ip) {
    out.push(winLine(h.apipa ? "Autoconfiguration IPv4 Address" : "IPv4 Address", f.ip + pref), winLine("Subnet Mask", f.mask));
    if (all && h.leased) out.push(winLine("Lease Obtained", "Monday, March 2, 2026 9:14:03 AM"), winLine("Lease Expires", "Tuesday, March 3, 2026 9:14:03 AM"));
  }
  out.push(winLine("Default Gateway", h.gw ?? ""));
  if (all) {
    if (h.leased) out.push(winLine("DHCP Server", h.dhcpServer ?? ""));
    if (h.dns.length) out.push(winLine("DNS Servers", h.dns[0]), ...h.dns.slice(1).map((s) => " ".repeat(39) + s));
    else out.push(winLine("DNS Servers", "fec0:0:0:ffff::1%1"), " ".repeat(39) + "fec0:0:0:ffff::2%1");
    out.push(winLine("NetBIOS over Tcpip", "Enabled"));
  }
  return out.join("\n");
}

function release(dev) {
  const h = dev.host, f = own(dev);
  if (!h.dhcp) return "\nWindows IP Configuration\n\nThe operation failed as no adapter is in the state permissible for\nthis operation.";
  h.lastIp = f.ip ?? h.lastIp;
  dropLease(dev);
  f.ip = null;
  f.mask = null;
  h.gw = null;
  h.leased = false;
  h.apipa = false;
  h.saveDns = h.dns.length ? h.dns : h.saveDns;
  h.dns = [];
  return ["", "Windows IP Configuration", "", "", `Ethernet adapter ${IFNAME.windows}:`, "", winLine("Connection-specific DNS Suffix", ""), winLine("Link-local IPv6 Address", `${linkLocal(dev)}%12`), winLine("Default Gateway", "")].join("\n");
}

// a DHCP server for this PC: a router on its segment with a pool for it, or
// with an ip helper-address that leads to one
export function dhcpOffer(dev) {
  if (!linkUp(dev)) return null;
  const poolFor = (d, gwIf) => Object.values(d.dhcp?.pools ?? {}).find((p) => p.network && gwIf.ip && network(gwIf.ip, maskBits(p.mask)) === p.network);
  // a Discover is a broadcast from 0.0.0.0, and an inbound ACL on the
  // router's interface sees it like any other packet
  const discover = { proto: "udp", src: "0.0.0.0", dst: "255.255.255.255", sport: 68, dport: 67 };
  for (const { device, iface } of segment(dev)) {
    if (["pc", "server", "cloud"].includes(device.type)) continue;
    if (iface.aclIn && !aclAllows(device, iface.aclIn, discover)) continue;
    const local = poolFor(device, iface);
    if (local) return { pool: local, server: iface.ip, gw: iface, from: device };
    // a relay: the server must have a pool for the relay's subnet (giaddr),
    // the relay a route to the server, and the server a route back to the
    // giaddr, where it sends the Offer
    for (const helper of iface.helpers ?? []) {
      const o = owner(dev, helper);
      const p = o && poolFor(o.device, iface);
      if (!p) continue;
      if (ownsIp(device, helper) || (pathFrom(device, helper) !== null && pathFrom(o.device, iface.ip) !== null)) return { pool: p, server: helper, gw: iface, from: o.device };
    }
  }
  return null;
}

const dropLease = (dev) => {
  for (const d of dev.lab?.all ?? []) if (d.dhcp?.leases) d.dhcp.leases = d.dhcp.leases.filter((l) => l.mac !== dev.mac);
};
function renew(dev) {
  const h = dev.host, f = own(dev);
  if (!h.dhcp) return "\nWindows IP Configuration\n\nThe operation failed as no adapter is in the state permissible for\nthis operation.";
  const offer = dhcpOffer(dev);
  if (!offer) {
    apipa(dev);
    return `\nWindows IP Configuration\n\nAn error occurred while renewing interface ${IFNAME.windows} : unable to contact your DHCP server. Request has timed out.`;
  }
  const bits = maskBits(offer.pool.mask);
  const excluded = (ip) => (offer.from.dhcp.excluded ?? []).some((e) => toN(ip) >= toN(e.from) && toN(ip) <= toN(e.to ?? e.from));
  // the server offers a client its old address again when it is still free
  const prev = f.ip && !h.apipa ? f.ip : h.lastIp;
  let ip = prev && network(prev, bits) === offer.pool.network && !excluded(prev) ? prev : null;
  for (let n = toN(offer.pool.network) + 1; !ip && n < toN(offer.pool.network) + 2 ** (32 - bits) - 1; n++) {
    const cand = fromN(n);
    if (!excluded(cand) && !owner(dev, cand) && cand !== offer.gw.ip) ip = cand;
  }
  f.ip = ip;
  f.mask = offer.pool.mask;
  // the server keeps the lease (show ip dhcp binding, show ip dhcp pool)
  dropLease(dev);
  const srv = offer.from.dhcp;
  srv.leases ??= [];
  srv.leases.push({ ip, mac: dev.mac, clientId: h.os !== "linux", pool: Object.keys(srv.pools).find((k) => srv.pools[k] === offer.pool), days: offer.pool.lease ?? 1 });
  h.gw = offer.pool.router?.[0] ?? null;
  h.dns = offer.pool.dns?.length ? [...offer.pool.dns] : h.saveDns ?? [];
  h.domain = offer.pool.domain ?? h.domain;
  h.dhcpServer = offer.server;
  h.leased = true;
  h.apipa = false;
  return ipconfigWin(dev, false);
}
const toN = (ip) => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0);
const fromN = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

function arpWin(dev) {
  const f = own(dev);
  if (!f.ip) return "No ARP Entries Found.";
  const rows = dev.host.arp.map((a) => `  ${a.ip.padEnd(22)}${macArpWin(a.mac).padEnd(22)}dynamic`);
  const bcast = broadcastOf(f.ip, f.mask);
  return [`\nInterface: ${f.ip} --- 0xc`, "  Internet Address      Physical Address      Type", ...rows, `  ${bcast.padEnd(22)}ff-ff-ff-ff-ff-ff     static`, "  224.0.0.22            01-00-5e-00-00-16     static", "  255.255.255.255       ff-ff-ff-ff-ff-ff     static"].join("\n");
}

function pingWin(dev, target, count) {
  const r = lookup(dev, target);
  if (r.error) return `Ping request could not find host ${target}. Please check the name and try again.`;
  const f = own(dev);
  if (noRoute(dev, r.ip)) return `\nPinging ${r.ip} with 32 bytes of data:\n${"PING: transmit failed. General failure.\n".repeat(count)}\nPing statistics for ${r.ip}:\n    Packets: Sent = ${count}, Received = 0, Lost = ${count} (100% loss),`;
  const ok = reaches(dev, r.ip, true);
  const head = r.name ? `\nPinging ${r.name} [${r.ip}] with 32 bytes of data:` : `\nPinging ${r.ip} with 32 bytes of data:`;
  const lines = Array.from({ length: count }, (_, i) => (ok ? `Reply from ${r.ip}: bytes=32 time${i === 0 ? "=2ms" : "<1ms"} TTL=${ttl(dev, r.ip)}` : "Request timed out."));
  const stats = `\nPing statistics for ${r.ip}:\n    Packets: Sent = ${count}, Received = ${ok ? count : 0}, Lost = ${ok ? 0 : count} (${ok ? 0 : 100}% loss),`;
  return [head, ...lines, stats + (ok ? "\nApproximate round trip times in milli-seconds:\n    Minimum = 0ms, Maximum = 2ms, Average = 0ms" : "")].join("\n");
}

// the TTL a reply arrives with: what the answering OS starts from, less one
// for each router on the way back
function ttl(dev, ip) {
  const o = owner(dev, ip)?.device;
  const start = !o ? 64 : ["router", "switch", "l3switch"].includes(o.type) ? 255 : o.host?.os === "windows" ? 128 : 64;
  return start - (hopsTo(dev, ip).length - 1);
}

// no address, no link, or another subnet with no gateway: the packet never
// leaves, and every OS says so instead of timing out
function noRoute(dev, ip) {
  const f = own(dev);
  return ip !== "127.0.0.1" && (!f.ip || !linkUp(dev) || (!local(dev, ip) && !dev.host.gw));
}

function hopsTo(dev, ip) {
  if (local(dev, ip)) return [ip];
  if (dev.host.hops[ip]) return [dev.host.gw, ...dev.host.hops[ip], ip];
  const r = gatewayRouter(dev);
  const path = r && pathFrom(r, ip);
  if (!path) return [dev.host.gw, ip].filter(Boolean);
  return [dev.host.gw, ...path].filter((x, i, all) => x && all.indexOf(x) === i);
}

function tracertWin(dev, target) {
  const r = lookup(dev, target);
  if (r.error) return `Unable to resolve target system name ${target}.`;
  if (noRoute(dev, r.ip)) return "Unable to contact IP driver. General failure.";
  const ok = reaches(dev, r.ip);
  const hops = ok ? hopsTo(dev, r.ip) : [dev.host.gw].filter((g) => g && reaches(dev, g));
  const ms = (i) => (i === 0 ? "<1 ms" : `${i} ms`).padStart(9);
  const rows = hops.map((h, i) => `${String(i + 1).padStart(3)}${ms(i)}${ms(i)}${ms(i)}  ${h}`);
  if (!ok) rows.push(`${String(rows.length + 1).padStart(3)}${"*".padStart(9)}${"*".padStart(9)}${"*".padStart(9)}     Request timed out.`);
  return [`\nTracing route to ${r.name ? `${r.name} [${r.ip}]` : r.ip}`, "over a maximum of 30 hops:", "", ...rows, "", ok ? "Trace complete." : ""].join("\n");
}

function nslookup(dev, name, server, unix) {
  const h = dev.host;
  const srv = server ?? h.dns[0];
  if (!name) return unix ? "> (interactive mode is not simulated: nslookup <name>)" : `Default Server:  ${srv ? "dns." + (h.domain ?? "local") : "UnKnown"}\nAddress:  ${srv ?? "127.0.0.1"}\n\n> (interactive mode is not simulated: nslookup <name>)`;
  if (!srv || !reaches(dev, srv)) return unix ? ";; communications error to 10.255.255.255#53: timed out\n;; no servers could be reached" : `DNS request timed out.\n    timeout was 2 seconds.\nServer:  UnKnown\nAddress:  ${srv ?? "::1"}\n\n*** Request to UnKnown timed-out`;
  const full = name.includes(".") || !h.domain ? name.toLowerCase() : `${name}.${h.domain}`.toLowerCase();
  const ip = h.records[full];
  const sname = `dns.${h.domain ?? "local"}`;
  if (unix) return ip ? `Server:\t\t${srv}\nAddress:\t${srv}#53\n\nName:\t${full}\nAddress: ${ip}` : `Server:\t\t${srv}\nAddress:\t${srv}#53\n\n** server can't find ${full}: NXDOMAIN`;
  return ip ? `Server:  ${sname}\nAddress:  ${srv}\n\nName:    ${full}\nAddress:  ${ip}` : `Server:  ${sname}\nAddress:  ${srv}\n\n*** ${sname} can't find ${name}: Non-existent domain`;
}

function displayDns(dev) {
  if (!dev.host.dnsCache.length) return "\nWindows IP Configuration\n\n";
  return ["\nWindows IP Configuration", "", ...dev.host.dnsCache.flatMap((c) => [`    ${c.name}`, "    ----------------------------------------", `    Record Name . . . . . : ${c.name}`, "    Record Type . . . . . : 1", "    Time To Live  . . . . : 3542", "    Data Length . . . . . : 4", "    Section . . . . . . . : Answer", `    A (Host) Record . . . : ${c.ip}`, ""])].join("\n");
}

const WIN_UNKNOWN = (w) => `'${w}' is not recognized as an internal or external command,\noperable program or batch file.`;

function windows(dev, line) {
  const words = line.trim().split(/\s+/);
  const cmd = words[0].toLowerCase().replace(/\.exe$/, "");
  const args = words.slice(1).map((w) => w.toLowerCase());
  const a = args.join(" ");
  switch (cmd) {
    case "ipconfig":
      if (!a) return ipconfigWin(dev, false);
      if (a === "/all") return ipconfigWin(dev, true);
      if (a === "/release") return release(dev);
      if (a === "/renew") return renew(dev);
      if (a === "/flushdns") return (dev.host.dnsCache = []), "\nWindows IP Configuration\n\nSuccessfully flushed the DNS Resolver Cache.";
      if (a === "/displaydns") return displayDns(dev);
      return `\nError: unrecognized or incomplete command line.\n\nUSAGE:\n    ipconfig [/allcompartments] [/? | /all |\n                                 /renew [adapter] | /release [adapter] |\n                                 /flushdns | /displaydns | /registerdns ]`;
    case "ping": {
      let count = 4;
      const n = args.indexOf("-n");
      if (n >= 0) count = Math.min(Number(args[n + 1]) || 4, 20);
      const target = words.slice(1).filter((w, i) => !w.startsWith("-") && args[i - 1] !== "-n").pop();
      if (!target) return "Usage: ping [-t] [-a] [-n count] [-l size] target_name";
      return pingWin(dev, target, count);
    }
    case "tracert":
      return args.length ? tracertWin(dev, words[words.length - 1]) : "Usage: tracert [-d] [-h maximum_hops] target_name";
    case "nslookup":
      return nslookup(dev, words[1], words[2]);
    case "arp":
      if (a === "-a" || a === "-g") return arpWin(dev);
      if (/^-d( \*)?$/.test(a)) return (dev.host.arp = []), "";
      return "\nDisplays and modifies the IP-to-Physical address translation tables used by\naddress resolution protocol (ARP).\n\nARP -s inet_addr eth_addr [if_addr]\nARP -d inet_addr [if_addr]\nARP -a [inet_addr] [-N if_addr] [-v]";
    case "netsh":
      if (a === "interface ip delete arpcache" || a === "int ip delete arpcache") return (dev.host.arp = []), "Ok.\n";
      return "The following command was not found: " + words.slice(1).join(" ") + ".";
    case "hostname":
      return dev.hostname;
    case "cls":
      return "\f";
    default:
      return WIN_UNKNOWN(words[0]);
  }
}

// --- linux ---------------------------------------------------------------------------------------

function ipAddr(dev, linkOnly) {
  const h = dev.host, f = own(dev), up = linkUp(dev);
  const state = up ? "UP" : "DOWN";
  const flags = up ? "<BROADCAST,MULTICAST,UP,LOWER_UP>" : "<NO-CARRIER,BROADCAST,MULTICAST,UP>";
  const lo = ["1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000", "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00"];
  const eth = [`2: eth0: ${flags} mtu 1500 qdisc fq_codel state ${state} group default qlen 1000`, `    link/ether ${macLinux(dev.mac)} brd ff:ff:ff:ff:ff:ff`];
  if (linkOnly) return [...lo, ...eth].join("\n");
  lo.push("    inet 127.0.0.1/8 scope host lo", "       valid_lft forever preferred_lft forever", "    inet6 ::1/128 scope host noprefixroute", "       valid_lft forever preferred_lft forever");
  if (f.ip && up) {
    eth.push(`    inet ${f.ip}/${bitsOf(dev)} brd ${broadcastOf(f.ip, f.mask)} scope global ${h.leased ? "dynamic noprefixroute " : ""}eth0`, h.leased ? "       valid_lft 86213sec preferred_lft 86213sec" : "       valid_lft forever preferred_lft forever");
  }
  eth.push(`    inet6 ${linkLocal(dev)}/64 scope link`, "       valid_lft forever preferred_lft forever");
  return [...lo, ...eth].join("\n");
}

function ipRoute(dev) {
  const h = dev.host, f = own(dev);
  if (!f.ip || !linkUp(dev)) return "";
  const net = `${network(f.ip, bitsOf(dev))}/${bitsOf(dev)}`;
  const proto = h.leased ? "dhcp" : "static";
  return [h.gw ? `default via ${h.gw} dev eth0 proto ${proto} metric 100` : null, `${net} dev eth0 proto kernel scope link src ${f.ip} metric 100`].filter(Boolean).join("\n");
}

function ifconfigLinux(dev) {
  const f = own(dev), up = linkUp(dev);
  return [
    `eth0: flags=${up ? "4163<UP,BROADCAST,RUNNING,MULTICAST>" : "4099<UP,BROADCAST,MULTICAST>"}  mtu 1500`,
    ...(f.ip && up ? [`        inet ${f.ip}  netmask ${f.mask}  broadcast ${broadcastOf(f.ip, f.mask)}`] : []),
    `        inet6 ${linkLocal(dev)}  prefixlen 64  scopeid 0x20<link>`,
    `        ether ${macLinux(dev.mac)}  txqueuelen 1000  (Ethernet)`,
    "        RX packets 1520  bytes 180332 (180.3 KB)",
    "        RX errors 0  dropped 0  overruns 0  frame 0",
    "        TX packets 1187  bytes 141205 (141.2 KB)",
    "        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0",
    "",
    "lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536",
    "        inet 127.0.0.1  netmask 255.0.0.0",
    "        inet6 ::1  prefixlen 128  scopeid 0x10<host>",
    "        loop  txqueuelen 1000  (Local Loopback)",
  ].join("\n");
}

function arpLinux(dev, style) {
  const rows = dev.host.arp;
  if (style === "neigh") return rows.map((a) => `${a.ip} dev eth0 lladdr ${macLinux(a.mac)} REACHABLE`).join("\n");
  if (style === "a") return rows.map((a) => `? (${a.ip}) at ${macLinux(a.mac)} [ether] on eth0`).join("\n");
  return ["Address                  HWtype  HWaddress           Flags Mask            Iface", ...rows.map((a) => `${a.ip.padEnd(25)}ether   ${macLinux(a.mac)}   C                     eth0`)].join("\n");
}

function resolvectl(dev) {
  const h = dev.host;
  return ["Global", "         Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported", "  resolv.conf mode: stub", "", "Link 2 (eth0)", "    Current Scopes: DNS", "         Protocols: +DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported", ...(h.dns.length ? [`Current DNS Server: ${h.dns[0]}`, `       DNS Servers: ${h.dns.join(" ")}`] : []), ...(h.domain ? [`        DNS Domain: ${h.domain}`] : [])].join("\n");
}

function resolvConf(dev) {
  const h = dev.host;
  return ["# Generated by NetworkManager", ...(h.domain ? [`search ${h.domain}`] : []), ...h.dns.map((s) => `nameserver ${s}`)].join("\n");
}

function pingUnix(dev, target, count, mac) {
  const r = lookup(dev, target);
  if (r.error) return mac ? `ping: cannot resolve ${target}: Unknown host` : `ping: ${target}: ${r.error === "noserver" ? "Temporary failure in name resolution" : "Name or service not known"}`;
  const f = own(dev);
  if (noRoute(dev, r.ip)) return mac ? `PING ${r.ip} (${r.ip}): 56 data bytes\nping: sendto: No route to host\n\n--- ${r.ip} ping statistics ---\n1 packets transmitted, 0 packets received, 100.0% packet loss` : "ping: connect: Network is unreachable";
  const ok = reaches(dev, r.ip, true);
  const shown = r.name ? `${r.name} (${r.ip})` : `${r.ip} (${r.ip})`;
  const replies = ok ? Array.from({ length: count }, (_, i) => (mac ? `64 bytes from ${r.ip}: icmp_seq=${i} ttl=${ttl(dev, r.ip)} time=1.${2 + i}04 ms` : `64 bytes from ${r.name ? shown : r.ip}: icmp_seq=${i + 1} ttl=${ttl(dev, r.ip)} time=1.${2 + i}4 ms`)) : mac ? Array.from({ length: count }, (_, i) => `Request timeout for icmp_seq ${i}`) : [];
  if (mac) return [`PING ${r.name ?? r.ip} (${r.ip}): 56 data bytes`, ...replies, "", `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, ${ok ? count : 0} packets received, ${ok ? "0.0" : "100.0"}% packet loss`, ...(ok ? ["round-trip min/avg/max/stddev = 1.204/1.354/1.504/0.112 ms"] : [])].join("\n");
  return [`PING ${shown} 56(84) bytes of data.`, ...replies, "", `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, ${ok ? count : 0} received, ${ok ? 0 : 100}% packet loss, time ${count * 1000 - 997}ms`, ...(ok ? [`rtt min/avg/max/mdev = 1.214/1.364/1.514/0.112 ms`] : [])].join("\n");
}

function traceUnix(dev, target, mac) {
  const r = lookup(dev, target);
  if (r.error) return mac ? `traceroute: unknown host ${target}` : `${target}: Name or service not known\nCannot handle "host" cmdline arg \`${target}' on position 1 (argc 1)`;
  if (noRoute(dev, r.ip)) return mac ? "traceroute: findsaddr: failed to connect to peer for src addr selection." : `traceroute to ${r.ip} (${r.ip}), 30 hops max, 60 byte packets\nconnect: Network is unreachable`;
  const ok = reaches(dev, r.ip);
  const hops = ok ? hopsTo(dev, r.ip) : [dev.host.gw].filter((g) => g && reaches(dev, g));
  const rows = hops.map((h, i) => ` ${i + 1}  ${h} (${h})  ${i + 1}.${i}12 ms  ${i + 1}.${i}05 ms  ${i + 1}.${i}01 ms`);
  if (!ok) rows.push(` ${rows.length + 1}  * * *`);
  return [`traceroute to ${r.name ?? r.ip} (${r.ip}), ${mac ? "64 hops max, 52 byte packets" : "30 hops max, 60 byte packets"}`, ...rows].join("\n");
}

function dig(dev, name) {
  const h = dev.host;
  const srv = h.dns[0];
  if (!name) return ";; (dig with no name asks for the root servers: dig <name>)";
  if (!srv || !reaches(dev, srv)) return `\n; <<>> DiG 9.18.28 <<>> ${name}\n;; global options: +cmd\n;; no servers could be reached`;
  const full = name.toLowerCase().replace(/\.$/, "");
  const ip = h.records[full];
  return [`\n; <<>> DiG 9.18.28 <<>> ${name}`, ";; global options: +cmd", ";; Got answer:", `;; ->>HEADER<<- opcode: QUERY, status: ${ip ? "NOERROR" : "NXDOMAIN"}, id: 41873`, `;; flags: qr aa rd ra; QUERY: 1, ANSWER: ${ip ? 1 : 0}, AUTHORITY: 0, ADDITIONAL: 1`, "", ";; QUESTION SECTION:", `;${full}.\t\tIN\tA`, ...(ip ? ["", ";; ANSWER SECTION:", `${full}.\t3600\tIN\tA\t${ip}`] : []), "", ";; Query time: 2 msec", `;; SERVER: ${srv}#53(${srv}) (UDP)`, ";; WHEN: Mon Mar 02 09:20:11 EET 2026", `;; MSG SIZE  rcvd: ${ip ? 62 : 46}`].join("\n");
}

function countOf(args, flag, dflt) {
  const i = args.indexOf(flag);
  return i >= 0 ? Math.min(Number(args[i + 1]) || dflt, 20) : dflt;
}
const targetOf = (args, flags) => args.filter((w, i) => !w.startsWith("-") && !flags.includes(args[i - 1])).pop();

function linux(dev, line) {
  const words = line.trim().split(/\s+/);
  const [cmd, ...args] = words;
  const a = args.join(" ");
  switch (cmd) {
    case "ip": {
      const obj = args[0] ?? "";
      const rest = args.slice(1).filter((w) => w !== "show" && w !== "list");
      if (rest.length > 1 || (rest.length === 1 && rest[0] !== "eth0" && rest[0] !== "dev")) return `Command "${rest[0]}" is unknown, try "ip ${obj} help".`;
      if (["a", "ad", "add", "addr", "addre", "addres", "address"].includes(obj)) return ipAddr(dev);
      if (["l", "li", "lin", "link"].includes(obj)) return ipAddr(dev, true);
      if (["r", "ro", "rou", "rout", "route"].includes(obj)) return ipRoute(dev);
      if (["n", "ne", "nei", "neig", "neigh", "neighbor", "neighbour"].includes(obj)) return arpLinux(dev, "neigh");
      return 'Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\nwhere  OBJECT := { address | link | neighbour | route | ... }';
    }
    case "ifconfig":
      return ifconfigLinux(dev);
    case "arp":
      return arpLinux(dev, a === "-a" ? "a" : "n");
    case "ping": {
      const target = targetOf(args, ["-c"]);
      return target ? pingUnix(dev, target, countOf(args, "-c", 4)) + (args.includes("-c") ? "" : "\n(ping runs until Ctrl+C on Linux; stopped after 4 here - use ping -c 4)") : "ping: usage error: Destination address required";
    }
    case "traceroute":
      return args.length ? traceUnix(dev, args[args.length - 1]) : "Usage:\n  traceroute [ -46dFITnreAUDV ] host [ packetlen ]";
    case "tracepath":
      return args.length ? traceUnix(dev, args[args.length - 1]) : "Usage: tracepath [-4] [-6] [-n] [-b] [-l <len>] [-p port] <destination>";
    case "nslookup":
      return nslookup(dev, args[0], args[1], true);
    case "dig":
      return dig(dev, args.filter((w) => !w.startsWith("@") && !w.startsWith("+"))[0]);
    case "resolvectl":
      return a === "status" || a === "" ? resolvectl(dev) : `Unknown command verb '${args[0]}'.`;
    case "cat":
      if (a === "/etc/resolv.conf") return resolvConf(dev);
      if (a === "/etc/hostname") return dev.hostname.toLowerCase();
      return `cat: ${a}: No such file or directory`;
    case "hostname":
      return dev.hostname.toLowerCase();
    case "clear":
      return "\f";
    case "sudo":
      return a ? linux(dev, a) : "usage: sudo -h | -K | -k | -V";
    default:
      return `${cmd}: command not found`;
  }
}

// --- macOS ---------------------------------------------------------------------------------------

function ifconfigMac(dev, only) {
  const f = own(dev), up = linkUp(dev);
  const en0 = [
    "en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500",
    "\toptions=6460<TSO4,TSO6,CHANNEL_IO,PARTIAL_CSUM,ZEROINVERT_CSUM>",
    `\tether ${macLinux(dev.mac)}`,
    `\tinet6 ${linkLocal(dev)}%en0 prefixlen 64 secured scopeid 0x6`,
    ...(f.ip && up ? [`\tinet ${f.ip} netmask ${hexMask(f.mask)} broadcast ${broadcastOf(f.ip, f.mask)}`] : []),
    "\tnd6 options=201<PERFORMNUD,DAD>",
    `\tmedia: autoselect${up ? " (1000baseT <full-duplex>)" : ""}`,
    `\tstatus: ${up ? "active" : "inactive"}`,
  ];
  if (only === "en0") return en0.join("\n");
  if (only) return `ifconfig: interface ${only} does not exist`;
  return ["lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384", "\toptions=1203<RXCSUM,TXCSUM,TXSTATUS,SW_TIMESTAMP>", "\tinet 127.0.0.1 netmask 0xff000000", "\tinet6 ::1 prefixlen 128", "\tinet6 fe80::1%lo0 prefixlen 64 scopeid 0x1", "\tnd6 options=201<PERFORMNUD,DAD>", ...en0].join("\n");
}

function netstatMac(dev) {
  const h = dev.host, f = own(dev);
  const rows = ["Routing tables", "", "Internet:", "Destination        Gateway            Flags               Netif Expire"];
  if (f.ip && linkUp(dev)) {
    if (h.gw) rows.push(`${"default".padEnd(19)}${h.gw.padEnd(19)}${"UGScg".padEnd(20)}en0`);
    const bits = bitsOf(dev);
    const net = network(f.ip, bits).split(".").slice(0, Math.ceil(bits / 8)).join(".");
    rows.push(`${`${net}/${bits}`.padEnd(19)}${"link#6".padEnd(19)}${"UCS".padEnd(20)}en0      !`);
    for (const a of h.arp) rows.push(`${a.ip.padEnd(19)}${macMacShort(a.mac).padEnd(19)}${"UHLWIir".padEnd(20)}en0   1197`);
  }
  rows.push(`${"127".padEnd(19)}${"127.0.0.1".padEnd(19)}${"UCS".padEnd(20)}lo0`, `${"127.0.0.1".padEnd(19)}${"127.0.0.1".padEnd(19)}${"UH".padEnd(20)}lo0`);
  return rows.join("\n");
}

function scutilDns(dev) {
  const h = dev.host;
  if (!h.dns.length) return "DNS configuration\n\nNo DNS configuration available";
  return ["DNS configuration", "", "resolver #1", ...(h.domain ? [`  search domain[0] : ${h.domain}`] : []), ...h.dns.map((s, i) => `  nameserver[${i}] : ${s}`), "  if_index : 6 (en0)", "  flags    : Request A records", "  reach    : 0x00020002 (Reachable,Directly Reachable Address)"].join("\n");
}

function macos(dev, line) {
  const words = line.trim().split(/\s+/);
  const [cmd, ...args] = words;
  const a = args.join(" ");
  switch (cmd) {
    case "ifconfig":
      return ifconfigMac(dev, args[0]);
    case "netstat":
      return /^-(rn|nr)( -f inet)?$/.test(a) ? netstatMac(dev) : "netstat: (only netstat -rn is simulated here)";
    case "scutil":
      return a === "--dns" ? scutilDns(dev) : "usage: scutil --dns";
    case "arp":
      if (a === "-a" || a === "-an") return dev.host.arp.map((x) => `? (${x.ip}) at ${macMacShort(x.mac)} on en0 ifscope [ethernet]`).join("\n");
      if (/^-a?d/.test(a)) return (dev.host.arp = []), "";
      return "usage: arp [-n] [-i interface] hostname\n       arp [-n] [-i interface] [-l] -a";
    case "ping": {
      const target = targetOf(args, ["-c"]);
      return target ? pingUnix(dev, target, countOf(args, "-c", 4), true) + (args.includes("-c") ? "" : "\n(ping runs until Ctrl+C on macOS; stopped after 4 here - use ping -c 4)") : "usage: ping [-AaDdfnoQqRrv] [-c count] host";
    }
    case "traceroute":
      return args.length ? traceUnix(dev, args[args.length - 1], true) : "Version 1.4a12+Darwin\nUsage: traceroute [-adDeFInrSvx] host [packetsize]";
    case "nslookup":
      return nslookup(dev, args[0], args[1], true);
    case "dig":
      return dig(dev, args.filter((w) => !w.startsWith("@") && !w.startsWith("+"))[0]);
    case "hostname":
      return dev.hostname;
    case "clear":
      return "\f";
    case "sudo":
      return a ? macos(dev, a) : "usage: sudo -h | -K | -k | -V";
    default:
      return `zsh: command not found: ${cmd}`;
  }
}

// --- the shell -----------------------------------------------------------------------------------

export function hostPrompt(dev) {
  const h = dev.host;
  if (h.os === "windows") return `C:\\Users\\${h.user}>`;
  if (h.os === "linux") return `${h.user}@${dev.hostname.toLowerCase()}:~$ `;
  return `${h.user}@${dev.hostname} ~ % `;
}

export function hostBanner(dev) {
  const os = dev.host.os;
  if (os === "windows") return "Microsoft Windows [Version 10.0.22631.4317]\n(c) Microsoft Corporation. All rights reserved.\n\n";
  if (os === "linux") return "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)\n\n";
  return "Last login: Mon Mar  2 09:12:44 on ttys000\n";
}

// commands are recorded as typed, cleaned up (Windows ignores case)
function canonical(dev, line) {
  const t = line.trim().replace(/\s+/g, " ");
  return dev.host.os === "windows" ? t.toLowerCase().replace(/^(\S+)\.exe\b/, "$1") : t;
}

export function hostExec(dev, raw) {
  const line = raw.replace(/\t/g, " ");
  if (!line.trim()) return "";
  dev.history.push(line);
  dev.ran.push({ mode: "host", text: canonical(dev, line) });
  const os = dev.host.os;
  return os === "windows" ? windows(dev, line) : os === "linux" ? linux(dev, line) : macos(dev, line);
}

const WORDS = {
  windows: ["ipconfig", "ping", "tracert", "nslookup", "arp", "netsh", "hostname", "cls"],
  linux: ["ip", "ifconfig", "arp", "ping", "traceroute", "tracepath", "nslookup", "dig", "resolvectl", "cat", "hostname", "clear"],
  mac: ["ifconfig", "netstat", "scutil", "arp", "ping", "traceroute", "nslookup", "dig", "hostname", "clear"],
};

// tab completes the command name only, as a shell does
export function hostComplete(dev, typed) {
  if (/\s/.test(typed.trim()) || !typed.trim()) return typed;
  const hits = WORDS[dev.host.os].filter((w) => w.startsWith(typed.trim().toLowerCase()));
  return hits.length === 1 ? hits[0] + " " : typed;
}
