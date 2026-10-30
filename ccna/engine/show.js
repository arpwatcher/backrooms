// The show commands: output in IOS's own layout, worked out from the
// device's configuration (and, through net.js, from the far end of links).

import { sortedInterfaces } from "./state.js";
import { maskBits, network, parseIp, compressIpv6, ipv6Network } from "./ip.js";
import { short, isSub, compare } from "./iface.js";
import { runningConfig, aceText, rangeText } from "./config.js";
import { status, operMode, far, bundled, protocolOf, ospfNeighbors, ospfOf, passive, routerId, role, stpRoot, bridgePriority, hsrpRanking, carries, stpPorts, stpCost, stpPortNumber, ospfCost, ospfRoutes } from "./net.js";

const pad = (s, n) => String(s).padEnd(n);

function ipIntBrief(dev) {
  const rows = [`${pad("Interface", 23)}${pad("IP-Address", 16)}OK? Method Status                Protocol`];
  for (const f of sortedInterfaces(dev)) {
    if (f.name.startsWith("Vlan") && dev.type === "router") continue;
    const [st, pr] = status(dev, f);
    const ip = f.ip ?? (f.dhcp ? "unassigned" : "unassigned");
    const method = f.ip ? "manual" : f.dhcp ? "DHCP" : "unset";
    rows.push(`${pad(f.name, 23)}${pad(ip, 16)}${pad("YES", 4)}${pad(method, 7)}${pad(st, 22)}${pr}`);
  }
  return rows.join("\n");
}

function interfaces(dev, name) {
  const list = name ? [dev.interfaces[name]].filter(Boolean) : sortedInterfaces(dev);
  if (!list.length) return "% Invalid input detected at '^' marker.";
  return list
    .map((f) => {
      const [st, pr] = status(dev, f);
      const hw = f.name.startsWith("Gigabit") ? "Gigabit Ethernet" : f.name.startsWith("Fast") ? "Fast Ethernet" : f.name.startsWith("Serial") ? "HD64570" : f.name.startsWith("Loopback") ? "Loopback" : f.name.startsWith("Vlan") ? "EtherSVI" : "EtherChannel";
      const bw = f.bandwidth ?? (f.name.startsWith("Gigabit") ? 1000000 : f.name.startsWith("Fast") ? 100000 : f.name.startsWith("Serial") ? 1544 : f.name.startsWith("Loopback") ? 8000000 : 1000000);
      const lines = [`${f.name} is ${st}, line protocol is ${pr}${st === "up" && pr === "up" && f.switchport ? " (connected)" : st !== "up" && f.switchport ? " (notconnect)" : ""}`];
      lines.push(`  Hardware is ${hw}, address is ${dev.mac} (bia ${dev.mac})`);
      if (f.description) lines.push(`  Description: ${f.description}`);
      if (f.ip) lines.push(`  Internet address is ${f.ip}/${maskBits(f.mask)}`);
      lines.push(`  MTU ${f.mtu ?? 1500} bytes, BW ${bw} Kbit/sec, DLY 10 usec,`);
      lines.push("     reliability 255/255, txload 1/255, rxload 1/255");
      lines.push(`  Encapsulation ${f.encap ? `802.1Q Virtual LAN, Vlan ID  ${f.encap.vlan}` : f.name.startsWith("Serial") ? "HDLC" : "ARPA"}, loopback not set`);
      if (!f.name.startsWith("Loopback") && !f.name.startsWith("Vlan")) {
        const speed = f.speed === "auto" ? (f.name.startsWith("Gigabit") ? "1000Mb/s" : "100Mb/s") : `${f.speed}Mb/s`;
        const duplex = f.duplex === "auto" ? "Full-duplex" : f.duplex === "full" ? "Full-duplex" : "Half-duplex";
        lines.push(`  ${duplex}, ${speed}, media type is 10/100/1000BaseTX`);
      }
      lines.push("  5 minute input rate 0 bits/sec, 0 packets/sec", "     0 packets input, 0 bytes, 0 no buffer", "     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored", "     0 packets output, 0 bytes, 0 underruns", "     0 output errors, 0 collisions, 0 interface resets");
      return lines.join("\n");
    })
    .join("\n");
}

function switchportInfo(dev, name) {
  const f = dev.interfaces[name];
  if (!f || !f.switchport) return `Name: ${short(name)}\nSwitchport: Disabled`;
  const oper = operMode(dev, f);
  const admin = f.mode === "access" ? "static access" : f.mode === "trunk" ? "trunk" : f.mode;
  return [
    `Name: ${short(f.name)}`,
    "Switchport: Enabled",
    `Administrative Mode: ${admin}`,
    `Operational Mode: ${oper === "access" && f.mode === "access" ? "static access" : oper === "trunk" ? "trunk" : oper === "access" ? "static access" : "down"}`,
    `Administrative Trunking Encapsulation: ${f.trunkEncap}`,
    `Operational Trunking Encapsulation: ${oper === "trunk" ? "dot1q" : "native"}`,
    `Negotiation of Trunking: ${f.nonegotiate ? "Off" : "On"}`,
    `Access Mode VLAN: ${f.accessVlan} (${dev.vlans[f.accessVlan]?.name ?? "Inactive"})`,
    `Trunking Native Mode VLAN: ${f.nativeVlan} (${dev.vlans[f.nativeVlan]?.name ?? "Inactive"})`,
    `Voice VLAN: ${f.voiceVlan ?? "none"}`,
    `Trunking VLANs Enabled: ${f.allowed ? rangeText(f.allowed) || "NONE" : "ALL"}`,
    "Pruning VLANs Enabled: 2-1001",
  ].join("\n");
}

function trunks(dev) {
  const t = sortedInterfaces(dev).filter((f) => f.switchport && !f.channel && status(dev, f)[0] === "up" && operMode(dev, f) === "trunk");
  // a bundled port-channel shows instead of its members
  const pos = sortedInterfaces(dev).filter((f) => f.name.startsWith("Port-channel") && status(dev, f)[0] === "up" && (f.mode === "trunk"));
  const all = [...t, ...pos];
  if (!all.length) return "";
  const rows = [`${pad("Port", 10)}${pad("Mode", 13)}${pad("Encapsulation", 14)}${pad("Status", 14)}Native vlan`];
  for (const f of all) rows.push(`${pad(short(f.name), 10)}${pad(f.mode === "trunk" ? "on" : f.mode.replace("dynamic ", ""), 13)}${pad(f.trunkEncap === "negotiate" ? "n-802.1q" : "802.1q", 14)}${pad("trunking", 14)}${f.nativeVlan}`);
  rows.push("", `${pad("Port", 10)}Vlans allowed on trunk`);
  for (const f of all) rows.push(`${pad(short(f.name), 10)}${f.allowed ? rangeText(f.allowed) || "none" : "1-4094"}`);
  rows.push("", `${pad("Port", 10)}Vlans allowed and active in management domain`);
  for (const f of all) rows.push(`${pad(short(f.name), 10)}${rangeText(Object.keys(dev.vlans).map(Number).filter((v) => v < 1002 && (!f.allowed || f.allowed.includes(v))).sort((a, b) => a - b))}`);
  rows.push("", `${pad("Port", 10)}Vlans in spanning tree forwarding state and not pruned`);
  for (const f of all) rows.push(`${pad(short(f.name), 10)}${rangeText(Object.keys(dev.vlans).map(Number).filter((v) => v < 1002 && (!f.allowed || f.allowed.includes(v))).sort((a, b) => a - b))}`);
  return rows.join("\n");
}

function intStatus(dev, errOnly) {
  const rows = [`${pad("Port", 10)}${pad("Name", 19)}${pad("Status", 13)}${pad("Vlan", 11)}${pad("Duplex", 7)}${pad("Speed", 7)}Type`];
  for (const f of sortedInterfaces(dev).filter((f) => /^(Fast|Gigabit)Ethernet|^Port-channel/.test(f.name) && (!errOnly || f.errdisabled))) {
    const [st] = status(dev, f);
    const s = f.shutdown ? "disabled" : f.errdisabled ? "err-disabled" : st === "up" ? "connected" : "notconnect";
    const vlan = !f.switchport ? "routed" : operMode(dev, f) === "trunk" ? "trunk" : String(f.accessVlan);
    rows.push(`${pad(short(f.name), 10)}${pad((f.description ?? "").slice(0, 18), 19)}${pad(s, 13)}${pad(vlan, 11)}${pad(f.duplex === "auto" ? "a-full" : f.duplex, 7)}${pad(f.speed === "auto" ? (f.name.startsWith("Gig") ? "a-1000" : "a-100") : f.speed, 7)}10/100BaseTX`);
  }
  return rows.join("\n");
}

function vlanBrief(dev, full) {
  const rows = [`${pad("VLAN", 5)}${pad("Name", 33)}${pad("Status", 10)}Ports`, `${"-".repeat(4)} ${"-".repeat(32)} ${"-".repeat(9)} ${"-".repeat(31)}`];
  const ids = Object.keys(dev.vlans).map(Number).sort((a, b) => a - b);
  for (const id of [...ids.filter((v) => v < 1002), 1002, 1003, 1004, 1005]) {
    const v = dev.vlans[id] ?? { name: { 1002: "fddi-default", 1003: "token-ring-default", 1004: "fddinet-default", 1005: "trnet-default" }[id] };
    const ports = sortedInterfaces(dev)
      .filter((f) => f.switchport && !f.channel && /^(Fast|Gigabit)Ethernet|^Port-channel/.test(f.name) && operMode(dev, f) !== "trunk" && (f.accessVlan === id || f.voiceVlan === id))
      .map((f) => short(f.name));
    const chunks = [];
    for (let i = 0; i < ports.length; i += 4) chunks.push(ports.slice(i, i + 4).join(", "));
    rows.push(`${pad(id, 5)}${pad(v.name, 33)}${pad(id >= 1002 ? "act/unsup" : "active", 10)}${chunks[0] ?? ""}`);
    for (const c of chunks.slice(1)) rows.push(`${" ".repeat(48)}${c}`);
  }
  if (full) rows.push("", "VLAN Type  SAID       MTU   Parent RingNo BridgeNo Stp  BrdgMode Trans1 Trans2", ...ids.filter((v) => v < 1002).map((v) => `${pad(v, 5)}enet  ${pad(100000 + v, 11)}1500  -      -      -        -    -        0      0`));
  return rows.join("\n");
}

function macTable(dev) {
  const rows = ["          Mac Address Table", "-------------------------------------------", "", "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----"];
  const entries = dev.lab?.macs ?? [];
  for (const m of entries) rows.push(`${pad(m.vlan, 8)}${pad(m.mac, 18)}${pad(m.type ?? "DYNAMIC", 12)}${m.port}`);
  // sticky / static port-security addresses
  for (const f of Object.values(dev.interfaces)) for (const mac of f.ps.macs) rows.push(`${pad(f.accessVlan, 8)}${pad(mac, 18)}${pad("STATIC", 12)}${short(f.name)}`);
  rows.push(`Total Mac Addresses for this criterion: ${entries.length}`);
  return rows.join("\n");
}

const CODES = `Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP
       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area
       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2
       E1 - OSPF external type 1, E2 - OSPF external type 2, E - EGP
       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area
       * - candidate default, U - per-user static route, o - ODR
       P - periodic downloaded static route`;

// every route this device would have, as { code, net, bits, ad, metric, via, out }
export function routeTable(dev) {
  const routes = [];
  if (dev.type !== "router" && !dev.ipRouting) return routes;
  for (const f of sortedInterfaces(dev)) {
    if (status(dev, f)[1] !== "up") continue;
    for (const a of [f.ip ? { ip: f.ip, mask: f.mask } : null, ...f.secondaries].filter(Boolean)) {
      const bits = maskBits(a.mask);
      routes.push({ code: "C", net: network(a.ip, bits), bits, out: f.name });
      if (bits < 32) routes.push({ code: "L", net: a.ip, bits: 32, out: f.name });
    }
  }
  const usable = (r) => {
    if (r.out) return status(dev, dev.interfaces[r.out])[1] === "up";
    return routes.some((c) => c.code === "C" && network(r.via, c.bits) === c.net);
  };
  // statics and ospf compete per prefix: the lowest distance goes in (equal
  // distances share it), so a floating static waits behind ospf
  const candidates = dev.routes.filter(usable).map((r) => ({ code: "S", net: r.net, bits: maskBits(r.mask), ad: r.ad, metric: 0, via: r.via, out: r.out }));
  if (Object.keys(dev.ospf).length) {
    candidates.push(...ospfRoutes(dev).map((r) => ({ ...r, ad: Object.values(dev.ospf)[0].distance ?? 110 })));
    // what the lab says is learned from beyond the part that is drawn
    if (dev.lab?.learned && ospfNeighbors(dev).some((n) => n.up)) candidates.push(...dev.lab.learned.map((l) => ({ code: "O", net: l.net, bits: l.bits, ad: 110, metric: l.metric ?? 2, via: l.via, out: l.out })));
  }
  const winner = new Map();
  for (const r of candidates) {
    const key = `${r.net}/${r.bits}`;
    if (routes.some((c) => (c.code === "C" || c.code === "L") && `${c.net}/${c.bits}` === key)) continue;
    const w = winner.get(key);
    if (!w || r.ad < w.ad) winner.set(key, { ad: r.ad, list: [r] });
    else if (r.ad === w.ad && r.code === "S" && w.list[0].code === "S") w.list.push(r);
  }
  for (const w of winner.values()) routes.push(...w.list);
  return routes;
}

function ipRoute(dev, args) {
  const routes = routeTable(dev);
  if (dev.type !== "router" && !dev.ipRouting) return dev.defaultGateway ? `Default gateway is ${dev.defaultGateway}\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty` : "Default gateway is not set\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty";
  if (args?.net) {
    const best = routes.filter((r) => network(args.net, r.bits) === r.net).sort((a, b) => b.bits - a.bits)[0];
    if (!best) return "% Network not in table";
    return `Routing entry for ${best.net}/${best.bits}\n  Known via "${{ C: "connected", L: "connected", S: "static", O: "ospf 1" }[best.code]}", distance ${best.ad ?? 0}, metric ${best.metric ?? 0}\n  Routing Descriptor Blocks:\n  * ${best.via ?? "directly connected"}${best.out ? ", via " + best.out : ""}`;
  }
  const def = routes.find((r) => r.net === "0.0.0.0" && r.bits === 0);
  const out = [CODES, "", def ? `Gateway of last resort is ${def.via ?? "0.0.0.0"} to network 0.0.0.0` : "Gateway of last resort is not set", ""];
  const sorted = [...routes].sort((a, b) => parseIp(a.net) - parseIp(b.net) || a.bits - b.bits);
  for (const r of sorted) {
    const code = r.code === "S" && r.bits === 0 ? "S*" : r.code;
    if (r.code === "C" || r.code === "L") out.push(`${pad(code, 9)}${r.net}/${r.bits} is directly connected, ${r.out}`);
    else out.push(`${pad(code, 9)}${r.net}/${r.bits} [${r.ad}/${r.metric}]${r.via ? ` via ${r.via}` : ""}${r.out ? `${r.via ? "," : " is directly connected,"} ${r.out}` : ""}`);
  }
  return out.join("\n");
}

function ipProtocols(dev) {
  const out = [];
  for (const [pid, p] of Object.entries(dev.ospf)) {
    out.push(`Routing Protocol is "ospf ${pid}"`, "  Outgoing update filter list for all interfaces is not set", "  Incoming update filter list for all interfaces is not set", `  Router ID ${routerId(dev, Number(pid))}`, "  Number of areas in this router is 1. 1 normal 0 stub 0 nssa", `  Maximum path: ${p.maxPaths ?? 4}`, "  Routing for Networks:");
    for (const n of p.networks) out.push(`    ${n.net} ${n.wild} area ${n.area}`);
    const pass = Object.keys(dev.interfaces).filter((n) => passive(dev, Number(pid), n));
    if (pass.length) out.push("  Passive Interface(s):", ...pass.map((n) => `    ${n}`));
    out.push("  Routing Information Sources:", "    Gateway         Distance      Last Update", `  Distance: (default is ${p.distance ?? 110})`, "");
  }
  if (dev.rip) {
    out.push('Routing Protocol is "rip"', `  Default version control: send version ${dev.rip.version}, receive ${dev.rip.version === 2 ? "2" : "any version"}`, `  Automatic network summarization is ${dev.rip.autoSummary ? "in effect" : "not in effect"}`, "  Routing for Networks:", ...dev.rip.networks.map((n) => `    ${n.net}`), "  Distance: (default is 120)", "");
  }
  for (const [as, e] of Object.entries(dev.eigrp)) out.push(`Routing Protocol is "eigrp ${as}"`, `  Automatic Summarization: ${e.autoSummary ? "enabled" : "disabled"}`, "  Routing for Networks:", ...e.networks.map((n) => `    ${n.net}${n.wild ? " " + n.wild : ""}`), "  Distance: internal 90 external 170", "");
  if (!out.length) return "";
  return out.join("\n");
}

function ospfNeighbor(dev) {
  const rows = [`${pad("Neighbor ID", 15)}${pad("Pri", 6)}${pad("State", 17)}${pad("Dead Time", 12)}${pad("Address", 16)}Interface`];
  for (const n of ospfNeighbors(dev).filter((n) => n.up)) rows.push(`${pad(n.rid, 15)}${pad(n.priority, 6)}${pad(`FULL/${role(n) === "-" ? "  -" : role(n)}`, 17)}${pad("00:00:3" + (n.rid.length % 10), 12)}${pad(n.ip, 16)}${n.iface.name}`);
  return rows.length > 1 ? rows.join("\n") : "";
}

function ospfInterface(dev, name, brief) {
  const list = sortedInterfaces(dev).filter((f) => ospfOf(dev, f) && (!name || f.name === name));
  if (brief) {
    const rows = [`${pad("Interface", 11)}${pad("PID", 6)}${pad("Area", 16)}${pad("IP Address/Mask", 20)}${pad("Cost", 6)}${pad("State", 6)}Nbrs F/C`];
    for (const f of list) {
      const o = ospfOf(dev, f);
      const nbrs = ospfNeighbors(dev).filter((n) => n.iface === f && n.up).length;
      rows.push(`${pad(short(f.name), 11)}${pad(o.pid, 6)}${pad(o.area, 16)}${pad(`${f.ip}/${maskBits(f.mask)}`, 20)}${pad(cost(dev, f), 6)}${pad(f.name.startsWith("Loopback") ? "LOOP" : passive(dev, o.pid, f.name) ? "DR" : nbrs ? "DR" : "DR", 6)}${nbrs}/${nbrs}`);
    }
    return rows.join("\n");
  }
  return list
    .map((f) => {
      const o = ospfOf(dev, f);
      const hello = f.ospf.hello ?? 10;
      const dead = f.ospf.dead ?? hello * 4;
      const p2p = f.ospf.network === "point-to-point";
      return [
        `${f.name} is ${status(dev, f).join(", line protocol is ")}`,
        `  Internet Address ${f.ip}/${maskBits(f.mask)}, Area ${o.area}`,
        `  Process ID ${o.pid}, Router ID ${routerId(dev, o.pid)}, Network Type ${p2p ? "POINT_TO_POINT" : f.name.startsWith("Loopback") ? "LOOPBACK" : "BROADCAST"}, Cost: ${cost(dev, f)}`,
        `  Transmit Delay is 1 sec, State ${p2p ? "POINT_TO_POINT" : "DR"}, Priority ${f.ospf.priority ?? 1}`,
        `  Timer intervals configured, Hello ${hello}, Dead ${dead}, Wait ${dead}, Retransmit 5`,
        passive(dev, o.pid, f.name) ? "    No Hellos (Passive interface)" : `    Hello due in 00:00:0${hello % 10}`,
        `  Neighbor Count is ${ospfNeighbors(dev).filter((n) => n.iface === f && n.up).length}, Adjacent neighbor count is ${ospfNeighbors(dev).filter((n) => n.iface === f && n.up).length}`,
      ].join("\n");
    })
    .join("\n");
}

export const cost = ospfCost;

// one port in every VLAN it forwards, with its real role, cost and port ID
function stpInterface(dev, name) {
  const f = dev.interfaces[name];
  const none = `no spanning tree info available for ${name}`;
  if (!f || !f.switchport || f.channel || status(dev, f)[0] !== "up") return none;
  const rows = [];
  for (const v of Object.keys(dev.vlans).map(Number).filter((v) => v < 1002 && carries(dev, f, v)).sort((a, b) => a - b)) {
    const p = stpPorts(dev, v).ports.find((x) => x.f === f);
    if (!p) continue;
    const edge = f.stp.portfast === "edge" || (dev.stp.portfastDefault && f.mode === "access");
    rows.push(`${pad(`VLAN${String(v).padStart(4, "0")}`, 20)}${pad(p.role, 5)}${pad(p.state, 4)}${pad(stpCost(dev, f, v), 10)}${pad(`${f.stp.priority ?? 128}.${stpPortNumber(f)}`, 9)}P2p${edge ? " Edge" : ""}`);
  }
  if (!rows.length) return none;
  return ["Vlan                Role Sts Cost      Prio.Nbr Type", "------------------- ---- --- --------- -------- --------------------------------", ...rows, ...(f.stp.bpduguard ? ["   Bpdu guard is enabled"] : [])].join("\n");
}

function spanningTree(dev, vlanArg) {
  const vlans = vlanArg ? [vlanArg] : Object.keys(dev.vlans).map(Number).filter((v) => v < 1002 && sortedInterfaces(dev).some((f) => f.switchport && carries(dev, f, v) && status(dev, f)[0] === "up")).sort((a, b) => a - b);
  if (!vlans.length) return "No spanning tree instance exists.";
  const proto = dev.stp.mode === "rapid-pvst" ? "rstp" : dev.stp.mode === "mst" ? "mstp" : "ieee";
  const out = [];
  for (const v of vlans) {
    const tree = stpPorts(dev, v);
    const root = tree.root;
    const isRoot = root === dev;
    out.push(`VLAN${String(v).padStart(4, "0")}`, `  Spanning tree enabled protocol ${proto}`);
    out.push(`  Root ID    Priority    ${bridgePriority(root, v)}`, `             Address     ${root.mac}`);
    if (isRoot) out.push("             This bridge is the root");
    else if (tree.rootPort) out.push(`             Cost        ${tree.cost}`, `             Port        ${stpPortNumber(tree.rootPort)} (${tree.rootPort.name})`);
    out.push("             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec", "");
    out.push(`  Bridge ID  Priority    ${bridgePriority(dev, v)}  (priority ${bridgePriority(dev, v) - v} sys-id-ext ${v})`, `             Address     ${dev.mac}`, "             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec", "", `${pad("Interface", 20)}${pad("Role", 5)}${pad("Sts", 4)}${pad("Cost", 10)}${pad("Prio.Nbr", 9)}Type`, `${"-".repeat(19)} ${"-".repeat(4)} ${"-".repeat(3)} ${"-".repeat(9)} ${"-".repeat(8)} ${"-".repeat(24)}`);
    const byName = new Map(tree.ports.map((p) => [p.f, p]));
    for (const f of sortedInterfaces(dev).filter((f) => byName.has(f))) {
      const { role, state } = byName.get(f);
      const edge = f.stp.portfast === "edge" || (dev.stp.portfastDefault && f.mode === "access");
      out.push(`${pad(short(f.name), 20)}${pad(role, 5)}${pad(state, 4)}${pad(stpCost(dev, f, v), 10)}${pad(`${f.stp.priority ?? 128}.${stpPortNumber(f)}`, 9)}P2p${edge ? " Edge" : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}

function stpSummary(dev) {
  return [
    `Switch is in ${dev.stp.mode} mode`,
    `Root bridge for: ${Object.keys(dev.vlans).map(Number).filter((v) => v < 1002 && stpRoot(dev, v) === dev).map((v) => `VLAN${String(v).padStart(4, "0")}`).join(", ") || "none"}`,
    `Extended system ID           is enabled`,
    `Portfast Default             is ${dev.stp.portfastDefault ? "enabled" : "disabled"}`,
    `PortFast BPDU Guard Default  is ${dev.stp.bpduguardDefault ? "enabled" : "disabled"}`,
    `Portfast BPDU Filter Default is ${dev.stp.bpdufilterDefault ? "enabled" : "disabled"}`,
    `Loopguard Default            is ${dev.stp.loopguardDefault ? "enabled" : "disabled"}`,
    "EtherChannel misconfig guard is enabled",
    `Configured Pathcost method used is ${dev.stp.pathcost}`,
  ].join("\n");
}

function etherchannel(dev) {
  const groups = {};
  for (const f of sortedInterfaces(dev)) if (f.channel) (groups[f.channel.group] ??= []).push(f);
  const out = [
    "Flags:  D - down        P - bundled in port-channel",
    "        I - stand-alone s - suspended",
    "        H - Hot-standby (LACP only)",
    "        R - Layer3      S - Layer2",
    "        U - in use      f - failed to allocate aggregator",
    "",
    `Number of channel-groups in use: ${Object.keys(groups).length}`,
    `Number of aggregators:           ${Object.keys(groups).length}`,
    "",
    "Group  Port-channel  Protocol    Ports",
    "------+-------------+-----------+----------------------------------------------",
  ];
  for (const [g, members] of Object.entries(groups)) {
    const po = dev.interfaces[`Port-channel${g}`];
    const anyUp = members.some((m) => bundled(dev, m));
    const layer = po && po.switchport === false ? "R" : "S";
    const ports = members.map((m) => `${short(m.name)}(${bundled(dev, m) ? "P" : m.shutdown ? "D" : protocolOf(m.channel.mode) === "-" ? "D" : "I"})`).join(" ");
    out.push(`${pad(g, 7)}${pad(`Po${g}(${layer}${anyUp ? "U" : "D"})`, 14)}${pad(protocolOf(members[0].channel.mode), 12)}${ports}`);
  }
  return out.join("\n");
}

function cdpNeighbors(dev, lldp) {
  const on = (d, f) => (lldp ? d.lldp && f.lldpTx !== false && f.lldpRx !== false : d.cdp && f.cdp);
  const rows = lldp
    ? ["Capability codes:", "    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device", "    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other", "", `${pad("Device ID", 21)}${pad("Local Intf", 15)}${pad("Hold-time", 11)}${pad("Capability", 15)}Port ID`]
    : ["Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge", "                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone", "", `${pad("Device ID", 17)}${pad("Local Intrfce", 17)}${pad("Holdtme", 10)}${pad("Capability", 12)}${pad("Platform", 10)}Port ID`];
  let n = 0;
  for (const [name, end] of Object.entries(dev.links)) {
    const f = dev.interfaces[name];
    const g = end.device.interfaces[end.iface];
    if (!f || !g || f.shutdown || g.shutdown || !on(dev, f) || !on(end.device, g) || end.device.type === "pc") continue;
    n++;
    const cap = end.device.type === "router" ? "R" : end.device.type === "l3switch" ? "R S" : "S";
    const platform = end.device.type === "router" ? "C2900" : end.device.type === "l3switch" ? "3560" : "2960";
    if (lldp) rows.push(`${pad(end.device.hostname, 21)}${pad(short(f.name), 15)}${pad("120", 11)}${pad(cap, 15)}${short(g.name)}`);
    else rows.push(`${pad(end.device.hostname, 17)}${pad(short(f.name), 17)}${pad("163", 10)}${pad(cap, 12)}${pad(platform, 10)}${short(g.name)}`);
  }
  if (lldp) rows.push("", `Total entries displayed: ${n}`);
  if (lldp && !dev.lldp) return "% LLDP is not enabled";
  if (!lldp && !dev.cdp) return "% CDP is not enabled";
  return rows.join("\n");
}

function cdpDetail(dev) {
  const out = [];
  for (const [name, end] of Object.entries(dev.links)) {
    const f = dev.interfaces[name];
    const g = end.device.interfaces[end.iface];
    if (!f || !g || f.shutdown || g.shutdown || !dev.cdp || !end.device.cdp || !f.cdp || !g.cdp || end.device.type === "pc") continue;
    const ip = g.ip ?? Object.values(end.device.interfaces).find((x) => x.ip)?.ip;
    out.push("-------------------------", `Device ID: ${end.device.hostname}`, "Entry address(es): ", ip ? `  IP address: ${ip}` : "", `Platform: cisco ${end.device.type === "router" ? "C2900" : "WS-C2960-24TT-L"},  Capabilities: ${end.device.type === "router" ? "Router" : "Switch"}`, `Interface: ${f.name},  Port ID (outgoing port): ${g.name}`, "Holdtime : 163 sec", "", "Version :", "Cisco IOS Software, Version 15.1(4)M4, RELEASE SOFTWARE (fc2)", "");
  }
  return out.filter((l) => l !== "").join("\n");
}

// a router that is a DHCP client: the lease the lab gave it, or a request
// still going out
function dhcpLease(dev) {
  return Object.values(dev.interfaces).filter((f) => f.dhcp).map((f) => {
    const l = dev.lab?.lease;
    if (!l || f.shutdown) return `Temp IP addr: 0.0.0.0  for peer on Interface: ${f.name}\nTemp  sub net mask: 0.0.0.0\n   DHCP Lease server: 0.0.0.0, state: 1 Selecting\n   DHCP transaction id: 1A2B`;
    return `Temp IP addr: ${l.ip}  for peer on Interface: ${f.name}\nTemp  sub net mask: ${l.mask}\n   DHCP Lease server: ${l.server}, state: 5 Bound\n   DHCP transaction id: 1A2B\n   Lease: 86400 secs,  Renewal: 43200 secs,  Rebind: 75600 secs\nTemp default-gateway addr: ${l.gateway}\n   Next timer fires after: 11:59:12\n   Retry count: 0   Client-ID: cisco-${dev.mac}-${short(f.name)}\n   Client-ID hex dump: 636973636F2D\n   Hostname: ${dev.hostname}`;
  }).join("\n\n");
}

function dhcpPool(dev) {
  return Object.entries(dev.dhcp.pools)
    .map(([name, p]) => {
      const bits = p.mask ? maskBits(p.mask) : 0;
      const size = p.mask ? 2 ** (32 - bits) - 2 : 0;
      return `\nPool ${name} :\n Utilization mark (high/low)    : 100 / 0\n Subnet size (first/next)       : 0 / 0\n Total addresses                : ${size}\n Leased addresses               : 0\n Excluded addresses             : ${dev.dhcp.excluded.length}\n Pending event                  : none\n\n 1 subnet is currently in the pool :\n Current index        IP address range                    Leased/Excluded/Total\n ${pad(p.network ?? "0.0.0.0", 21)}${p.network ?? "0.0.0.0"}     - ${p.network ?? "0.0.0.0"}  0 / 0 / ${size}`;
    })
    .join("\n");
}

const natCounts = (dev) => {
  const live = dev.nat.live ?? [];
  const simple = new Set(live.filter((t) => t.dynamic && !t.overload).map((t) => t.local)).size;
  return { total: dev.nat.statics.length + live.length + simple, dynamic: live.length + simple, extended: live.length };
};
function natTranslations(dev) {
  const rows = [`${pad("Pro", 5)}${pad("Inside global", 22)}${pad("Inside local", 22)}${pad("Outside local", 22)}Outside global`];
  for (const s of dev.nat.statics) rows.push(`${pad(s.proto ?? "---", 5)}${pad(s.global + (s.gport ? ":" + s.gport : ""), 22)}${pad(s.local + (s.lport ? ":" + s.lport : ""), 22)}${pad("---", 22)}---`);
  for (const t of dev.lab?.natTranslations ?? []) rows.push(t);
  // what pings through the router left behind
  for (const t of dev.nat.live ?? []) {
    rows.push(`${pad("icmp", 5)}${pad(`${t.global}:${t.id}`, 22)}${pad(`${t.local}:${t.id}`, 22)}${pad(`${t.target}:${t.id}`, 22)}${t.target}:${t.id}`);
    if (t.dynamic && !t.overload) rows.push(`${pad("---", 5)}${pad(t.global, 22)}${pad(t.local, 22)}${pad("---", 22)}---`);
  }
  return rows.join("\n");
}

function accessLists(dev, which, ipOnly) {
  const out = [];
  for (const [name, acl] of Object.entries(dev.acls)) {
    if (which && name !== String(which)) continue;
    const label = acl.named ? `${acl.type === "standard" ? "Standard" : "Extended"} IP access list ${name}` : `${acl.type === "standard" ? "Standard" : "Extended"} IP access list ${name}`;
    out.push(label);
    for (const e of acl.entries) out.push(`    ${e.seq} ${aceText(e, acl.type === "standard")}`);
  }
  return out.join("\n");
}

function portSecurity(dev, name) {
  if (name) {
    const f = dev.interfaces[name];
    if (!f) return "% Invalid input detected at '^' marker.";
    return [
      `Port Security              : ${f.ps.enabled ? "Enabled" : "Disabled"}`,
      `Port Status                : ${f.ps.enabled ? (f.errdisabled ? "Secure-shutdown" : status(dev, f)[0] === "up" ? "Secure-up" : "Secure-down") : "Secure-down"}`,
      `Violation Mode             : ${f.ps.violation[0].toUpperCase() + f.ps.violation.slice(1)}`,
      `Aging Time                 : ${f.ps.aging ?? 0} mins`,
      "Aging Type                 : Absolute",
      "SecureStatic Address Aging : Disabled",
      `Maximum MAC Addresses      : ${f.ps.max}`,
      `Total MAC Addresses        : ${f.ps.macs.length}`,
      `Configured MAC Addresses   : ${f.ps.sticky ? 0 : f.ps.macs.length}`,
      `Sticky MAC Addresses       : ${f.ps.sticky ? f.ps.macs.length : 0}`,
      "Last Source Address:Vlan   : 0000.0000.0000:0",
      `Security Violation Count   : ${f.violations ?? 0}`,
    ].join("\n");
  }
  const rows = ["Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action", "                (Count)       (Count)          (Count)", "----------------------------------------------------------------------------"];
  for (const f of sortedInterfaces(dev).filter((f) => f.ps.enabled)) rows.push(`${pad(short(f.name), 13)}${pad(f.ps.max, 15)}${pad(f.ps.macs.length, 13)}${pad(f.violations ?? 0, 19)}${f.ps.violation[0].toUpperCase() + f.ps.violation.slice(1)}`);
  rows.push("----------------------------------------------------------------------------", `Total Addresses in System (excluding one mac per port)     : 0`, "Max Addresses limit in System (excluding one mac per port) : 1024");
  return rows.join("\n");
}

function standby(dev, brief, all) {
  const rows = brief ? ["                     P indicates configured to preempt.", "                     |", `${pad("Interface", 11)}${pad("Grp", 5)}${pad("Pri", 4)}${pad("P", 2)}${pad("State", 8)}${pad("Active", 16)}${pad("Standby", 16)}Virtual IP`] : [];
  for (const f of sortedInterfaces(dev)) {
    for (const [g, grp] of Object.entries(f.hsrp.groups)) {
      const rank = hsrpRanking(dev, grp.ip, all ?? [dev]);
      const me = rank.findIndex((m) => m.device === dev && m.iface === f);
      const state = me === 0 ? "Active" : me === 1 ? "Standby" : "Listen";
      const active = rank[0]?.device === dev ? "local" : rank[0]?.ip ?? "unknown";
      const stand = rank[1]?.device === dev ? "local" : rank[1]?.ip ?? "unknown";
      if (brief) rows.push(`${pad(short(f.name), 11)}${pad(g, 5)}${pad(grp.priority, 4)}${pad(grp.preempt ? "P" : "", 2)}${pad(state, 8)}${pad(active, 16)}${pad(stand, 16)}${grp.ip}`);
      else rows.push(`${f.name} - Group ${g}${f.hsrp.version === 2 ? " (version 2)" : ""}`, `  State is ${state}`, `  Virtual IP address is ${grp.ip}`, `  Active virtual MAC address is 0000.0c07.ac${Number(g).toString(16).padStart(2, "0")}`, "  Hello time 3 sec, hold time 10 sec", `  Preemption ${grp.preempt ? "enabled" : "disabled"}`, `  Active router is ${active}`, `  Standby router is ${stand}`, `  Priority ${grp.priority} (${grp.priority === 100 ? "default 100" : "configured " + grp.priority})`, `  Group name is "hsrp-${short(f.name)}-${g}" (default)`);
    }
  }
  return rows.join("\n");
}

function ipv6Brief(dev) {
  const out = [];
  for (const f of sortedInterfaces(dev)) {
    if (dev.type === "switch" && !f.name.startsWith("Vlan")) continue;
    const [st, pr] = status(dev, f);
    out.push(`${pad(f.name, 23)}[${st === "administratively down" ? "administratively down/down" : `${st}/${pr}`}]`);
    if (f.ipv6Enabled || f.ipv6.length) {
      out.push(`    ${compressIpv6(f.ipv6LinkLocal ?? linkLocal(dev))}`);
      for (const a of f.ipv6) out.push(`    ${compressIpv6(a.addr)}`);
    } else out.push("    unassigned");
  }
  return out.join("\n");
}

function linkLocal(dev) {
  const hex = dev.mac.replace(/\./g, "");
  const first = (parseInt(hex.slice(0, 2), 16) ^ 2).toString(16).padStart(2, "0");
  return `fe80::${first}${hex.slice(2, 4)}:${hex.slice(4, 6)}ff:fe${hex.slice(6, 8)}:${hex.slice(8)}`;
}

function ipv6Route(dev) {
  const out = ["IPv6 Routing Table - default - 1 entries", "Codes: C - Connected, L - Local, S - Static, U - Per-user Static route", "       B - BGP, R - RIP, I1 - ISIS L1, I2 - ISIS L2", "       IA - ISIS interarea, IS - ISIS summary, D - EIGRP, EX - EIGRP external", "       O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1, OE2 - OSPF ext 2", ""];
  for (const f of sortedInterfaces(dev)) {
    if (status(dev, f)[1] !== "up") continue;
    for (const a of f.ipv6) {
      out.push(`C   ${compressIpv6(ipv6Network(a.addr, a.bits))}/${a.bits} [0/0]`, `     via ${f.name}, directly connected`);
      out.push(`L   ${compressIpv6(a.addr)}/128 [0/0]`, `     via ${f.name}, receive`);
    }
  }
  for (const r of dev.ipv6Routes) out.push(`S   ${compressIpv6(r.addr)}/${r.bits} [${r.ad}/0]`, `     via ${r.via ? compressIpv6(r.via) : ""}${r.out ? (r.via ? ", " : "") + r.out : ""}`);
  out.push("L   FF00::/8 [0/0]", "     via Null0, receive");
  out[0] = `IPv6 Routing Table - default - ${out.filter((l) => /^[CLS] /.test(l)).length} entries`;
  return out.join("\n");
}

function version(dev) {
  const model = dev.type === "router" ? "CISCO2911/K9" : dev.type === "l3switch" ? "WS-C3560-24PS" : "WS-C2960-24TT-L";
  return `Cisco IOS Software, ${dev.type === "router" ? "C2900" : "C2960"} Software, Version 15.1(4)M4, RELEASE SOFTWARE (fc2)\nTechnical Support: http://www.cisco.com/techsupport\nCopyright (c) 1986-2012 by Cisco Systems, Inc.\n\nROM: System Bootstrap, Version 15.1(4)M4, RELEASE SOFTWARE (fc1)\n\n${dev.hostname} uptime is 1 hour, 12 minutes\nSystem image file is "flash:${dev.boot[0] ?? (dev.type === "router" ? "c2900-universalk9-mz.SPA.151-4.M4.bin" : "c2960-lanbasek9-mz.150-2.SE4.bin")}"\n\ncisco ${model} (revision 1.0) with 491520K/32768K bytes of memory.\n${Object.keys(dev.interfaces).filter((n) => /Ethernet/.test(n)).length} Ethernet interfaces\n255K bytes of non-volatile configuration memory.\n249856K bytes of ATA System CompactFlash 0 (Read/Write)\n\nConfiguration register is ${dev.configRegister}`;
}

function flash(dev) {
  const image = dev.type === "router" ? "c2900-universalk9-mz.SPA.151-4.M4.bin" : "c2960-lanbasek9-mz.150-2.SE4.bin";
  return `Directory of flash:/\n\n    3  -rw-    33591768          <no date>  ${image}\n    2  -rw-       28282          <no date>  sigdef-category.xml\n    1  -rw-      227537          <no date>  sigdef-default.xml\n\n255744000 bytes total (221896413 bytes free)`;
}

function ntpStatus(dev) {
  if (dev.ntp.master) return `Clock is synchronized, stratum ${dev.ntp.master}, reference is 127.127.1.1\nnominal freq is 250.0000 Hz, actual freq is 249.9990 Hz, precision is 2**19`;
  if (!dev.ntp.servers.length) return "%NTP is not enabled.";
  const ok = dev.lab?.ntpReachable ?? true;
  return ok ? `Clock is synchronized, stratum 2, reference is ${dev.ntp.servers[0].ip}\nnominal freq is 250.0000 Hz, actual freq is 249.9990 Hz, precision is 2**24` : "Clock is unsynchronized, stratum 16, no reference clock";
}

function logging(dev) {
  const lv = ["emergencies", "alerts", "critical", "errors", "warnings", "notifications", "informational", "debugging"];
  return [
    "Syslog logging: enabled (0 messages dropped, 0 messages rate-limited, 0 flushes, 0 overruns, xml disabled, filtering disabled)",
    "",
    `    Console logging: ${dev.logging.console === "off" ? "disabled" : `level ${lv[dev.logging.console ?? 7]}`}, 12 messages logged, xml disabled,`,
    `    Monitor logging: level ${lv[dev.logging.monitor ?? 7]}, 0 messages logged, xml disabled,`,
    `    Buffer logging:  ${dev.logging.buffered ? `level ${lv[dev.logging.buffered.level]}, 0 messages logged, xml disabled,` : "disabled, xml disabled,"}`,
    `    Logging Exception size (4096 bytes)`,
    `    Trap logging: level ${lv[dev.logging.trap ?? 6]}, 15 message lines logged`,
    ...dev.logging.hosts.map((h) => `        Logging to ${h}  (udp port 514, audit disabled,\n              link up),\n              0 message lines logged,`),
  ].join("\n");
}

function vtpStatus(dev) {
  return [`VTP Version capable             : 1 to 3`, `VTP version running             : ${dev.vtp.version}`, `VTP Domain Name                 : ${dev.vtp.domain ?? ""}`, "VTP Pruning Mode                : Disabled", "VTP Traps Generation            : Disabled", `Device ID                       : ${dev.mac}`, "", `Feature VLAN:`, "--------------", `VTP Operating Mode                : ${dev.vtp.mode[0].toUpperCase() + dev.vtp.mode.slice(1)}`, "Maximum VLANs supported locally   : 255", `Number of existing VLANs          : ${Object.keys(dev.vlans).length + 4}`].join("\n");
}

function sshInfo(dev) {
  if (!dev.rsa) return "SSH Disabled - version 1.99\n%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).";
  const v = dev.sshVersion === 2 ? "2.0" : dev.sshVersion === 1 ? "1.5" : "1.99";
  return `SSH Enabled - version ${v}\nAuthentication timeout: ${dev.sshTimeout ?? 120} secs; Authentication retries: ${dev.sshRetries ?? 3}\nMinimum expected Diffie Hellman key size : 1024 bits\nIOS Keys in SECSH format(ssh-rsa, base64 encoded): ${dev.hostname}`;
}

function arp(dev) {
  const rows = [`${pad("Protocol", 10)}${pad("Address", 17)}${pad("Age (min)", 11)}${pad("Hardware Addr", 16)}${pad("Type", 7)}Interface`];
  for (const f of sortedInterfaces(dev)) if (f.ip && status(dev, f)[1] === "up") rows.push(`${pad("Internet", 10)}${pad(f.ip, 17)}${pad("-", 11)}${pad(dev.mac, 16)}${pad("ARPA", 7)}${f.name}`);
  for (const a of dev.lab?.arp ?? []) rows.push(`${pad("Internet", 10)}${pad(a.ip, 17)}${pad("0", 11)}${pad(a.mac, 16)}${pad("ARPA", 7)}${a.iface}`);
  return rows.join("\n");
}

function snooping(dev) {
  const rows = [`Switch DHCP snooping is ${dev.snooping.enabled ? "enabled" : "disabled"}`, "DHCP snooping is configured on following VLANs:", rangeText(dev.snooping.vlans) || "none", `Insertion of option 82 is ${dev.snooping.option82 ? "enabled" : "disabled"}`, "Interface                  Trusted    Allow option    Rate limit (pps)", "-----------------------    -------    ------------    ----------------"];
  for (const f of sortedInterfaces(dev).filter((f) => f.snoopTrust || f.snoopRate)) rows.push(`${pad(f.name, 27)}${pad(f.snoopTrust ? "yes" : "no", 11)}${pad("no", 16)}${f.snoopRate ?? "unlimited"}`);
  return rows.join("\n");
}

function dai(dev) {
  const rows = [" Vlan     Configuration    Operation   ACL Match          Static ACL", " ----     -------------    ---------   ---------          ----------"];
  for (const v of dev.dai.vlans) rows.push(`${pad(" " + v, 10)}${pad("Enabled", 17)}${pad(dev.vlans[v] ? "Active" : "Inactive", 12)}`);
  rows.push("", " Interface        Trust State     Rate (pps)    Burst Interval", " ---------------  -----------     ----------    --------------");
  for (const f of sortedInterfaces(dev).filter((f) => f.switchport && /Ethernet/.test(f.name))) rows.push(` ${pad(short(f.name), 17)}${pad(f.daiTrust ? "Trusted" : "Untrusted", 16)}${pad(f.daiTrust ? "None" : "15", 14)}${f.daiTrust ? "N/A" : "1"}`);
  return rows.join("\n");
}

export const SHOWS = {
  flash,
  patterns: [
    ["show running-config [interface <name:iface>]", (d, a) => runningConfig(d, a.name), true],
    ["show startup-config", (d) => (d.saved ? runningConfig({ ...d.saved, lab: d.lab, links: d.links }).replace("Building configuration...\n\nCurrent configuration", "Using 1024 out of 262136 bytes\n!") : "startup-config is not present"), true],
    ["show version", (d) => version(d)],
    ["show ip interface brief", (d) => ipIntBrief(d)],
    ["show ip interface [<name:iface>]", (d, a) => sortedInterfaces(d).filter((f) => !a.name || f.name === a.name).map((f) => `${f.name} is ${status(d, f).join(", line protocol is ")}\n  Internet address is ${f.ip ? `${f.ip}/${maskBits(f.mask)}` : "not set"}\n  Helper address is ${f.helpers.join(", ") || "not set"}\n  Outgoing access list is ${f.aclOut ?? "not set"}\n  Inbound  access list is ${f.aclIn ?? "not set"}`).join("\n")],
    ["show interfaces [<name:iface>]", (d, a) => interfaces(d, a.name)],
    ["show interfaces <name:iface> switchport", (d, a) => switchportInfo(d, a.name)],
    ["show interfaces switchport", (d) => sortedInterfaces(d).filter((f) => f.switchport).map((f) => switchportInfo(d, f.name)).join("\n\n")],
    ["show interfaces trunk", (d) => trunks(d)],
    ["show interfaces status", (d) => intStatus(d)],
    ["show interfaces status err-disabled", (d) => intStatus(d, true)],
    ["show spanning-tree pathcost method", (d) => `Spanning tree default pathcost method used is ${d.stp.pathcost}`],
    ["show dhcp lease", (d) => dhcpLease(d)],
    ["show interfaces description", (d) => [`${pad("Interface", 31)}${pad("Status", 15)}${pad("Protocol", 9)}Description`, ...sortedInterfaces(d).map((f) => `${pad(short(f.name), 31)}${pad(status(d, f)[0] === "administratively down" ? "admin down" : status(d, f)[0], 15)}${pad(status(d, f)[1], 9)}${f.description ?? ""}`)].join("\n")],
    ["show vlan [brief]", (d, a, c) => vlanBrief(d, !c.has("brief"))],
    ["show vlan id <id:num:1-4094>", (d, a) => (d.vlans[a.id] ? vlanBrief({ ...d, vlans: { [a.id]: d.vlans[a.id] } }, false).split("\n").slice(0, 3).join("\n") : `VLAN id ${a.id} not found in current VLAN database`)],
    ["show mac address-table [(dynamic | static)] [interface <name:iface>]", (d) => macTable(d)],
    ["show ip route [(<net:ip> | static | connected | ospf)]", (d, a, c) => {
      const out = ipRoute(d, a);
      if (c.has("static")) return out.split("\n").filter((l) => /^S/.test(l)).join("\n");
      if (c.has("connected")) return out.split("\n").filter((l) => /^[CL] /.test(l)).join("\n");
      if (c.has("ospf")) return out.split("\n").filter((l) => /^O/.test(l)).join("\n");
      return out;
    }],
    ["show ip protocols", (d) => ipProtocols(d)],
    ["show ip ospf neighbor [detail]", (d) => ospfNeighbor(d)],
    ["show ip ospf interface [<name:iface>]", (d, a) => ospfInterface(d, a.name, false)],
    ["show ip ospf interface brief", (d) => ospfInterface(d, null, true)],
    ["show ip ospf", (d) => Object.keys(d.ospf).map((pid) => ` Routing Process "ospf ${pid}" with ID ${routerId(d, Number(pid))}\n Start time: 00:00:12.508, Time elapsed: 01:12:03.304\n Supports only single TOS(TOS0) routes\n Reference bandwidth unit is ${d.ospf[pid].refBw ?? 100} mbps\n    Area BACKBONE(0)\n        Number of interfaces in this area is ${Object.values(d.interfaces).filter((f) => ospfOf(d, f)?.pid === Number(pid)).length}`).join("\n")],
    ["show ip ospf database", (d) => `            OSPF Router with ID (${routerId(d, Number(Object.keys(d.ospf)[0] ?? 1))}) (Process ID ${Object.keys(d.ospf)[0] ?? 1})\n\n                Router Link States (Area 0)\n\nLink ID         ADV Router      Age         Seq#       Checksum Link count\n${[routerId(d, Number(Object.keys(d.ospf)[0] ?? 1)), ...ospfNeighbors(d).filter((n) => n.up).map((n) => n.rid)].map((r) => `${pad(r, 16)}${pad(r, 16)}${pad("312", 12)}0x80000004 0x00${(parseIp(r) % 251).toString(16).padStart(2, "0")}a1 2`).join("\n")}`],
    ["show ip rip database", () => ""],
    ["show ip eigrp neighbors", () => "EIGRP-IPv4 Neighbors for AS(100)\nH   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq"],
    ["show spanning-tree [vlan <v:num:1-4094>]", (d, a) => spanningTree(d, a.v)],
    ["show spanning-tree summary", (d) => stpSummary(d)],
    ["show spanning-tree interface <name:iface> [detail]", (d, a) => stpInterface(d, a.name)],
    ["show etherchannel summary", (d) => etherchannel(d)],
    ["show etherchannel port-channel", (d) => etherchannel(d)],
    ["show cdp neighbors", (d) => cdpNeighbors(d, false)],
    ["show cdp neighbors detail", (d) => cdpDetail(d)],
    ["show cdp", (d) => (d.cdp ? "Global CDP information:\n        Sending CDP packets every 60 seconds\n        Sending a holdtime value of 180 seconds\n        Sending CDPv2 advertisements is  enabled" : "% CDP is not enabled")],
    ["show lldp neighbors [detail]", (d) => cdpNeighbors(d, true)],
    ["show lldp", (d) => (d.lldp ? "Global LLDP Information:\n    Status: ACTIVE\n    LLDP advertisements are sent every 30 seconds\n    LLDP hold time advertised is 120 seconds" : "% LLDP is not enabled")],
    ["show ip dhcp pool [<name:word>]", (d) => dhcpPool(d)],
    ["show ip dhcp binding", (d) => ["Bindings from all pools not associated with VRF:", `${pad("IP address", 18)}${pad("Client-ID/", 20)}${pad("Lease expiration", 26)}Type`, `${pad("", 18)}Hardware address/`, ...(d.lab?.bindings ?? []).map((b) => `${pad(b.ip, 18)}${pad(b.mac, 20)}${pad("Mar 02 2026 12:00 AM", 26)}Automatic`)].join("\n")],
    ["show ip dhcp conflict", () => "IP address        Detection method   Detection time          VRF"],
    ["show ip nat translations [verbose]", (d) => natTranslations(d)],
    ["show ip nat statistics", (d) => `Total active translations: ${natCounts(d).total} (${d.nat.statics.length} static, ${natCounts(d).dynamic} dynamic; ${natCounts(d).extended} extended)\nOutside interfaces:\n  ${Object.values(d.interfaces).filter((f) => f.nat === "outside").map((f) => f.name).join(", ")}\nInside interfaces:\n  ${Object.values(d.interfaces).filter((f) => f.nat === "inside").map((f) => f.name).join(", ")}\nHits: 0  Misses: 0\nDynamic mappings:\n${d.nat.dynamic.map((m) => `-- Inside Source\n[Id: 1] access-list ${m.acl} ${m.pool ? "pool " + m.pool : "interface " + m.out} refcount ${(d.nat.live ?? []).filter((t) => t.dynamic && t.pool === m.pool).length}`).join("\n")}`],
    ["show (access-lists | ip access-lists) [(<n:num:1-2699> | <name:word>)]", (d, a, c) => accessLists(d, a.n ?? a.name, c.has("ip"))],
    ["show port-security [interface <name:iface>]", (d, a) => portSecurity(d, a.name)],
    ["show port-security address", (d) => ["          Secure Mac Address Table", "-----------------------------------------------------------------------------", "Vlan    Mac Address       Type                          Ports   Remaining Age", ...Object.values(d.interfaces).flatMap((f) => f.ps.macs.map((m) => `${pad(f.accessVlan, 8)}${pad(m, 18)}${pad(f.ps.sticky ? "SecureSticky" : "SecureConfigured", 30)}${pad(short(f.name), 8)}-`))].join("\n")],
    ["show standby [brief]", (d, a, c) => standby(d, c.has("brief"), d.lab?.all)],
    ["show ipv6 interface brief", (d) => ipv6Brief(d)],
    ["show ipv6 interface [<name:iface>]", (d, a) => ipv6Brief({ ...d, interfaces: a.name ? { [a.name]: d.interfaces[a.name] } : d.interfaces })],
    ["show ipv6 route", (d) => ipv6Route(d)],
    ["show clock [detail]", (d) => `*${d.clock.set ?? "12:13:47.123 UTC Mon Mar 1 1993"}`.replace(/^\*(\d+:\d+(:\d+)?) (\d+) (\w+) (\d+)$/, "*$1.000 UTC $4 $3 $5")],
    ["show ntp status", (d) => ntpStatus(d)],
    ["show ntp associations", (d) => ["  address         ref clock       st   when   poll reach  delay  offset   disp", ...d.ntp.servers.map((s) => `*~${pad(s.ip, 16)}${pad("127.127.1.1", 16)}1     14     64   377  1.204   0.009   0.184`), " * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured"].join("\n")],
    ["show logging", (d) => logging(d)],
    ["show history", (d) => d.history.slice(-20).map((h) => "  " + h).join("\n")],
    ["show flash: ", (d) => flash(d)],
    ["show users", (d) => "    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00"],
    ["show ip ssh", (d) => sshInfo(d)],
    ["show ssh", (d) => (d.rsa ? "%No SSHv2 server connections running." : "SSH Disabled")],
    ["show crypto key mypubkey rsa", (d) => (d.rsa ? `% Key pair was generated at: 0:12:44 UTC Mar 1 1993\nKey name: ${d.hostname}.${d.domainName}\n Storage Device: not specified\n Usage: General Purpose Key\n Key is not exportable.\n Key Data:\n  ${d.rsa} bit key` : "")],
    ["show vtp status", (d) => vtpStatus(d)],
    ["show (arp | ip arp)", (d) => arp(d)],
    ["show ip dhcp snooping [binding]", (d) => snooping(d)],
    ["show ip arp inspection [vlan <v:vlist>]", (d) => dai(d)],
    ["show errdisable recovery", (d) => ["ErrDisable Reason            Timer Status", "-----------------            --------------", ...["bpduguard", "psecure-violation", "udld", "link-flap"].map((r) => `${pad(r, 29)}${d.errdisable.causes.includes(r) || d.errdisable.causes.includes("all") ? "Enabled" : "Disabled"}`), "", `Timer interval: ${d.errdisable.interval ?? 300} seconds`].join("\n")],
    ["show debugging", (d) => (d.debugs.length ? d.debugs.map((x) => `  ${x} debugging is on`).join("\n") : "")],
    ["show snmp community", (d) => Object.entries(d.snmp.communities).map(([n, c]) => `Community name: ${n}\nCommunity Index: ${n}\nCommunity SecurityName: ${n}\nstorage-type: nonvolatile        active   access: ${c.access === "rw" ? "read-write" : "read-only"}`).join("\n\n")],
    ["show line", () => "   Tty Typ     Tx/Rx    A Modem  Roty AccO AccI   Uses   Noise  Overruns   Int\n*    0 CTY              -    -      -    -    -      0       0     0/0       -"],
  ],
};
