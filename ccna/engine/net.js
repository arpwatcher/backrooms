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
  // members must match: same mode, vlan, native, allowed
  const same = (x, y) => x.mode === y.mode && x.accessVlan === y.accessVlan && x.nativeVlan === y.nativeVlan && JSON.stringify(x.allowed) === JSON.stringify(y.allowed);
  const siblings = Object.values(dev.interfaces).filter((m) => m.channel?.group === f.channel.group);
  return siblings.every((m) => same(m, f));
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
