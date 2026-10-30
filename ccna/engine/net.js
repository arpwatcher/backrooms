// What two configured ends of a link would agree on: whether a trunk comes
// up, whether an EtherChannel bundles, who the OSPF neighbours are, which
// switch is the STP root and which router is HSRP active. All worked out
// from the configurations, so show commands and lab checks can use them.

import { parseIp, maskBits, network, wildcardMatch } from "./ip.js";
import { isSub, parentOf } from "./iface.js";

export function far(dev, name) {
  const end = dev.links[isSub(name) ? parentOf(name) : name];
  if (!end) return null;
  return { device: end.device, iface: end.device.interfaces[end.iface], name: end.iface };
}

export function adminUp(dev, f) {
  if (!f || f.shutdown) return false;
  if (isSub(f.name)) return !dev.interfaces[parentOf(f.name)]?.shutdown;
  return true;
}

// line up / protocol up, as show ip interface brief would print them
export function status(dev, f) {
  if (f.shutdown) return ["administratively down", "down"];
  if (isSub(f.name)) {
    const parent = dev.interfaces[parentOf(f.name)];
    if (parent?.shutdown) return ["down", "down"];
    const s = status(dev, parent);
    return s;
  }
  if (f.name.startsWith("Loopback")) return ["up", "up"];
  if (f.name.startsWith("Vlan")) {
    const id = Number(f.name.slice(4));
    if (!dev.vlans[id]) return ["down", "down"];
    const carrying = Object.values(dev.interfaces).some((p) => p.switchport && !p.channel && status(dev, p)[0] === "up" && carries(dev, p, id));
    return carrying ? ["up", "up"] : ["up", "down"];
  }
  if (f.name.startsWith("Port-channel")) {
    const members = Object.values(dev.interfaces).filter((m) => m.channel?.group === Number(f.name.slice(12)));
    return members.some((m) => bundled(dev, m)) ? ["up", "up"] : ["down", "down"];
  }
  const end = far(dev, f.name);
  if (!end || !end.iface) return ["down", "down"];
  if (end.iface.shutdown) return ["down", "down"];
  if (f.errdisabled) return ["down", "down"];
  return ["up", "up"];
}

// --- trunking (DTP) --------------------------------------------------------------------------

// the mode the port actually ends up in: "access", "trunk" or "down"
export function operMode(dev, f) {
  if (!f.switchport) return "routed";
  if (f.mode === "access") return "access";
  const end = far(dev, f.name);
  const other = end?.iface;
  const otherMode = other ? (other.switchport === false || end.device.type === "router" ? "router" : other.mode) : null;
  if (f.mode === "trunk") {
    // a trunk facing a router's subinterfaces still trunks
    return "trunk";
  }
  // dynamic auto / desirable: negotiates with the far end
  if (!otherMode || otherMode === "router" || otherMode === "access") return "access";
  if (other.nonegotiate) return "access";
  if (otherMode === "trunk") return "trunk";
  if (f.mode === "dynamic desirable" || otherMode === "dynamic desirable") return "trunk";
  return "access";
}

export function allowed(f) {
  return f.allowed ?? null;
}

// does this switchport carry a vlan (access in it, or trunk allowing it)?
export function carries(dev, f, vlan) {
  const m = operMode(dev, f);
  if (m === "access") return f.accessVlan === vlan || f.voiceVlan === vlan;
  if (m === "trunk") return !f.allowed || f.allowed.includes(vlan);
  return false;
}

// a trunk both ends agree on (and their native vlans)
export function trunkPair(dev, name) {
  const f = dev.interfaces[name];
  const end = far(dev, name);
  if (!f || !end?.iface) return null;
  const a = operMode(dev, f), b = end.device.type === "router" ? "router" : operMode(end.device, end.iface);
  return { local: a, remote: b, nativeMatch: b === "router" || f.nativeVlan === end.iface.nativeVlan };
}

// --- etherchannel ------------------------------------------------------------------------------

const LACP = ["active", "passive"], PAGP = ["desirable", "auto"];
export function protocolOf(mode) {
  return LACP.includes(mode) ? "LACP" : PAGP.includes(mode) ? "PAgP" : "-";
}
function compatible(a, b) {
  if (a === "on" || b === "on") return a === "on" && b === "on";
  if (LACP.includes(a) && LACP.includes(b)) return a === "active" || b === "active";
  if (PAGP.includes(a) && PAGP.includes(b)) return a === "desirable" || b === "desirable";
  return false;
}
// is this member port bundled into its port-channel?
export function bundled(dev, f) {
  if (!f.channel || f.shutdown) return false;
  const end = far(dev, f.name);
  if (!end?.iface?.channel || end.iface.shutdown) return false;
  if (!compatible(f.channel.mode, end.iface.channel.mode)) return false;
  // a member must match its port-channel (mode, vlan, native, allowed), at
  // both ends; one that differs is suspended and the others stay bundled
  return !suspended(dev, f) && !suspended(end.device, end.iface);
}
const sameL2 = (x, y) => x.mode === y.mode && x.accessVlan === y.accessVlan && x.nativeVlan === y.nativeVlan && JSON.stringify(x.allowed) === JSON.stringify(y.allowed);
// a member whose settings differ from its port-channel's
export function suspended(dev, f) {
  const po = f.channel && dev.interfaces[`Port-channel${f.channel.group}`];
  return Boolean(po && po.switchport && !sameL2(f, po));
}

// --- ospf -----------------------------------------------------------------------------------------------

// which ospf process and area an interface is in, if any
export function ospfOf(dev, f) {
  if (!f || !f.ip) return null;
  if (f.ospf.pid && dev.ospf[f.ospf.pid]) return { pid: f.ospf.pid, area: f.ospf.area };
  for (const [pid, p] of Object.entries(dev.ospf)) {
    for (const n of p.networks) if (wildcardMatch(f.ip, n.net, n.wild)) return { pid: Number(pid), area: n.area };
  }
  return null;
}

export function passive(dev, pid, name) {
  const p = dev.ospf[pid];
  if (!p) return false;
  return p.passiveDefault ? !(p.notPassive ?? []).includes(name) : p.passive.includes(name);
}

export function routerId(dev, pid) {
  const p = dev.ospf[pid];
  if (p?.routerId) return p.routerId;
  const ips = (filter) => Object.values(dev.interfaces).filter(filter).map((f) => f.ip).filter(Boolean);
  const pick = (list) => list.sort((a, b) => parseIp(b) - parseIp(a))[0];
  return pick(ips((f) => f.name.startsWith("Loopback") && !f.shutdown)) ?? pick(ips((f) => status(dev, f)[1] === "up")) ?? "0.0.0.0";
}

const timers = (f) => {
  const p2p = f.ospf.network === "point-to-point" || f.name.startsWith("Serial");
  const hello = f.ospf.hello ?? 10;
  return { hello, dead: f.ospf.dead ?? (f.ospf.hello ? hello * 4 : 40), p2p };
};

// the ospf neighbours this device would see, one per link
export function ospfNeighbors(dev) {
  const out = [];
  for (const f of Object.values(dev.interfaces)) {
    const mine = ospfOf(dev, f);
    if (!mine || passive(dev, mine.pid, f.name) || status(dev, f)[1] !== "up") continue;
    // a router-on-a-stick subinterface or a routed port: who is on the far end?
    const end = far(dev, f.name);
    if (!end) continue;
    const peerDev = end.device;
    // the far end may itself be a switch; look through it to a router on
    // the same subnet (one hop, enough for these labs)
    const candidates = peerDev.type === "switch" ? Object.values(peerDev.links).map((l) => ({ device: l.device, iface: l.device.interfaces[l.iface] })).filter((x) => x.device !== dev) : [{ device: peerDev, iface: end.iface }];
    for (const cand of candidates) {
      const pd = cand.device;
      for (const g of Object.values(pd.interfaces)) {
        if (!g.ip || (cand.iface && g !== cand.iface && !(isSub(g.name) && parentOf(g.name) === cand.iface?.name) && pd.type !== "l3switch")) continue;
        const theirs = ospfOf(pd, g);
        if (!theirs || passive(pd, theirs.pid, g.name) || status(pd, g)[1] !== "up") continue;
        const bits = maskBits(f.mask);
        if (bits !== maskBits(g.mask) || network(f.ip, bits) !== network(g.ip, bits) || f.ip === g.ip) continue;
        const problems = [];
        if (mine.area !== theirs.area) problems.push("area");
        const a = timers(f), b = timers(g);
        if (a.hello !== b.hello || a.dead !== b.dead) problems.push("timers");
        const ridA = routerId(dev, mine.pid), ridB = routerId(pd, theirs.pid);
        if (ridA === ridB) problems.push("router-id");
        out.push({ device: pd, iface: f, theirIface: g, rid: ridB, ip: g.ip, up: problems.length === 0, problems, p2p: a.p2p && b.p2p, priority: g.ospf.priority ?? 1, myPriority: f.ospf.priority ?? 1, myRid: ridA });
      }
    }
  }
  return out;
}

// DR/BDR on a two-router segment: highest priority, then highest router id
export function role(n) {
  if (n.p2p) return "-";
  const them = { pri: n.priority, rid: parseIp(n.rid) };
  const me = { pri: n.myPriority, rid: parseIp(n.myRid) };
  if (them.pri === 0 && me.pri === 0) return "DROTHER";
  const theyWin = them.pri !== me.pri ? them.pri > me.pri : them.rid > me.rid;
  if (them.pri === 0) return "DROTHER";
  return theyWin ? "DR" : "BDR";
}

// ospf cost: reference bandwidth (100 Mb/s by default) over the interface's
// bandwidth, unless set with ip ospf cost
export function ospfCost(dev, f) {
  if (f.ospf.cost) return f.ospf.cost;
  const o = ospfOf(dev, f);
  const ref = (o && dev.ospf[o.pid]?.refBw) || 100;
  const bw = f.bandwidth ?? (f.name.startsWith("Gigabit") ? 1000000 : f.name.startsWith("Fast") ? 100000 : f.name.startsWith("Serial") ? 1544 : f.name.startsWith("Loopback") ? 8000000 : 100000);
  return Math.max(1, Math.floor((ref * 1000) / bw));
}

// the routes a router learns over ospf, worked out from the adjacencies that
// are really up: shortest path by cost to every router, then every network
// those routers have in ospf (loopbacks as /32), and a default from a router
// that originates one
export function ospfRoutes(dev) {
  if (!Object.keys(dev.ospf).length) return [];
  const dist = new Map([[dev, 0]]);
  const first = new Map();
  const todo = [dev];
  while (todo.length) {
    todo.sort((a, b) => dist.get(a) - dist.get(b));
    const d = todo.shift();
    for (const n of ospfNeighbors(d)) {
      if (!n.up) continue;
      const c = dist.get(d) + ospfCost(d, n.iface);
      if (!dist.has(n.device) || c < dist.get(n.device)) {
        dist.set(n.device, c);
        first.set(n.device, d === dev ? { via: n.ip, out: n.iface.name } : first.get(d));
        if (!todo.includes(n.device)) todo.push(n.device);
      }
    }
  }
  const up = (d) => Object.values(d.interfaces).filter((f) => f.ip && status(d, f)[1] === "up");
  const connected = new Set(up(dev).map((f) => `${network(f.ip, maskBits(f.mask))}/${maskBits(f.mask)}`));
  const myAreas = new Set(up(dev).map((f) => ospfOf(dev, f)?.area).filter((a) => a !== undefined));
  const best = new Map();
  const offer = (r) => {
    const key = `${r.net}/${r.bits}`;
    if (connected.has(key)) return;
    if (!best.has(key) || r.metric < best.get(key).metric) best.set(key, r);
  };
  for (const [r, d0] of dist) {
    if (r === dev) continue;
    const hop = first.get(r);
    for (const f of up(r)) {
      const o = ospfOf(r, f);
      if (!o) continue;
      const bits = f.name.startsWith("Loopback") && f.ospf.network !== "point-to-point" ? 32 : maskBits(f.mask);
      offer({ code: myAreas.has(o.area) ? "O" : "O IA", net: network(f.ip, bits), bits, ad: 110, metric: d0 + ospfCost(r, f), via: hop.via, out: hop.out });
    }
    for (const p of Object.values(r.ospf)) {
      const hasDefault = r.routes.some((x) => x.net === "0.0.0.0" && x.mask === "0.0.0.0");
      if (p.defaultOriginate && (p.defaultOriginate === "always" || hasDefault)) offer({ code: "O*E2", net: "0.0.0.0", bits: 0, ad: 110, metric: 1, via: hop.via, out: hop.out });
    }
  }
  return [...best.values()];
}

// --- spanning tree --------------------------------------------------------------------------------------

export function bridgePriority(dev, vlan) {
  return (dev.stp.vlans[vlan]?.priority ?? 32768) + vlan;
}

// the root among every switch reachable over links (lowest priority, then mac)
export function stpRoot(dev, vlan) {
  const seen = new Set();
  const queue = [dev];
  const switches = [];
  while (queue.length) {
    const d = queue.shift();
    if (seen.has(d)) continue;
    seen.add(d);
    if (d.type !== "router") switches.push(d);
    for (const l of Object.values(d.links)) if (l.device.type !== "router") queue.push(l.device);
  }
  switches.sort((a, b) => bridgePriority(a, vlan) - bridgePriority(b, vlan) || a.mac.localeCompare(b.mac));
  return switches[0];
}

// a port's STP cost: configured, or by speed (short or long method)
export function stpCost(dev, f, vlan) {
  const set = f.stp.vlan[vlan]?.cost ?? f.stp.cost;
  if (set) return set;
  const long = dev.stp.pathcost === "long";
  // a port-channel costs less than one member: two Gig links cost 3, two
  // FastEthernet links 12 (short method), or 20000000 / Mbps (long method)
  if (f.name.startsWith("Port-channel")) {
    const group = Number(f.name.slice(12));
    const up = Object.values(dev.interfaces).filter((m) => m.channel?.group === group && bundled(dev, m));
    if (!up.length) return long ? 20000 : 4;
    const gig = up.every((m) => linkGig(dev, m));
    const n = up.length;
    if (long) return Math.round(20000000 / (n * (gig ? 1000 : 100)));
    return gig ? (n >= 8 ? 1 : n >= 4 ? 2 : n >= 2 ? 3 : 4) : (n >= 4 ? 8 : n === 3 ? 9 : n === 2 ? 12 : 19);
  }
  const gig = linkGig(dev, f);
  return long ? (gig ? 20000 : 200000) : gig ? 4 : 19;
}
// a link runs at the slower end's speed
const linkGig = (dev, f) => f.name.startsWith("Gig") && !far(dev, f.name)?.iface?.name.startsWith("Fast");
// the port number in a port ID (a 2960's G0/1 is port 25, Port-channel1 is 65)
export function stpPortNumber(f) {
  if (f.name.startsWith("Port-channel")) return 64 + Number(f.name.slice(12));
  const n = Number(f.name.split("/").pop()) || 0;
  return f.name.startsWith("Gig") && !f.name.startsWith("GigabitEthernet0/0") ? 24 + n : n;
}
const portId = (f) => (f.stp.priority ?? 128) * 4096 + stpPortNumber(f);
const lessBid = (a, b, v) => bridgePriority(a, v) - bridgePriority(b, v) || a.mac.localeCompare(b.mac);

// every switch port's role and state for one VLAN, worked out the way 802.1D
// does: root path costs, a root port per switch (lowest cost, then lowest
// neighbor bridge ID, then lowest neighbor port ID), and on each link the
// side with the better root path is designated; what is left blocks
// the far end of a link, where a port-channel is reached through a bundled
// member and ends at the far switch's port-channel
function channelFar(d, f) {
  if (!f.name.startsWith("Port-channel")) return far(d, f.name);
  const group = Number(f.name.slice(12));
  const m = Object.values(d.interfaces).find((x) => x.channel?.group === group && bundled(d, x));
  const end = m && far(d, m.name);
  const po = end?.iface?.channel && end.device.interfaces[`Port-channel${end.iface.channel.group}`];
  return po ? { device: end.device, iface: po } : null;
}
export function stpPorts(dev, vlan) {
  const root = stpRoot(dev, vlan);
  const isSwitch = (d) => d.type === "switch" || d.type === "l3switch";
  const ports = (d) => Object.values(d.interfaces).filter((f) => f.switchport && !f.channel && status(d, f)[0] === "up" && carries(d, f, vlan));
  const peerOf = (d, f) => {
    const end = channelFar(d, f);
    return end?.device && isSwitch(end.device) && end.iface && end.iface.switchport && carries(end.device, end.iface, vlan) ? end : null;
  };
  // root path cost of every switch (Dijkstra over the ports' costs)
  const dist = new Map([[root, 0]]);
  const todo = [root];
  while (todo.length) {
    todo.sort((a, b) => dist.get(a) - dist.get(b));
    const d = todo.shift();
    for (const f of ports(d)) {
      const end = peerOf(d, f);
      if (!end) continue;
      const c = dist.get(d) + stpCost(end.device, end.iface, vlan);
      if (!dist.has(end.device) || c < dist.get(end.device)) {
        dist.set(end.device, c);
        if (!todo.includes(end.device)) todo.push(end.device);
      }
    }
  }
  const rootPort = (d) => {
    if (d === root || !dist.has(d)) return null;
    let best = null;
    for (const f of ports(d)) {
      const end = peerOf(d, f);
      if (!end || !dist.has(end.device)) continue;
      const k = { cost: dist.get(end.device) + stpCost(d, f, vlan), via: end.device, theirs: portId(end.iface), ours: portId(f) };
      const order = best && (k.cost - best.k.cost || lessBid(k.via, best.k.via, vlan) || k.theirs - best.k.theirs || k.ours - best.k.ours);
      if (!best || order < 0) best = { f, k };
    }
    return best?.f ?? null;
  };
  const mine = rootPort(dev);
  return {
    root, cost: dist.get(dev) ?? 0, rootPort: mine,
    ports: ports(dev).map((f) => {
      const end = peerOf(dev, f);
      if (f === mine) return { f, role: "Root", state: "FWD" };
      if (!end) return { f, role: "Desg", state: "FWD" };
      // designated: the better (cost, bridge ID, port ID) side of the link
      const me = [dist.get(dev) ?? Infinity, dev, portId(f)];
      const them = [dist.get(end.device) ?? Infinity, end.device, portId(end.iface)];
      const iWin = me[0] !== them[0] ? me[0] < them[0] : me[1] !== them[1] ? lessBid(me[1], them[1], vlan) < 0 : me[2] < them[2];
      return iWin ? { f, role: "Desg", state: "FWD" } : { f, role: "Altn", state: "BLK" };
    }),
  };
}

// --- hsrp -----------------------------------------------------------------------------------------------

// all routers in the lab with this group's virtual ip, best first
export function hsrpRanking(dev, groupIp, all) {
  const members = [];
  for (const d of all) {
    for (const f of Object.values(d.interfaces)) {
      for (const [g, grp] of Object.entries(f.hsrp.groups)) {
        if (grp.ip === groupIp && !f.shutdown) members.push({ device: d, iface: f, group: Number(g), priority: grp.priority, preempt: grp.preempt, ip: f.ip });
      }
    }
  }
  members.sort((a, b) => b.priority - a.priority || parseIp(b.ip ?? "0.0.0.0") - parseIp(a.ip ?? "0.0.0.0"));
  return members;
}
