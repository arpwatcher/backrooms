// The terminal of a PC: Windows (cmd), Linux (bash) or macOS (zsh), with the
// commands the CCNA asks about for checking a client's IP settings (1.10):
// ipconfig, ip addr, ifconfig, the routes, ARP, DNS, ping and traceroute.
// It reads the lab around it, so a ping or a DHCP renew only works when the
// network really allows it.

import { maskBits, network, parseIp, compressIpv6, eui64, wildcardMatch, ipv6Network, expandIpv6, parseIpv6Prefix } from "./ip.js";
import { status, operMode, carries, hsrpRanking, aclAllows, aclEntry, carry, far, ospfNeighbors, ospfElection, ospfOf } from "./net.js";
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
    // IPv6: "auto" takes SLAAC from the routers' advertisements; "addr/nn" is static
    slaac: d.ipv6 === "auto", ipv6Static: d.ipv6 && d.ipv6 !== "auto" ? parseIpv6Prefix(d.ipv6) : null, gateway6: d.gateway6 ? expandIpv6(d.gateway6) : null, gw6: null,
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
  // path: each switch the frame crossed, the port it came in by and the one
  // it left by (port security, DAI and DHCP snooping look at these)
  const flood = (sw, vlan, path, entry) => {
    const key = `${sw.name}:${vlan}`;
    if (seen.has(key)) return;
    seen.add(key);
    const svi = sw.interfaces[`Vlan${vlan}`];
    if (svi?.ip && !svi.shutdown) found.push({ device: sw, iface: svi, path: [...path, { sw, entry, exit: null, vlan }] });
    for (const q of Object.values(sw.interfaces)) {
      const link = sw.links[q.name];
      if (!link || !q.switchport || q.errdisabled || status(sw, q)[0] !== "up") continue;
      const eff = asSwitched(sw, q);
      if (!carries(sw, eff, vlan)) continue;
      // an access port tags only its voice VLAN (for the phone behind it)
      const tagged = operMode(sw, eff) === "trunk" ? vlan !== eff.nativeVlan : vlan === eff.voiceVlan && vlan !== eff.accessVlan;
      arrive(link.device, link.device.interfaces[link.iface], vlan, tagged, [...path, { sw, entry, exit: eff, vlan }]);
    }
  };
  const arrive = (d, f, vlan, tagged, path) => {
    if (!f || f.shutdown || f.errdisabled) return;
    if (isSwitch(d) && f.switchport) {
      const eff = asSwitched(d, f);
      const mode = operMode(d, eff);
      if (mode === "trunk") {
        if (!tagged) return flood(d, eff.nativeVlan, path, eff);
        if (carries(d, eff, vlan)) flood(d, vlan, path, eff);
        return;
      }
      if (!tagged) flood(d, eff.accessVlan, path, eff);
      // a phone's tagged frames go into the port's voice VLAN
      else if (vlan === eff.voiceVlan) flood(d, vlan, path, eff);
      return;
    }
    if (d.type === "phone") {
      const up = d.interfaces["FastEthernet0/1"];
      const pass = (port) => {
        const l = d.links[port];
        if (l) arrive(l.device, l.device.interfaces[l.iface], vlan, false, path);
      };
      if (f !== up) return pass("FastEthernet0/1");
      // from the switch: tagged voice frames are the phone's own, untagged ones go
      // to the PC port (and to the phone too while it has no voice VLAN)
      const voice = phoneVlan(d);
      if (up.ip && (tagged ? vlan === voice : voice === null)) found.push({ device: d, iface: up, path });
      if (!tagged) pass("FastEthernet0/2");
      return;
    }
    if (d.type === "pc" || d.type === "server" || d.type === "cloud") {
      if (!tagged) found.push({ device: d, iface: f, path });
      return;
    }
    // a router or a routed port: the interface itself for untagged frames,
    // or the subinterface for the frame's VLAN
    for (const s of Object.values(d.interfaces)) {
      const mine = s === f || s.name.startsWith(`${f.name}.`);
      if (!mine || s.shutdown || (!s.ip && !s.ipv6?.length)) continue;
      const enc = s.encap;
      if (tagged ? enc?.vlan === vlan && !enc.native : s === f ? !enc : enc?.native) found.push({ device: d, iface: s, path });
    }
  };
  // a phone's own frames leave tagged with the voice VLAN it learned
  const v = dev.type === "phone" ? phoneVlan(dev) : null;
  arrive(start.device, start.device.interfaces[start.iface], v, v !== null, []);
  return found;
}
// the voice VLAN a phone uses: what the switch port's CDP tells it (none
// without CDP, and then the phone sends untagged, into the access VLAN)
export function phoneVlan(phone) {
  const end = phone.links["FastEthernet0/1"];
  const p = end?.device.interfaces[end.iface];
  if (!p || !isSwitch(end.device) || !end.device.cdp || !p.cdp || operMode(end.device, p) !== "access") return null;
  return p.voiceVlan ?? null;
}

// the addresses answering on this PC's segment, with the HSRP virtual IP on
// the active router
function neighbors(dev) {
  const out = [];
  for (const { device, iface, path } of segment(dev)) {
    out.push({ ip: iface.ip, device, iface, mac: device.mac, path });
    for (const [g, grp] of Object.entries(iface.hsrp?.groups ?? {})) {
      if (!grp.ip) continue;
      const active = hsrpRanking(device, grp.ip, device.lab?.all ?? [device], Number(g))[0];
      if (active?.device === device && active.iface === iface) out.push({ ip: grp.ip, device, iface, path, mac: (iface.hsrp.version === 2 ? "0000.0c9f.f" + Number(g).toString(16).padStart(3, "0") : "0000.0c07.ac" + Number(g).toString(16).padStart(2, "0")) });
    }
  }
  return out;
}
const onSegment = (dev, ip) => neighbors(dev).find((n) => n.ip === ip) ?? null;
// a frame and its answer cross the switches on the path: each one learns the
// sender's MAC on the port it came in by, and the answer's on the way out
function learnMacs(dev, n, count = 0) {
  for (const h of n?.path ?? []) {
    const t = (h.sw.macLearned ??= {});
    if (h.entry) t[`${h.vlan}|${dev.mac}`] = { vlan: h.vlan, mac: dev.mac, port: h.entry.name };
    if (h.exit && n.mac) t[`${h.vlan}|${n.mac}`] = { vlan: h.vlan, mac: n.mac, port: h.exit.name };
    // the requests come in by the entry port and leave by the exit, the replies the other way
    if (count) carry(h.sw, h.entry, count, "in"), carry(h.sw, h.entry, count, "out"), carry(h.sw, h.exit, count, "out"), carry(h.sw, h.exit, count, "in");
  }
  if (count) {
    const mine = own(dev);
    carry(dev, mine, count, "out"), carry(dev, mine, count, "in");
    // a router counts its own side as it routes (pathFrom)
    if (n?.device && n.iface && !ROUTER(n.device)) carry(n.device, n.iface, count, "in"), carry(n.device, n.iface, count, "out");
  }
}

// --- layer 2 security on the way: port security, DAI, DHCP snooping -----------------------------

// what an ACL entry with log reports, as IOS words it per kind of entry
function aclLog(router, name, e, pkt) {
  const verb = e.action === "permit" ? "permitted" : "denied";
  const n = `${pkt.count} packet${pkt.count === 1 ? "" : "s"}`;
  if (router.acls[String(name)]?.type === "standard") return `%SEC-6-IPACCESSLOGS: list ${name} ${verb} ${pkt.src} ${n}`;
  if (pkt.proto === "icmp") {
    const code = { echo: "8/0", "echo-reply": "0/0", unreachable: "3/1", "time-exceeded": "11/0" }[pkt.icmp] ?? "8/0";
    return `%SEC-6-IPACCESSLOGDP: list ${name} ${verb} icmp ${pkt.src} -> ${pkt.dst} (${code}), ${n}`;
  }
  if (pkt.sport !== undefined) return `%SEC-6-IPACCESSLOGP: list ${name} ${verb} ${pkt.proto} ${pkt.src}(${pkt.sport}) -> ${pkt.dst}(${pkt.dport}), ${n}`;
  return `%SEC-6-IPACCESSLOGNP: list ${name} ${verb} ${pkt.proto} ${pkt.src} -> ${pkt.dst}, ${n}`;
}
// OSPF says on the console when a neighbor reaches FULL or drops from it.
// What a lab starts with is taken as it is, without messages.
function ospfChanges(all, said) {
  for (const d of all) {
    if (!d.ospf || !Object.keys(d.ospf).length) {
      if (d.ospfFull) d.ospfFull = {};
      continue;
    }
    const now = {};
    for (const n of ospfNeighbors(d).filter((x) => x.up)) {
      const el = ospfElection(d, n.iface);
      if (el && el.mine === "DROTHER" && el.roleOf(n.rid) === "DROTHER") continue;
      now[`${n.rid}|${n.iface.name}`] = ospfOf(d, n.iface)?.pid ?? 1;
    }
    const before = d.ospfFull;
    d.ospfFull = now;
    if (!before) continue;
    const msgs = [];
    for (const k of Object.keys(now)) if (!(k in before)) msgs.push(`%OSPF-5-ADJCHG: Process ${now[k]}, Nbr ${k.split("|")[0]} on ${k.split("|")[1]} from LOADING to FULL, Loading Done`);
    for (const k of Object.keys(before)) {
      if (k in now) continue;
      const f = d.interfaces[k.split("|")[1]];
      const why = !f || status(d, f)[1] !== "up" ? "Interface down or detached" : "Dead timer expired";
      msgs.push(`%OSPF-5-ADJCHG: Process ${before[k]}, Nbr ${k.split("|")[0]} on ${k.split("|")[1]} from FULL to DOWN, Neighbor Down: ${why}`);
    }
    for (const m of msgs) logOn(d, m);
    if (msgs.length) said.set(d, [...(said.get(d) ?? []), ...msgs]);
  }
}

// a message on a switch's console, kept for show logging
function logOn(sw, msg) {
  (sw.logBuffer ??= []).push(`*Mar  1 00:${String(10 + (sw.logBuffer.length % 50)).padStart(2, "0")}:17.${String(100 + sw.logBuffer.length * 37).slice(-3)}: ${msg}`);
}

// the PC's frames enter its access port: port security learns the MAC or
// counts a violation (protect and restrict drop the frame, shutdown also
// err-disables the port)
function portAdmit(dev) {
  const start = dev.links[own(dev).name];
  const sw = start?.device;
  const f = sw && isSwitch(sw) ? sw.interfaces[start.iface] : null;
  if (!f?.ps?.enabled) return true;
  if (f.errdisabled) return false;
  const learned = (f.ps.learned ??= []);
  if (f.ps.macs.includes(dev.mac) || learned.some((l) => l.mac === dev.mac)) return true;
  if (f.ps.macs.length + learned.length < f.ps.max) {
    learned.push({ mac: dev.mac, vlan: f.accessVlan, sticky: f.ps.sticky });
    return true;
  }
  f.violations = (f.violations ?? 0) + 1;
  f.lastViolator = `${dev.mac}:${f.accessVlan}`;
  if (f.ps.violation === "protect") return false;
  logOn(sw, `%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${dev.mac} on port ${f.name}.`);
  if (f.ps.violation === "shutdown") {
    f.errdisabled = true;
    f.errReason = "psecure-violation";
    logOn(sw, `%PM-4-ERR_DISABLE: psecure-violation error detected on ${shortName(f.name)}, putting ${shortName(f.name)} in err-disable state`);
    logOn(sw, `%LINK-3-UPDOWN: Interface ${f.name}, changed state to down`);
  }
  return false;
}
const shortName = (n) => n.replace("FastEthernet", "Fa").replace("GigabitEthernet", "Gi");

// after every command: a port with BPDU Guard that hears a BPDU (a switch on
// the other end of the cable) is err-disabled at once. Returns the console
// messages per device
export function settle(all) {
  const said = new Map();
  ospfChanges(all, said);
  for (const d of all) if (d.phoneDhcp) phoneLease(d);
  for (const d of all) {
    if (!isSwitch(d)) continue;
    for (const f of Object.values(d.interfaces)) {
      if (!f.switchport || f.shutdown || f.errdisabled || f.channel) continue;
      const edge = f.stp.portfast === "edge" || (d.stp.portfastDefault && f.mode === "access");
      const guard = f.stp.bpduguard === true || (f.stp.bpduguard !== false && d.stp.bpduguardDefault && edge);
      if (!guard || status(d, f)[0] !== "up") continue;
      const end = d.links[f.name];
      const g = end && end.device.interfaces[end.iface];
      if (!g || !isSwitch(end.device) || !g.switchport || g.shutdown) continue;
      f.errdisabled = true;
      f.errReason = "bpduguard";
      const msgs = [`%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${shortName(f.name)} with BPDU Guard enabled. Disabling port.`, `%PM-4-ERR_DISABLE: bpduguard error detected on ${shortName(f.name)}, putting ${shortName(f.name)} in err-disable state`];
      for (const m of msgs) logOn(d, m);
      said.set(d, [...(said.get(d) ?? []), ...msgs]);
    }
  }
  return said;
}

// an ARP from dev (asking for target) crosses each switch on the path: where
// DAI runs on the VLAN and the port it came in by is not trusted, the
// sender's MAC and IP must be in that switch's DHCP snooping bindings
function arpPasses(dev, n, count = false) {
  const ip = own(dev).ip;
  // the request goes in by each switch's entry port, the reply comes back
  // in by its exit port, from the target
  const legs = [[dev.mac, ip, "entry", "Req", n.ip], [n.mac, n.ip, "exit", "Res", ip]];
  for (const [mac, from, side, kind, to] of legs) {
    for (const hop of n?.path ?? []) {
      const port = hop[side];
      if (!port || !hop.sw.dai?.vlans.includes(hop.vlan) || port.daiTrust) continue;
      if ((hop.sw.snooping.bindings ?? []).some((b) => b.mac === mac && b.ip === from && b.vlan === hop.vlan)) {
        // a real ARP that DAI let through shows in its Forwarded counter
        if (count) (hop.sw.daiForwarded ??= {})[hop.vlan] = (hop.sw.daiForwarded[hop.vlan] ?? 0) + 1;
        continue;
      }
      logOn(hop.sw, `%SW_DAI-4-DHCP_SNOOPING_DENY: 1 Invalid ARPs (${kind}) on ${shortName(port.name)}, vlan ${hop.vlan}.([${mac}/${from}/${kind === "Req" ? "0000.0000.0000" : dev.mac}/${to}/00:10:17 UTC Mon Mar 1 1993])`);
      return false;
    }
  }
  return true;
}

// nobody on the segment answers the ARP for the next hop (ip itself, or the
// gateway): the sender gives up and reports the host unreachable itself, from
// its own address, and keeps a failed entry for a while
function arpFails(dev, ip) {
  const h = dev.host;
  if (ip === "127.0.0.1") return false;
  const hop = local(dev, ip) ? ip : h.gw;
  if (!hop || !local(dev, hop) || h.extern.includes(hop) || onSegment(dev, hop)) return false;
  if (!(h.arpFailed ??= []).includes(hop)) h.arpFailed.push(hop);
  return true;
}
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
// an ACL on the way: a real ping (pkt.count set) adds its packets to the
// matching entry's counter, as show access-lists reports them
function passes(router, name, pkt) {
  if (!router.acls[String(name)]) return true;
  const e = aclEntry(router, name, pkt);
  if (e && pkt.count) e.matches = (e.matches ?? 0) + pkt.count;
  if (e?.log && pkt.count) logOn(router, aclLog(router, name, e, pkt));
  return e?.action === "permit";
}
// a packet kind whose packets count n times in the ACLs they cross
export const counted = (kind, n) => ({ go: (...a) => ({ ...kind.go(...a), count: n }), back: (...a) => ({ ...kind.back(...a), count: n }) });
// n echo requests from a router's own ping
export const pings = (n) => counted(ICMP, n);
// a traceroute's probes, three per TTL over hops hops: the router at hop i
// receives the probes whose TTL reaches it (TTL >= i) and forwards the ones
// that live on (TTL > i). off is 1 when a router sends them (it is in seen
// already), 0 for a PC
export const traced = (kind, hops, off) => ({
  go: (...a) => ({ ...kind.go(...a), countAt: (s, dir) => { const i = s - off + 1; return 3 * Math.max(0, dir === "in" ? hops - i + 1 : hops - i); } }),
  back: (...a) => kind.back(...a),
});
const at = (pkt, s, dir) => (pkt?.countAt ? { ...pkt, count: pkt.countAt(s, dir) } : pkt);

// Where a packet is dropped, seen.drop records the router, the address it
// came in by and why (route, acl-in, acl-out): that router may answer the
// sender with ICMP unreachable.
const dropped = (seen, router, inIf, why) => {
  seen.drop ??= { router, at: inIf?.ip ?? null, why, quiet: Boolean(inIf?.noUnreach) };
  return null;
};
function pathFrom(router, ip, seen = new Set(), pkt = null, inIf = null) {
  const here = at(pkt, seen.size, "in");
  if (here?.count) carry(router, inIf, here.count, "in");
  if (pkt && inIf?.aclIn && !passes(router, inIf.aclIn, here)) return dropped(seen, router, inIf, "acl-in");
  if (ownsIp(router, ip)) return [];
  if (seen.has(router) || seen.size > 15) return null;
  seen.add(router);
  const best = routeTable(router).filter((r) => r.code !== "L" && network(ip, r.bits) === r.net).sort((a, b) => b.bits - a.bits)[0];
  if (!best) return dropped(seen, router, inIf, "route");
  // a route to Null0 throws the packet away (and answers unreachable, as for no route)
  if (best.out === "Null0") return dropped(seen, router, inIf, "route");
  const exit = exitOf(router, best, ip);
  const out = at(pkt, seen.size - 1, "out");
  if (pkt && pkt.from !== router && exit?.aclOut && !passes(router, exit.aclOut, out)) return dropped(seen, router, inIf, "acl-out");
  if (out?.count) carry(router, exit, out.count, "out");
  if (best.code === "C") {
    const o = owner(router, ip);
    if (o && ROUTER(o.device) && o.device !== router) return pathFrom(o.device, ip, seen, pkt, o.iface) === null ? null : [ip];
    if (o?.device.type === "phone" && !segment(o.device).some((n) => n.device === router && n.iface === exit)) return null;
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
    // out to the ISP: its router answers a traceroute as one more hop
    if (isExternal(router, best)) return (seen.exit = router), next && next !== ip ? [next, ip] : [ip];
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
export function fromRouter(router, ip, kind = ICMP, from = null) {
  if (!router.lab?.all) return null;
  if (!ROUTER(router)) return fromSwitch(router, ip, kind);
  if (ownsIp(router, ip)) return { ok: true, hops: [ip], arp: null };
  const best = routeTable(router).filter((r) => r.code !== "L" && network(ip, r.bits) === r.net).sort((a, b) => b.bits - a.bits)[0];
  if (!best) return { ok: false, hops: [], arp: null, noRoute: true };
  const first = best.code === "C" ? ip : best.via;
  const exit = best.out ?? Object.values(router.interfaces).find((f) => f.ip && f.mask && first && network(first, maskBits(f.mask)) === network(f.ip, maskBits(f.mask)))?.name;
  const src = from ?? router.interfaces[exit]?.ip;
  const arp = exit?.startsWith("Serial") ? null : first;
  const seen = new Set();
  const path = pathFrom(router, ip, seen, kind.go(src, ip, router));
  if (path === null) {
    const d = seen.drop;
    const unreach = d && d.router !== router && d.at && !d.quiet && pathFrom(d.router, src) !== null ? { at: d.at, why: d.why } : null;
    const cut = unreach ?? (d && d.router !== router && d.at ? { at: d.at, why: d.why } : null);
    return { ok: false, hops: upTo(partial(router, ip, src), cut), arp, src, unreach };
  }
  if (seen.exit) return { ok: true, hops: path, arp, src };
  const o = owner(router, ip);
  const target = o?.device;
  let ok = true;
  if (target && src) {
    // the reply: a router answers from its routing table, a host or a
    // switch through its gateway unless the source is on its own subnet
    const f = o.iface;
    const near = f.mask && network(src, maskBits(f.mask)) === network(f.ip, maskBits(f.mask));
    const reply = kind.back(ip, src);
    if (ROUTER(target)) ok = pathFrom(target, src, new Set(), { ...reply, from: target }) !== null;
    else if (near) ok = !router.interfaces[exit]?.aclIn || aclAllows(router, router.interfaces[exit].aclIn, reply);
    else {
      const tgw = target.gateway ?? target.defaultGateway;
      const gw = target.host ? onSegment(target, target.host.gw) : tgw && owner(router, tgw);
      ok = Boolean(gw && ROUTER(gw.device) && pathFrom(gw.device, src, new Set(), reply, gw.iface) !== null);
    }
  }
  return { ok, hops: ok ? path : partial(router, ip, src), arp, src };
}
// a Layer 2 switch sends from its management SVI, like a host: straight to
// its own subnet, through ip default-gateway to the rest
function fromSwitch(sw, ip, kind) {
  const svi = Object.values(sw.interfaces).find((f) => f.name.startsWith("Vlan") && f.ip && status(sw, f)[1] === "up");
  if (!svi) return { ok: false, hops: [], arp: null, src: null };
  const src = svi.ip, bits = maskBits(svi.mask);
  const near = (x) => network(x, bits) === network(src, bits);
  if (ip === src) return { ok: true, hops: [ip], arp: null, src };
  if (near(ip)) {
    const o = owner(sw, ip);
    return { ok: Boolean(o), hops: o ? [ip] : [], arp: ip, src };
  }
  const gw = sw.defaultGateway;
  const g = gw && near(gw) ? owner(sw, gw) : null;
  if (!g || !ROUTER(g.device)) return { ok: false, hops: [], arp: gw ?? null, src };
  const path = pathFrom(g.device, ip, new Set(), kind.go(src, ip), g.iface);
  let ok = path !== null;
  const o = owner(sw, ip);
  if (ok && o) {
    const t = o.device, reply = kind.back(ip, src);
    if (ROUTER(t)) ok = pathFrom(t, src, new Set(), { ...reply, from: t }) !== null;
    else {
      const tgw = t.host ? onSegment(t, t.host.gw) : (t.gateway ?? t.defaultGateway) && owner(sw, t.gateway ?? t.defaultGateway);
      ok = Boolean(tgw && ROUTER(tgw.device) && pathFrom(tgw.device, src, new Set(), reply, tgw.iface) !== null);
    }
  }
  return { ok, hops: ok ? [gw, ...path].filter((x, i, a) => a.indexOf(x) === i) : [gw], arp: gw, src };
}

// the hops a traceroute gets before the router that reports unreachable: that
// router answers its own hop too unless an inbound ACL drops the probe first
export function upTo(hops, unreach) {
  if (!unreach) return hops;
  const i = hops.indexOf(unreach.at);
  return i < 0 ? hops : hops.slice(0, unreach.why === "acl-in" ? i : i + 1);
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
// what goes out and what comes back: a ping, or a TCP session to a port
const ICMP = { go: (src, dst, from) => ({ proto: "icmp", icmp: "echo", src, dst, from }), back: (src, dst, from) => ({ proto: "icmp", icmp: "echo-reply", src, dst, from }) };
const udp = (port) => ({ go: (src, dst, from) => ({ proto: "udp", src, dst, sport: port, dport: port, from }), back: (src, dst, from) => ({ proto: "udp", src, dst, sport: port, dport: port, from }) });
// IOS, Linux and macOS traceroute send UDP probes to 33434 and up; the
// target answers ICMP port unreachable (Windows tracert uses echoes)
export const TRACE = { go: (src, dst, from) => ({ proto: "udp", src, dst, sport: 49152, dport: 33434, from }), back: (src, dst, from) => ({ proto: "icmp", icmp: "unreachable", src, dst, from }) };
const tcp = (port) => ({ go: (src, dst, from) => ({ proto: "tcp", src, dst, sport: 49152, dport: port, from }), back: (src, dst, from) => ({ proto: "tcp", src, dst, sport: port, dport: 49152, ack: true, from }) });

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
function translate(router, local, target, out = 1, back = out) {
  const nat = router.nat;
  const stats = (router.natStats ??= { hits: 0, misses: 0 });
  const st = nat.statics.find((s) => s.local === local && !s.proto);
  const rule = !st && nat.dynamic.find((d) => aclPermits(router.acls[d.acl], local));
  nat.live ??= [];
  if (nat.live.some((t) => t.local === local && t.target === target)) return void (stats.hits += out + back);
  const global = natGlobal(router, local);
  if (!global) return void (stats.misses += 1);
  stats.misses += 1;
  stats.hits += out - 1 + back;
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
function reaches(dev, ip, ping = false, kind = ICMP) {
  const f = own(dev);
  // set once the packet is through to the gateway (a router past it may
  // still answer unreachable)
  dev.host.atGateway = false;
  dev.host.drop = null;
  if (ip === "127.0.0.1") return true;
  if (!f.ip || !linkUp(dev)) return false;
  if (!portAdmit(dev)) return false;
  if (local(dev, ip)) {
    const n = onSegment(dev, ip);
    if (!n || !arpPasses(dev, n, ping)) return false;
    if (n.device.host && !portAdmit(n.device)) return false;
    learnArp(dev, ip);
    if (ping) learnMacs(dev, n, kind.go(f.ip, ip).count ?? 0);
    // a router on the segment still checks the packet against its inbound
    // ACL (and counts it) when the packet is for the router itself
    if (ROUTER(n.device)) {
      const pkt = at(kind.go(f.ip, ip), 0, "in");
      if (pkt.count) carry(n.device, n.iface, pkt.count, "in");
      if (n.iface.aclIn && !passes(n.device, n.iface.aclIn, pkt)) return (dev.host.atGateway = true), (dev.host.drop = { router: n.device, at: n.iface.ip ?? null, why: "acl-in", quiet: Boolean(n.iface.noUnreach) }), false;
    }
    return true;
  }
  if (dev.host.apipa) return false;
  const gw = dev.host.gw;
  if (!gw || !local(dev, gw) || !onSegment(dev, gw)) return false;
  if (!arpPasses(dev, onSegment(dev, gw), ping)) return false;
  learnArp(dev, gw);
  // the gateway learns the PC's MAC from its ARP request, too
  const gwn = onSegment(dev, gw);
  if (ROUTER(gwn.device)) (gwn.device.arpLearned ??= {})[f.ip] = { mac: dev.mac, iface: gwn.iface.name };
  if (ping) learnMacs(dev, gwn, kind.go(f.ip, ip).count ?? 0);
  dev.host.atGateway = true;
  const gwIf = onSegment(dev, gw).iface;
  if (dev.host.extern.includes(ip) && !(dev.lab?.all ?? []).some((d) => ownsIp(d, ip))) {
    const r = gatewayRouter(dev);
    const seen = new Set();
    if (!r || pathFrom(r, ip, seen, kind.go(f.ip, ip), gwIf) === null) return (dev.host.drop = seen.drop ?? null), false;
    if (!seen.exit) return true;
    // out to the Internet, a private source needs NAT on the way out (a
    // private address beyond the cloud is a company WAN, reached as it is)
    const global = isPrivate(f.ip) && !isPrivate(ip) ? natGlobal(seen.exit, f.ip) : f.ip;
    if (!global) return false;
    // the reply comes in on the outside interface, still to the global
    // address, and is routed back in once translated
    const outside = exitOf(seen.exit, routeTable(seen.exit).filter((x) => x.code !== "L" && network(ip, x.bits) === x.net).sort((a, b) => b.bits - a.bits)[0] ?? {}, ip);
    if (outside?.aclIn && !passes(seen.exit, outside.aclIn, kind.back(ip, global))) return false;
    if (pathFrom(seen.exit, f.ip, new Set(), kind.back(ip, f.ip)) === null) return false;
    if (ping && global !== f.ip) translate(seen.exit, f.ip, ip, kind.go(f.ip, ip).count ?? 1, kind.back(ip, f.ip).count ?? kind.go(f.ip, ip).count ?? 1);
    return true;
  }
  const r = gatewayRouter(dev);
  const fwd = new Set();
  if (!r || pathFrom(r, ip, fwd, kind.go(f.ip, ip), gwIf) === null) return (dev.host.drop = fwd.drop ?? null), false;
  // and back: from the router that answers, or from the target's own gateway
  const o = owner(dev, ip);
  const target = o?.device;
  const reply = kind.back(ip, f.ip);
  if (!target || ROUTER(target)) {
    const from = target ?? r;
    return pathFrom(from, f.ip, new Set(), { ...reply, from }) !== null;
  }
  const tgw = target.gateway ?? target.defaultGateway;
  const back = target.host ? onSegment(target, target.host.gw) : tgw && owner(dev, tgw);
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
  "IPv6 Address": "IPv6 Address. . . . . . . . . . .",
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
  syncIpv6(dev.lab?.all);
  const v6 = pcV6(dev);
  if (v6) out.push(winLine("IPv6 Address", v6s(v6) + pref));
  out.push(winLine("Link-local IPv6 Address", `${linkLocal(dev)}%12${pref}`));
  if (f.ip) {
    out.push(winLine(h.apipa ? "Autoconfiguration IPv4 Address" : "IPv4 Address", f.ip + pref), winLine("Subnet Mask", f.mask));
    if (all && h.leased) out.push(winLine("Lease Obtained", "Monday, March 2, 2026 9:14:03 AM"), winLine("Lease Expires", "Tuesday, March 3, 2026 9:14:03 AM"));
  }
  if (h.gw6) out.push(winLine("Default Gateway", `${v6s(h.gw6)}%12`), ...(h.gw ? [" ".repeat(39) + h.gw] : []));
  else out.push(winLine("Default Gateway", h.gw ?? ""));
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
  // DHCP snooping drops server messages (the Offer) that come in on an
  // untrusted port, on every switch that snoops the VLAN
  const snooped = (path) => path.some((h) => h.exit && h.sw.snooping?.enabled && h.sw.snooping.vlans.includes(h.vlan) && !h.exit.snoopTrust);
  for (const { device, iface, path } of segment(dev)) {
    if (["pc", "server", "cloud"].includes(device.type)) continue;
    if (iface.aclIn && !aclAllows(device, iface.aclIn, discover)) continue;
    if (snooped(path ?? [])) continue;
    const local = poolFor(device, iface);
    if (local) return { pool: local, server: iface.ip, gw: iface, from: device, path };
    // a relay: the server must have a pool for the relay's subnet (giaddr),
    // the relay a route to the server, and the server a route back to the
    // giaddr, where it sends the Offer
    for (const helper of iface.helpers ?? []) {
      const o = owner(dev, helper);
      const p = o && poolFor(o.device, iface);
      if (!p) continue;
      if (ownsIp(device, helper) || (pathFrom(device, helper) !== null && pathFrom(o.device, iface.ip) !== null)) return { pool: p, server: helper, gw: iface, from: o.device, path };
    }
  }
  return null;
}

const dropLease = (dev) => {
  for (const d of dev.lab?.all ?? []) {
    if (d.dhcp?.leases) d.dhcp.leases = d.dhcp.leases.filter((l) => l.mac !== dev.mac);
    if (d.snooping?.bindings) d.snooping.bindings = d.snooping.bindings.filter((b) => b.mac !== dev.mac);
  }
};
// an IP phone keeps asking for an address in the VLAN it sends in (the voice
// VLAN it learned by CDP, or the access VLAN): it holds a lease while a server
// answers there, and loses it when none does
function phoneLease(ph) {
  const f = ph.interfaces["FastEthernet0/1"], st = ph.phoneDhcp;
  const offer = dhcpOffer(ph);
  if (!offer) {
    if (st.leased) Object.assign(f, { ip: null, mask: null }), (ph.gateway = null), dropLease(ph), Object.assign(st, { leased: false, tftp: null, server: null });
    return;
  }
  const bits = maskBits(offer.pool.mask);
  // a lease it holds is renewed with what the pool gives now
  if (st.leased && f.ip && network(f.ip, bits) === offer.pool.network) return void ((ph.gateway = offer.pool.router?.[0] ?? null), (st.tftp = offer.pool.options?.[150] ?? null));
  const excluded = (ip) => (offer.from.dhcp.excluded ?? []).some((e) => toN(ip) >= toN(e.from) && toN(ip) <= toN(e.to ?? e.from));
  let ip = null;
  for (let n = toN(offer.pool.network) + 1; !ip && n < toN(offer.pool.network) + 2 ** (32 - bits) - 1; n++) {
    const cand = fromN(n);
    if (!excluded(cand) && !owner(ph, cand) && cand !== offer.gw.ip) ip = cand;
  }
  if (!ip) return;
  Object.assign(f, { ip, mask: offer.pool.mask });
  ph.gateway = offer.pool.router?.[0] ?? null;
  Object.assign(st, { leased: true, tftp: offer.pool.options?.[150] ?? null, server: offer.server });
  dropLease(ph);
  const srv = offer.from.dhcp;
  (srv.leases ??= []).push({ ip, mac: ph.mac, clientId: true, pool: Object.keys(srv.pools).find((k) => srv.pools[k] === offer.pool), days: offer.pool.lease ?? 1 });
}

function renew(dev) {
  const h = dev.host, f = own(dev);
  if (!h.dhcp) return "\nWindows IP Configuration\n\nThe operation failed as no adapter is in the state permissible for\nthis operation.";
  const offer = portAdmit(dev) ? dhcpOffer(dev) : null;
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
  // each snooping switch where the client came in on an untrusted port
  // records the binding (DAI checks ARPs against it)
  for (const hop of offer.path ?? []) {
    const sn = hop.sw.snooping;
    if (!sn?.enabled || !sn.vlans.includes(hop.vlan) || !hop.entry || hop.entry.snoopTrust) continue;
    sn.bindings = (sn.bindings ?? []).filter((b) => b.mac !== dev.mac);
    sn.bindings.push({ mac: dev.mac, ip, vlan: hop.vlan, iface: hop.entry.name, lease: (offer.pool.lease ?? 1) * 86400 });
  }
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

// the router that dropped the PC's packet answers with ICMP unreachable if
// it can route the answer back: { at, why } (why: route, acl-in, acl-out),
// or null when the packet is just lost. Read right after the reaches()
// that failed, which records the drop
function netUnreachable(dev, ip) {
  const d = dev.host.atGateway && dev.host.drop;
  if (!d || !d.at || d.quiet || pathFrom(d.router, own(dev).ip) === null) return null;
  return { at: d.at, why: d.why };
}
// the routers a PC's trace gets answers from before the break
function hopsBefore(dev, ip, u) {
  const d = dev.host.atGateway && dev.host.drop;
  const cut = u ?? (d?.at ? { at: d.at, why: d.why } : null);
  const r = gatewayRouter(dev);
  if (!dev.host.gw || !reaches(dev, dev.host.gw)) return [];
  return upTo([dev.host.gw, ...(r ? partial(r, ip, own(dev).ip) : [])], cut);
}

// a router on the way that has not ARPed for its next hop yet drops the
// first echo while it waits: the first router (1 = the gateway) that does,
// or 0. It ARPs as it goes, so the next ping loses nothing.
function arpGap(dev, ip, commit, stopAt = null) {
  if (local(dev, ip)) return 0;
  const hops = hopsTo(dev, ip);
  let gap = 0;
  for (let k = 0; k < hops.length - 1; k++) {
    const r = owner(dev, hops[k])?.device;
    // a router that dropped the packet never forwarded it, so it ARPed for nothing
    if (stopAt && r === stopAt) break;
    if (!r || !ROUTER(r)) continue;
    const next = hops[k + 1];
    const out = Object.values(r.interfaces).find((x) => x.ip && x.mask && network(x.ip, maskBits(x.mask)) === network(next, maskBits(x.mask)));
    if (out?.name.startsWith("Serial")) continue;
    if (!(r.arped ?? []).includes(next) && !r.arpLearned?.[next]) {
      if (!gap) gap = k + 1;
      if (commit) {
        (r.arped ??= []).push(next);
        // the router it ARPed learns it back from the request
        const o = owner(dev, next);
        const mine = Object.values(r.interfaces).find((x) => x.ip && x.mask && network(x.ip, maskBits(x.mask)) === network(next, maskBits(x.mask)));
        if (o && ROUTER(o.device) && mine) (o.device.arpLearned ??= {})[mine.ip] = { mac: r.mac, iface: o.iface.name };
      }
    }
  }
  return gap;
}
// n echoes of which the first dies at router gap: the routers before it see
// all n, the one that drops it receives all n but sends n - 1, and every one
// after it, and the replies, count n - 1
const lossy = (n, gap) => ({
  go: (...a) => ({ ...ICMP.go(...a), count: n, countAt: (s, dir) => { const i = s + 1; return !gap || i < gap || (i === gap && dir === "in") ? n : n - 1; } }),
  back: (...a) => ({ ...ICMP.back(...a), count: gap ? n - 1 : n }),
});
// ping from a PC: the path first (did it work, and does a router on it still
// have to ARP), then the echoes themselves
function pcPing(dev, ip, count) {
  const gap = count > 1 ? arpGap(dev, ip, false) : 0;
  const ok = reaches(dev, ip, true, lossy(count, gap));
  // the ARPs on the way happen whether or not the ping gets through
  arpGap(dev, ip, true, ok ? null : dev.host.drop?.router ?? null);
  return { ok, lost: ok && gap ? 1 : 0 };
}

function pingWin(dev, target, count) {
  const r = lookup(dev, target);
  if (r.error) return `Ping request could not find host ${target}. Please check the name and try again.`;
  const f = own(dev);
  if (noRoute(dev, r.ip)) return `\nPinging ${r.ip} with 32 bytes of data:\n${"PING: transmit failed. General failure.\n".repeat(count)}\nPing statistics for ${r.ip}:\n    Packets: Sent = ${count}, Received = 0, Lost = ${count} (100% loss),`;
  const { ok, lost } = pcPing(dev, r.ip, count);
  const head = r.name ? `\nPinging ${r.name} [${r.ip}] with 32 bytes of data:` : `\nPinging ${r.ip} with 32 bytes of data:`;
  // Windows counts an unreachable answer as received (an ACL's
  // administratively prohibited is left as a timeout here)
  if (!ok && arpFails(dev, r.ip)) return [head, ...Array(count).fill(`Reply from ${f.ip}: Destination host unreachable.`), `\nPing statistics for ${r.ip}:\n    Packets: Sent = ${count}, Received = ${count}, Lost = 0 (0% loss),`].join("\n");
  const u = !ok && netUnreachable(dev, r.ip);
  if (u?.why === "route") return [head, ...Array(count).fill(`Reply from ${u.at}: Destination net unreachable.`), `\nPing statistics for ${r.ip}:\n    Packets: Sent = ${count}, Received = ${count}, Lost = 0 (0% loss),`].join("\n");
  const lines = Array.from({ length: count }, (_, i) => (ok && i >= lost ? `Reply from ${r.ip}: bytes=32 time${i === lost ? "=2ms" : "<1ms"} TTL=${ttl(dev, r.ip)}` : "Request timed out."));
  const got = ok ? count - lost : 0;
  const stats = `\nPing statistics for ${r.ip}:\n    Packets: Sent = ${count}, Received = ${got}, Lost = ${count - got} (${Math.round(((count - got) * 100) / count)}% loss),`;
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
  const found = !ok && netUnreachable(dev, r.ip);
  const u = found?.why === "route" ? found : null;
  // the routers before the break answer their hops; the one that reports
  // net unreachable answers its own hop first, then reports on the next
  const hops = ok ? hopsTo(dev, r.ip) : hopsBefore(dev, r.ip, found || null);
  reaches(dev, r.ip, false, traced(ICMP, ok ? hops.length : hops.length + 1, 0));
  const ms = (i) => (i === 0 ? "<1 ms" : `${i} ms`).padStart(9);
  const rows = hops.map((h, i) => `${String(i + 1).padStart(3)}${ms(i)}${ms(i)}${ms(i)}  ${h}`);
  if (u) return [`\nTracing route to ${r.name ? `${r.name} [${r.ip}]` : r.ip}`, "over a maximum of 30 hops:", "", ...rows, `${String(rows.length + 1).padStart(3)}  ${u.at}  reports: Destination net unreachable.`, "", "Trace complete."].join("\n");
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
      if (args.includes("-6") || target.includes(":")) return ping6Host(dev, target, count);
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
    case "ssh":
      return sshClient(dev, words.slice(1), "windows");
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
  syncIpv6(dev.lab?.all);
  const v6 = up && own(dev).ipv6?.[0];
  if (v6) eth.push(`    inet6 ${v6s(v6.addr)}/${v6.bits} scope global ${h.slaac ? "dynamic mngtmpaddr noprefixroute" : ""}`.trimEnd(), h.slaac ? "       valid_lft 2591998sec preferred_lft 604798sec" : "       valid_lft forever preferred_lft forever");
  eth.push(`    inet6 ${linkLocal(dev)}/64 scope link`, "       valid_lft forever preferred_lft forever");
  return [...lo, ...eth].join("\n");
}

function ipRoute6(dev) {
  syncIpv6(dev.lab?.all);
  const h = dev.host, v6 = own(dev).ipv6?.[0];
  if (!linkUp(dev)) return "";
  const proto = h.slaac ? "ra" : "static";
  return [
    ...(v6 ? [`${v6s(ipv6Network(v6.addr, v6.bits))}/${v6.bits} dev eth0 proto ${h.slaac ? "ra" : "kernel"} metric 100 ${h.slaac ? "expires 2591998sec " : ""}pref medium`] : []),
    "fe80::/64 dev eth0 proto kernel metric 1024 pref medium",
    ...(h.gw6 ? [`default via ${v6s(h.gw6)} dev eth0 proto ${proto} metric 100 ${h.slaac ? "expires 1798sec " : ""}pref medium`] : []),
  ].join("\n");
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
    ...((v6) => (v6 && up ? [`        inet6 ${v6s(v6.addr)}  prefixlen ${v6.bits}  scopeid 0x0<global>`] : []))((syncIpv6(dev.lab?.all), own(dev).ipv6?.[0])),
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
  const failed = dev.host.arpFailed ?? [];
  if (style === "neigh") return [...rows.map((a) => `${a.ip} dev eth0 lladdr ${macLinux(a.mac)} REACHABLE`), ...failed.map((ip) => `${ip} dev eth0 FAILED`)].join("\n");
  if (style === "a") return [...rows.map((a) => `? (${a.ip}) at ${macLinux(a.mac)} [ether] on eth0`), ...failed.map((ip) => `? (${ip}) at <incomplete> on eth0`)].join("\n");
  return ["Address                  HWtype  HWaddress           Flags Mask            Iface", ...rows.map((a) => `${a.ip.padEnd(25)}ether   ${macLinux(a.mac)}   C                     eth0`), ...failed.map((ip) => `${ip.padEnd(25)}        (incomplete)                              eth0`)].join("\n");
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
  const { ok, lost } = pcPing(dev, r.ip, count);
  const shown = r.name ? `${r.name} (${r.ip})` : `${r.ip} (${r.ip})`;
  if (!ok && arpFails(dev, r.ip)) {
    if (mac) return [`PING ${r.name ?? r.ip} (${r.ip}): 56 data bytes`, ...Array.from({ length: count }, (_, i) => `Request timeout for icmp_seq ${i}${i < count - 1 ? "\nping: sendto: Host is down" : ""}`), "", `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, 0 packets received, 100.0% packet loss`].join("\n");
    return [`PING ${shown} 56(84) bytes of data.`, ...Array.from({ length: count }, (_, i) => `From ${f.ip} icmp_seq=${i + 1} Destination Host Unreachable`), "", `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, 0 received, +${count} errors, 100% packet loss, time ${count === 1 ? 0 : (count - 1) * 1000 + 27}ms`, ...(count > 1 ? [`pipe ${Math.min(count, 3)}`] : [])].join("\n");
  }
  const u = !ok && netUnreachable(dev, r.ip);
  // an ACL's administratively prohibited: Linux "Packet filtered", macOS "Communication prohibited by filter"
  const why = u && (u.why === "route" ? "Destination Net Unreachable" : mac ? "Communication prohibited by filter" : "Packet filtered");
  if (u && mac) return [`PING ${r.name ?? r.ip} (${r.ip}): 56 data bytes`, ...Array.from({ length: count }, (_, i) => `92 bytes from ${u.at}: ${why}\nVr HL TOS  Len   ID Flg  off TTL Pro  cks      Src      Dst\n 4  5  00 5400 ${(0x6a1c + i).toString(16)}   0 0000  3f  01 ${(0xb12f - i).toString(16)} ${f.ip}  ${r.ip}\n`), `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, 0 packets received, 100.0% packet loss`].join("\n");
  if (u) return [`PING ${shown} 56(84) bytes of data.`, ...Array.from({ length: count }, (_, i) => `From ${u.at} icmp_seq=${i + 1} ${why}`), "", `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, 0 received, +${count} errors, 100% packet loss, time ${count === 1 ? 0 : (count - 1) * 1000 + 3}ms`].join("\n");
  // the first echo lost to a router's ARP: Linux skips its sequence number, macOS reports the timeout
  const replies = ok ? Array.from({ length: count }, (_, i) => (i < lost ? (mac ? `Request timeout for icmp_seq ${i}` : null) : mac ? `64 bytes from ${r.ip}: icmp_seq=${i} ttl=${ttl(dev, r.ip)} time=1.${2 + i}04 ms` : `64 bytes from ${r.name ? shown : r.ip}: icmp_seq=${i + 1} ttl=${ttl(dev, r.ip)} time=1.${2 + i}4 ms`)).filter(Boolean) : mac ? Array.from({ length: count }, (_, i) => `Request timeout for icmp_seq ${i}`) : [];
  const got = ok ? count - lost : 0;
  const loss = Math.round(((count - got) * 1000) / count) / 10;
  if (mac) return [`PING ${r.name ?? r.ip} (${r.ip}): 56 data bytes`, ...replies, "", `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, ${got} packets received, ${loss.toFixed(1)}% packet loss`, ...(got ? ["round-trip min/avg/max/stddev = 1.204/1.354/1.504/0.112 ms"] : [])].join("\n");
  return [`PING ${shown} 56(84) bytes of data.`, ...replies, "", `--- ${r.name ?? r.ip} ping statistics ---`, `${count} packets transmitted, ${got} received, ${Math.round(loss)}% packet loss, time ${count === 1 ? 0 : (count - 1) * 1000 + 3}ms`, ...(got ? [`rtt min/avg/max/mdev = 1.214/1.364/1.514/0.112 ms`] : [])].join("\n");
}

function traceUnix(dev, target, mac) {
  const r = lookup(dev, target);
  if (r.error) return mac ? `traceroute: unknown host ${target}` : `${target}: Name or service not known\nCannot handle "host" cmdline arg \`${target}' on position 1 (argc 1)`;
  if (noRoute(dev, r.ip)) return mac ? "traceroute: findsaddr: failed to connect to peer for src addr selection." : `traceroute to ${r.ip} (${r.ip}), 30 hops max, 60 byte packets\nconnect: Network is unreachable`;
  const ok = reaches(dev, r.ip, false, TRACE);
  const u = !ok && netUnreachable(dev, r.ip);
  const hops = ok ? hopsTo(dev, r.ip) : hopsBefore(dev, r.ip, u);
  reaches(dev, r.ip, false, traced(TRACE, ok ? hops.length : hops.length + 1, 0));
  const rows = hops.map((h, i) => ` ${i + 1}  ${h} (${h})  ${i + 1}.${i}12 ms  ${i + 1}.${i}05 ms  ${i + 1}.${i}01 ms`);
  // traceroute marks the hop that answers unreachable: !N no route, !X administratively prohibited
  const mark = u?.why === "route" ? "!N" : "!X";
  if (u) rows.push(` ${rows.length + 1}  ${u.at} (${u.at})  ${rows.length + 1}.204 ms ${mark}  ${rows.length + 1}.188 ms ${mark}  ${rows.length + 1}.173 ms ${mark}`);
  else if (!ok) rows.push(` ${rows.length + 1}  * * *`);
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
      // ip -6 addr / ip -6 route: the IPv6 side only
      const six = args[0] === "-6";
      if (six) args.shift();
      const obj = args[0] ?? "";
      const rest = args.slice(1).filter((w) => w !== "show" && w !== "list");
      if (six && ["r", "ro", "rou", "rout", "route"].includes(obj)) return ipRoute6(dev);
      if (six && ["a", "ad", "add", "addr", "addre", "addres", "address"].includes(obj)) return ipAddr(dev).split("\n").filter((l, i, all) => !/^\s+inet /.test(l) && !(/valid_lft/.test(l) && /^\s+inet /.test(all[i - 1] ?? ""))).filter((l) => !/link\/(ether|loopback)/.test(l)).join("\n");
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
    case "ping6":
    case "ping": {
      const target = targetOf(args, ["-c"]);
      const more = args.includes("-c") ? "" : "\n(ping runs until Ctrl+C on Linux; stopped after 4 here - use ping -c 4)";
      if (target && (cmd === "ping6" || args.includes("-6") || target.includes(":"))) return ping6Host(dev, target, countOf(args, "-c", 4)) + more;
      return target ? pingUnix(dev, target, countOf(args, "-c", 4)) + more : "ping: usage error: Destination address required";
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
    case "ssh":
      return sshClient(dev, words.slice(1), "linux");
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
    ...((v6) => (v6 && up ? [`\tinet6 ${v6s(v6.addr)} prefixlen ${v6.bits} ${dev.host.slaac ? "autoconf secured" : ""}`.trimEnd()] : []))((syncIpv6(dev.lab?.all), own(dev).ipv6?.[0])),
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
      if (a === "-a" || a === "-an") return [...dev.host.arp.map((x) => `? (${x.ip}) at ${macMacShort(x.mac)} on en0 ifscope [ethernet]`), ...(dev.host.arpFailed ?? []).map((ip) => `? (${ip}) at (incomplete) on en0 ifscope [ethernet]`)].join("\n");
      if (/^-a?d/.test(a)) return (dev.host.arp = []), "";
      return "usage: arp [-n] [-i interface] hostname\n       arp [-n] [-i interface] [-l] -a";
    case "ping6": {
      const target = targetOf(args, ["-c"]);
      return target ? ping6Host(dev, target, countOf(args, "-c", 4)) + (args.includes("-c") ? "" : "\n(ping6 runs until Ctrl+C on macOS; stopped after 4 here - use ping6 -c 4)") : "usage: ping6 [-DdfHmnNoqtvwW] [-c count] host";
    }
    case "ping": {
      const target = targetOf(args, ["-c"]);
      if (target?.includes(":")) return `ping: cannot resolve ${target}: Unknown host`;
      return target ? pingUnix(dev, target, countOf(args, "-c", 4), true) + (args.includes("-c") ? "" : "\n(ping runs until Ctrl+C on macOS; stopped after 4 here - use ping -c 4)") : "usage: ping [-AaDdfnoQqRrv] [-c count] host";
    }
    case "traceroute":
      return args.length ? traceUnix(dev, args[args.length - 1], true) : "Version 1.4a12+Darwin\nUsage: traceroute [-adDeFInrSvx] host [packetsize]";
    case "nslookup":
      return nslookup(dev, args[0], args[1], true);
    case "dig":
      return dig(dev, args.filter((w) => !w.startsWith("@") && !w.startsWith("+"))[0]);
    case "ssh":
      return sshClient(dev, words.slice(1), "mac");
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

// --- ipv6 on a PC --------------------------------------------------------------------------------

// router advertisements: a router on the PC's segment with ipv6 unicast-routing
// advertises the /64s of that interface, from its link-local address
function routerAdverts(dev) {
  if (!linkUp(dev)) return [];
  return segment(dev).filter((n) => ROUTER6(n.device) && n.device.ipv6Routing && v6Up(n.device, n.iface)).flatMap((n) => {
    const ll = expandIpv6(n.iface.ipv6LinkLocal ?? eui64("fe80::", n.device.mac));
    return n.iface.ipv6.filter((a) => a.bits === 64 && !a.addr.startsWith("fe80")).map((a) => ({ prefix: ipv6Network(a.addr, 64), router: a.addr, ll, device: n.device }));
  });
}
// the interface ID a PC puts after a SLAAC prefix: Linux EUI-64 from its MAC,
// Windows and macOS a random-looking one (fixed per MAC here)
function slaacAddr(dev, prefix) {
  if (dev.host.os === "linux") return eui64(prefix, dev.mac);
  let h = 2166136261;
  for (const ch of dev.mac + dev.host.os) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const g = [h >>> 16, h & 0xffff, Math.imul(h, 2654435761) >>> 16, (Math.imul(h, 40503) >>> 0) & 0xffff].map((x) => x.toString(16).padStart(4, "0"));
  return [...expandIpv6(prefix).split(":").slice(0, 4), ...g].join(":");
}
// the PCs' addresses and default routes, worked out again from what the
// routers advertise now (a static gateway may be the router's link-local)
export function syncIpv6(all = []) {
  syncRouterSlaac(all);
  for (const dev of all) {
    const h = dev.host;
    if (!h || (!h.slaac && !h.ipv6Static)) continue;
    const f = own(dev);
    const ras = routerAdverts(dev);
    let addr = h.ipv6Static, via = null, ll = null;
    if (h.slaac) {
      const ra = ras[0];
      addr = ra ? { addr: slaacAddr(dev, ra.prefix), bits: 64 } : null;
      via = ra?.router ?? null;
      ll = ra?.ll ?? null;
    } else if (h.gateway6) {
      // a link-local gateway is reached as that router's address on the segment
      const hit = h.gateway6.startsWith("fe80") ? ras.find((r) => r.ll === h.gateway6) : null;
      via = hit ? hit.router : h.gateway6;
      ll = h.gateway6;
    }
    f.ipv6 = addr ? [addr] : [];
    f.ipv6Enabled = true;
    h.gw6 = ll;
    dev.ipv6Routes = via ? [{ addr: expandIpv6("::"), bits: 0, via, ad: 1 }] : [];
  }
}
const v6s = (a) => compressIpv6(a).toLowerCase();
// a router interface with ipv6 address autoconfig takes the prefix the router at
// the other end advertises (EUI-64, as IOS does) and, with default, a default
// route to it (ND); kept apart from the configured addresses (auto, nd)
function syncRouterSlaac(all) {
  const routers = all.filter((d) => ROUTER6(d) && !d.host);
  for (const d of routers) {
    d.ipv6Routes = d.ipv6Routes.filter((r) => !r.nd);
    for (const f of Object.values(d.interfaces)) f.ipv6 = f.ipv6.filter((a) => !a.auto);
  }
  for (const d of routers) {
    for (const f of Object.values(d.interfaces)) {
      if (!f.ipv6Auto || status(d, f)[1] !== "up") continue;
      const end = far(d, f.name);
      const r = end?.device, g = end?.iface;
      if (!r || !g || !ROUTER6(r) || !r.ipv6Routing || !v6Up(r, g)) continue;
      const a = g.ipv6.find((x) => x.bits === 64 && !x.auto && !x.addr.startsWith("fe80"));
      if (!a) continue;
      f.ipv6.push({ addr: eui64(ipv6Network(a.addr, 64), d.mac), bits: 64, auto: true });
      if (f.ipv6AutoDefault) d.ipv6Routes.push({ addr: expandIpv6("::"), bits: 0, via: a.addr, ll: expandIpv6(g.ipv6LinkLocal ?? eui64("fe80::", r.mac)), out: f.name, ad: 2, nd: true });
    }
  }
}
const pcV6 = (dev) => own(dev).ipv6?.find((a) => !a.addr.startsWith("fe80"))?.addr ?? null;
// a ping from a PC to an IPv6 address: out through its first hop (on its own
// segment), and back
function reach6(dev, ip) {
  syncIpv6(dev.lab?.all);
  const src = pcV6(dev);
  if (!src || !linkUp(dev)) return { ok: false, noRoute: true };
  const best = best6(dev, ip);
  if (!best) return { ok: false, noRoute: true };
  const hop = best.via ?? ip;
  const seg = segment(dev);
  if (!seg.some((n) => n.iface.ipv6?.some((a) => a.addr === hop))) return { ok: false };
  const path = path6(dev, ip);
  const t = owner6(dev, ip)?.device;
  return { ok: path !== null && Boolean(t) && path6(t, src) !== null, path };
}
function ping6Host(dev, text, count) {
  const os = dev.host.os;
  const ip = expandIpv6(text);
  const shown = ip ? v6s(ip) : text;
  const r = ip ? reach6(dev, ip) : { ok: false, noRoute: true };
  const src = pcV6(dev);
  if (os === "windows") {
    if (r.noRoute) return `\nPinging ${shown} with 32 bytes of data:\n${"PING: transmit failed. General failure.\n".repeat(count)}\nPing statistics for ${shown}:\n    Packets: Sent = ${count}, Received = 0, Lost = ${count} (100% loss),`;
    const lines = Array.from({ length: count }, (_, i) => (r.ok ? `Reply from ${shown}: time${i === 0 ? "=1ms" : "<1ms"}` : "Request timed out."));
    return [`\nPinging ${shown} with 32 bytes of data:`, ...lines, `\nPing statistics for ${shown}:\n    Packets: Sent = ${count}, Received = ${r.ok ? count : 0}, Lost = ${r.ok ? 0 : count} (${r.ok ? 0 : 100}% loss),${r.ok ? "\nApproximate round trip times in milli-seconds:\n    Minimum = 0ms, Maximum = 1ms, Average = 0ms" : ""}`].join("\n");
  }
  if (os === "mac") {
    if (r.noRoute) return "ping6: UDP connect: No route to host";
    const lines = r.ok ? Array.from({ length: count }, (_, i) => `16 bytes from ${shown}, icmp_seq=${i} hlim=64 time=0.${512 + i * 37} ms`) : Array.from({ length: count }, (_, i) => `Request timeout for icmp_seq=${i}`);
    return [`PING6(56=40+8+8 bytes) ${v6s(src)} --> ${shown}`, ...lines, "", `--- ${shown} ping6 statistics ---`, `${count} packets transmitted, ${r.ok ? count : 0} packets received, ${r.ok ? "0.0" : "100.0"}% packet loss`, ...(r.ok ? ["round-trip min/avg/max/std-dev = 0.512/0.567/0.623/0.041 ms"] : [])].join("\n");
  }
  if (r.noRoute) return "ping: connect: Network is unreachable";
  const lines = r.ok ? Array.from({ length: count }, (_, i) => `64 bytes from ${shown}: icmp_seq=${i + 1} ttl=64 time=0.${4 + i}21 ms`) : [];
  return [`PING ${shown}(${shown}) 56 data bytes`, ...lines, "", `--- ${shown} ping statistics ---`, `${count} packets transmitted, ${r.ok ? count : 0} received, ${r.ok ? 0 : 100}% packet loss, time ${count === 1 ? 0 : (count - 1) * 1000 + 3}ms`, ...(r.ok ? ["rtt min/avg/max/mdev = 0.421/0.571/0.721/0.112 ms"] : [])].join("\n");
}
// for the labs' checks: does this PC's IPv6 ping get there and back
export const canReach6 = (dev, ip) => Boolean(expandIpv6(ip) && reach6(dev, expandIpv6(ip)).ok);

// --- ipv6 from a router ------------------------------------------------------------------------------

// connected prefixes on interfaces that are up, and static routes whose next
// hop is on one of them (or that name an exit interface that is up)
const v6Up = (d, f) => f?.ipv6?.length && status(d, f)[1] === "up";
const owns6 = (d, ip) => Object.values(d.interfaces).some((f) => v6Up(d, f) && f.ipv6.some((a) => a.addr === ip));
function owner6(dev, ip) {
  for (const d of dev.lab?.all ?? []) for (const f of Object.values(d.interfaces)) if (v6Up(d, f) && f.ipv6.some((a) => a.addr === ip)) return { device: d, iface: f };
  return null;
}
function table6(d) {
  const out = [];
  for (const f of Object.values(d.interfaces)) if (v6Up(d, f)) for (const a of f.ipv6) out.push({ net: ipv6Network(a.addr, a.bits), bits: a.bits, code: "C", out: f.name, ad: 0 });
  for (const r of d.ipv6Routes ?? []) {
    const conn = r.via && out.find((c) => c.code === "C" && ipv6Network(r.via, c.bits) === c.net);
    if (r.out ? v6Up(d, d.interfaces[r.out]) : conn) out.push({ net: ipv6Network(r.addr, r.bits), bits: r.bits, code: "S", via: r.via, out: r.out ?? conn.out, ad: r.ad ?? 1 });
  }
  return out;
}
// the device a route's next hop belongs to: a global address anywhere, or a
// link-local one on the far side of the route's exit interface
function hop6(router, r) {
  if (!r.via?.startsWith("fe80")) return owner6(router, r.via);
  const ll = (d, f) => expandIpv6(f.ipv6LinkLocal ?? eui64("fe80::", d.mac));
  const near = r.out && far(router, r.out);
  if (near?.iface && ll(near.device, near.iface) === r.via && v6Up(near.device, near.iface)) return { device: near.device, iface: near.iface };
  if (!near || !isSwitch(near.device)) return null;
  for (const [port, end] of Object.entries(near.device.links)) {
    const d = end.device, f = d.interfaces[end.iface];
    if (d !== router && port !== near.name && f && v6Up(d, f) && ll(d, f) === r.via) return { device: d, iface: f };
  }
  return null;
}
const best6 = (d, ip) => table6(d).filter((r) => ipv6Network(ip, r.bits) === r.net).sort((a, b) => b.bits - a.bits || a.ad - b.ad)[0];
const ROUTER6 = (d) => d.type === "router" || d.type === "l3switch";
// hop by hop; a router other than the sender forwards only with ipv6 unicast-routing
function path6(router, ip, seen = new Set(), sender = true) {
  if (owns6(router, ip)) return [];
  if (seen.has(router) || seen.size > 15 || (!sender && !router.ipv6Routing)) return null;
  seen.add(router);
  const best = best6(router, ip);
  if (!best) return null;
  if (best.code === "C" && !best.via) return owner6(router, ip) ? [ip] : null;
  const o = hop6(router, best);
  if (!o || !ROUTER6(o.device)) return null;
  const rest = path6(o.device, ip, seen, false);
  if (rest === null) return null;
  const shown = best.via.startsWith("fe80") ? o.iface.ipv6.find((a) => !a.addr.startsWith("fe80"))?.addr ?? best.via : best.via;
  return owns6(o.device, ip) ? [ip] : [shown, ...rest];
}
// a ping or traceroute to an IPv6 address from a router: the hops, and
// whether the reply finds its way back to the exit interface's address
export function fromRouter6(router, ip) {
  if (!router.lab?.all) return null;
  syncIpv6(router.lab.all);
  if (owns6(router, ip)) return { ok: true, hops: [ip] };
  const best = best6(router, ip);
  if (!best) return { ok: false, noRoute: true, hops: [] };
  const src = router.interfaces[best.out]?.ipv6.find((a) => !a.addr.startsWith("fe80"))?.addr;
  const path = path6(router, ip);
  const t = owner6(router, ip)?.device;
  const ok = path !== null && Boolean(t && src && path6(t, src) !== null);
  // a traceroute gets answers up to the last router that can route back
  const hops = ok ? path : (path ?? []).filter((h) => { const o = owner6(router, h); return o && src && path6(o.device, src) !== null; }).slice(0, -1);
  return { ok, hops };
}

// --- ntp -------------------------------------------------------------------------------------------

// where a device gets its time: its own ntp master, or the first server it
// reaches over UDP 123 that has time itself (a router synced in turn, a
// server, or a host beyond the drawn network); its stratum is one more
export function ntpSync(dev, depth = 0) {
  if (dev.ntp.master) return { stratum: dev.ntp.master, ref: "127.127.1.1" };
  if (!dev.ntp.servers.length || depth > 4) return null;
  // a device on its own, outside a lab, has nothing to check against
  if (!dev.lab?.all) return { stratum: 2, ref: dev.ntp.servers[0].ip, server: dev.ntp.servers[0].ip, peer: 1, peerRef: ".GPS." };
  const servers = [...dev.ntp.servers].sort((a, b) => Number(b.prefer) - Number(a.prefer));
  for (const sv of servers) {
    if (!fromRouter(dev, sv.ip, udp(123))?.ok) continue;
    const t = owner(dev, sv.ip)?.device;
    const up = !t ? (dev.lab.extern?.includes(sv.ip) ? { stratum: 1, ref: ".GPS." } : null) : t.type === "server" ? { stratum: 1, ref: ".GPS." } : t.ntp ? ntpSync(t, depth + 1) : null;
    if (up) return { stratum: up.stratum + 1, ref: sv.ip, server: sv.ip, peer: up.stratum, peerRef: up.ref };
  }
  return null;
}

// --- remote sessions -------------------------------------------------------------------------------

// a telnet or SSH session from a PC or a router to ip: does it get there and
// back as TCP, and do the target's vty lines take it (transport input, RSA
// keys for SSH, access-class against the real source address, a login)
// one AAA server: does it answer this router (reachable on its port, the
// right key, and it runs the service)? accept/reject if so, error if not
function askServer(router, kind, srv, user) {
  if (!srv?.address) return "error";
  const svc = owner(router, srv.address)?.device?.aaaService;
  const r = fromRouter(router, srv.address, kind === "tacacs" ? tcp(srv.port ?? 49) : udp(srv.auth ?? 1812));
  if (!r?.ok || !svc?.[kind] || svc[kind] !== srv.key) return "error";
  return !user || (svc.users ?? []).includes(user) ? "accept" : "reject";
}
export function aaaServerUp(router, kind, srv) {
  return askServer(router, kind, srv) !== "error";
}
// a login method list, tried in order: a method that errors (no server
// answers, an empty local database) passes to the next one; one that
// answers decides, so a server's reject is final
function aaaLogin(t, v, user) {
  const list = v.loginAuth ?? "default";
  const ms = t.aaa.login[list] ?? (list === "default" ? ["local"] : null);
  if (!ms) return { result: "aaa-fail" };
  const servers = (g) => {
    if (g === "tacacs+") return Object.values(t.aaa.tacacs).map((s) => ["tacacs", s]);
    if (g === "radius") return Object.values(t.aaa.radius).map((s) => ["radius", s]);
    const grp = t.aaa.groups[g];
    if (!grp) return [];
    const kind = grp.type === "radius" ? "radius" : "tacacs";
    return grp.servers.map((n) => [kind, t.aaa[kind][n]]);
  };
  for (const m of ms) {
    if (m.startsWith("group ")) {
      for (const [kind, srv] of servers(m.slice(6))) {
        const r = askServer(t, kind, srv, user);
        if (r === "accept") return { result: "ok", local: true, via: kind };
        if (r === "reject") return { result: "aaa-reject", via: kind };
      }
      continue;
    }
    if (m === "local" || m === "local-case") {
      if (!Object.keys(t.users).length) continue;
      return !user || t.users[user] ? { result: "ok", local: true, via: "local" } : { result: "aaa-reject", via: "local" };
    }
    if (m === "enable") {
      if (t.enableSecret || t.enablePassword) return { result: "ok", via: "enable" };
      continue;
    }
    if (m === "line") {
      if (v.password) return { result: "ok", via: "line" };
      continue;
    }
    if (m === "none") return { result: "ok", via: "none" };
  }
  return { result: "aaa-fail" };
}

export function vtySession(dev, ip, proto, user) {
  const port = proto === "ssh" ? 22 : 23;
  let src;
  if (dev.host) {
    if (!reaches(dev, ip, false, tcp(port))) return { result: "timeout" };
    src = own(dev).ip;
  } else {
    const r = fromRouter(dev, ip, tcp(port));
    if (r && !r.ok) return { result: "timeout" };
    src = r?.src;
  }
  const t = owner(dev, ip)?.device;
  const v = t?.lines?.vty;
  if (!v || t.host) return { result: "refused" };
  if (!v.transport.includes(proto)) return { result: "refused" };
  if (proto === "ssh" && !(t.rsa >= (t.sshVersion === 2 ? 768 : 360))) return { result: "refused" };
  if (v.accessClass && src && !aclAllows(t, v.accessClass, { proto: "tcp", src, dst: ip, sport: 49152, dport: port })) return { result: "refused" };
  // with aaa new-model the method list decides, not login / login local
  if (t.aaa?.newModel) return aaaLogin(t, v, user);
  if (!v.loginLocal && !v.password) return { result: "nopass" };
  // SSH needs a username: a line password alone is not enough
  if (proto === "ssh" && !v.loginLocal) return { result: "noauth" };
  return { result: "ok", local: v.loginLocal };
}

// ssh user@host, ssh -l user host (OpenSSH on all three systems)
function sshClient(dev, words, os) {
  let user = dev.host.user, target = null;
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "-l") user = words[++i];
    else if (!words[i].startsWith("-")) target = words[i];
  }
  if (!target) return "usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address]\n           [-c cipher_spec] [-D [bind_address:]port] [-E log_file]\n           [-e escape_char] [-F configfile] [-I pkcs11] [-i identity_file]\n           [-J destination] [-L address] [-l login_name] [-m mac_spec]\n           [-O ctl_cmd] [-o option] [-P tag] [-p port] [-R address]\n           [-S ctl_path] [-W host:port] [-w local_tun[:remote_tun]]\n           destination [command [argument ...]]";
  if (target.includes("@")) [user, target] = [target.slice(0, target.lastIndexOf("@")), target.slice(target.lastIndexOf("@") + 1)];
  const r = lookup(dev, target);
  if (r.error) return `ssh: Could not resolve hostname ${target.toLowerCase()}: ${os === "windows" ? "No such host is known." : os === "mac" ? "nodename nor servname provided, or not known" : "Name or service not known"}`;
  const s = vtySession(dev, r.ip, "ssh", user);
  if (s.result === "timeout") return `ssh: connect to host ${r.ip} port 22: ${os === "mac" ? "Operation timed out" : "Connection timed out"}`;
  if (s.result === "refused") return `ssh: connect to host ${r.ip} port 22: Connection refused`;
  if (s.result === "aaa-fail" || s.result === "aaa-reject") return `${user}@${r.ip}'s password:\nPermission denied, please try again.\n${user}@${r.ip}'s password:\nPermission denied, please try again.\n${user}@${r.ip}'s password:\n${user}@${r.ip}: Permission denied (password).`;
  if (s.result !== "ok") return `${user}@${r.ip}'s password:\nPermission denied, please try again.\n(the router has no username to check it against: login local)`;
  return `${user}@${r.ip}'s password:\n(the remote session itself is not simulated here)`;
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
  linux: ["ip", "ifconfig", "arp", "ping", "ping6", "traceroute", "tracepath", "nslookup", "dig", "resolvectl", "cat", "hostname", "clear"],
  mac: ["ifconfig", "netstat", "scutil", "arp", "ping", "ping6", "traceroute", "nslookup", "dig", "hostname", "clear"],
};

// tab completes the command name only, as a shell does
export function hostComplete(dev, typed) {
  if (/\s/.test(typed.trim()) || !typed.trim()) return typed;
  const hits = WORDS[dev.host.os].filter((w) => w.startsWith(typed.trim().toLowerCase()));
  return hits.length === 1 ? hits[0] + " " : typed;
}
