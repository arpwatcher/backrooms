// A lab: devices, the links between them, the tasks, and the checks that say
// whether each task is done. Checks look at the configuration (and what the
// two ends of a link agree on), never at the exact words typed, so any
// correct way of doing a task passes - as in the exam.

import { createDevice, exec, apply, prompt } from "./device.js";
import { normalize } from "./iface.js";
import { maskBits, network, parseIp } from "./ip.js";
import { status, operMode, bundled, ospfNeighbors, stpRoot, hsrpRanking, ospfOf, passive, routerId, carries, far } from "./net.js";
import { routeTable, cost } from "./show.js";
import { makeHost, canReach, vtySession } from "./host.js";

export function buildLab(def) {
  const devices = {};
  for (const d of def.devices) {
    const dev = createDevice({ name: d.name, type: d.type, hostname: d.hostname ?? (d.keepDefaultName ? undefined : d.name), ports: d.ports, mac: d.mac });
    dev.lab = { learned: def.learned?.[d.name], macs: def.macs?.[d.name], bindings: def.bindings?.[d.name], arp: def.arp?.[d.name], natTranslations: def.natTranslations?.[d.name], lease: def.lease?.[d.name], extern: def.extern ?? [] };
    if (d.ip) {
      const [ip, bits] = d.ip.split("/");
      const f = Object.values(dev.interfaces)[0];
      f.ip = ip;
      f.mask = maskOf(Number(bits));
      dev.gateway = d.gateway ?? null;
    }
    devices[d.name] = dev;
  }
  for (const [a, ai, b, bi] of def.links ?? []) {
    const A = devices[a], B = devices[b];
    const an = normalize(ai), bn = normalize(bi);
    if (!A || !B || !A.interfaces[an] || !B.interfaces[bn]) throw new Error(`lab ${def.id}: bad link ${a} ${ai} - ${b} ${bi}`);
    A.links[an] = { device: B, iface: bn };
    B.links[bn] = { device: A, iface: an };
  }
  const all = Object.values(devices);
  for (const dev of all) dev.lab.all = all;
  // PCs with an operating system get a terminal of their own
  for (const d of def.devices) if (d.os) makeHost(devices[d.name], d, def);
  for (const d of def.devices) if (d.setup?.length) apply(devices[d.name], d.setup);
  // a PC that starts with a lease is in its server's bindings too
  for (const dev of all) {
    const h = dev.host, f = h && Object.values(dev.interfaces)[0];
    if (!h?.leased || !h.dhcpServer || !f?.ip) continue;
    const srv = all.find((x) => Object.values(x.interfaces).some((i) => i.ip === h.dhcpServer))?.dhcp;
    const pool = srv && Object.keys(srv.pools).find((k) => srv.pools[k].network && srv.pools[k].network === network(f.ip, maskBits(srv.pools[k].mask)));
    if (pool) (srv.leases ??= []).push({ ip: f.ip, mac: dev.mac, clientId: h.os !== "linux", pool, days: srv.pools[pool].lease ?? 1 });
  }
  // ports that start err-disabled (a port-security or bpduguard story)
  for (const [name, ports] of Object.entries(def.errdisabled ?? {})) for (const p of ports) devices[name].interfaces[normalize(p)].errdisabled = true;
  return { def, devices, answers: {} };
}

const maskOf = (bits) => {
  const n = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
};

// the helpers a check gets
export function tools(lab) {
  const D = (name) => {
    const d = lab.devices[name];
    if (!d) throw new Error(`no device ${name}`);
    return d;
  };
  const F = (name, ifname) => D(name).interfaces[normalize(ifname) ?? ifname] ?? null;
  const t = {
    dev: D,
    f: F,
    // the address on an interface as "a.b.c.d/nn", or null
    ip: (name, ifname) => {
      const f = F(name, ifname);
      return f?.ip ? `${f.ip}/${maskBits(f.mask)}` : null;
    },
    up: (name, ifname) => {
      const f = F(name, ifname);
      return Boolean(f) && status(D(name), f)[1] === "up";
    },
    enabled: (name, ifname) => Boolean(F(name, ifname)) && !F(name, ifname).shutdown,
    // did they type (something that meant) this command? the canonical text
    // has every keyword written out in full
    ran: (name, re, mode) => D(name).ran.some((r) => (!mode || r.mode === mode) && re.test(r.text)),
    routes: (name) => routeTable(D(name)),
    route: (name, net, bits, code) => routeTable(D(name)).find((r) => r.net === net && r.bits === bits && (!code || r.code === code)) ?? null,
    statics: (name) => D(name).routes,
    neighbors: (name) => ospfNeighbors(D(name)),
    ospfAdj: (a, b) => ospfNeighbors(D(a)).some((n) => n.up && n.device === D(b)),
    ospfOf: (name, ifname) => ospfOf(D(name), F(name, ifname)),
    passive: (name, pid, ifname) => passive(D(name), pid, normalize(ifname)),
    routerId: (name, pid) => routerId(D(name), pid),
    cost: (name, ifname) => cost(D(name), F(name, ifname)),
    oper: (name, ifname) => operMode(D(name), F(name, ifname)),
    carries: (name, ifname, vlan) => carries(D(name), F(name, ifname), vlan),
    bundled: (name, ifname) => bundled(D(name), F(name, ifname)),
    root: (name, vlan) => stpRoot(D(name), vlan) === D(name),
    hsrpActive: (name, vip) => hsrpRanking(D(name), vip, Object.values(lab.devices))[0]?.device === D(name),
    hsrp: (name, vip) => hsrpRanking(D(name), vip, Object.values(lab.devices)),
    acl: (name, id) => D(name).acls[String(id)] ?? null,
    // a PC's ping to ip would get there and back
    reach: (name, ip) => canReach(D(name), ip),
    // a telnet or ssh session from a device: "ok", "refused", "timeout",
    // "nopass" or "noauth"
    session: (name, ip, proto = "ssh") => vtySession(D(name), ip, proto).result,
    network, maskBits, parseIp,
  };
  return t;
}

// run every check; a check returns true, or a message saying what is wrong
export function checkLab(lab) {
  const t = tools(lab);
  return lab.def.tasks.map((task, i) => {
    let result;
    // what was typed or picked in the task's answer box, if it has one
    t.reply = String(lab.answers?.[i] ?? "").trim();
    try {
      result = task.check(t);
    } catch (e) {
      result = `check failed: ${e.message}`;
    }
    return { text: task.text, ok: result === true, why: result === true ? null : typeof result === "string" ? result : "Not done yet." };
  });
}

// type the model answer into every device (used by the tests and "show me")
export function runSolution(lab) {
  const outputs = [];
  // "PC1#2" is a second turn on PC1, after the devices listed before it
  for (const [key, lines] of Object.entries(lab.def.solution ?? {})) {
    const name = key.split("#")[0];
    const dev = lab.devices[name];
    for (const line of lines) outputs.push({ name, line, prompt: prompt(dev), out: exec(dev, line) });
  }
  Object.assign(lab.answers, lab.def.answers ?? {});
  return outputs;
}
