// The show commands: output in IOS's own layout, worked out from the
// device's configuration (and, through net.js, from the far end of links).

import { sortedInterfaces } from "./state.js";
import { maskBits, network, parseIp, compressIpv6, ipv6Network } from "./ip.js";
import { short, isSub, compare } from "./iface.js";
import { runningConfig, aceText, rangeText } from "./config.js";
import { ntpSync, aaaServerUp, phoneVlan, syncIpv6, segment } from "./host.js";
import { status, operMode, far, bundled, protocolOf, ospfNeighbors, ospfOf, passive, routerId, role, ospfElection, stpRoot, bridgePriority, hsrpRanking, carries, stpPorts, stpCost, suspended, stpPortNumber, ospfCost, ospfRoutes, staticUsable, linkMode, counters } from "./net.js";

const pad = (s, n) => String(s).padEnd(n);

// show ip interface: what IP does on one interface, in IOS's order
function ipInterface(dev, f) {
  const head = `${f.name} is ${status(dev, f).join(", line protocol is ")}`;
  if (!f.ip) return `${head}\n  Internet protocol processing disabled`;
  const bits = maskBits(f.mask);
  const bcast = f.ip.split(".").map((o, i) => (Number(o) | (~Number(f.mask.split(".")[i]) & 255))).join(".");
  return [
    head,
    `  Internet address is ${f.ip}/${bits}`,
    `  Broadcast address is ${bcast}`,
    "  Address determined by " + (f.dhcp ? "DHCP" : "setup command"),
    `  MTU is ${f.mtu ?? 1500} bytes`,
    `  Helper address is ${f.helpers?.join(", ") || "not set"}`,
    "  Directed broadcast forwarding is disabled",
    ...(ospfOf(dev, f) ? ["  Multicast reserved groups joined: 224.0.0.5 224.0.0.6"] : []),
    `  Outgoing access list is ${f.aclOut ?? "not set"}`,
    `  Inbound  access list is ${f.aclIn ?? "not set"}`,
    "  Proxy ARP is enabled",
    "  Local Proxy ARP is disabled",
    "  Security level is default",
    "  Split horizon is enabled",
    `  ICMP redirects are always sent`,
    `  ICMP unreachables are ${f.noUnreach ? "never" : "always"} sent`,
    "  ICMP mask replies are never sent",
    "  IP fast switching is enabled",
    "  IP CEF switching is enabled",
    "  IP multicast fast switching is enabled",
    "  Router Discovery is disabled",
    "  IP output packet accounting is disabled",
    "  IP access violation accounting is disabled",
    "  TCP/IP header compression is disabled",
    "  RTP/IP header compression is disabled",
    "  Probe proxy name replies are disabled",
    "  Policy routing is disabled",
    `  Network address translation is ${f.nat ? `enabled, interface in domain ${f.nat}` : "disabled"}`,
    "  BGP Policy Mapping is disabled",
    "  Input features: MCI Check",
  ].join("\n");
}

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
      const eth = /^(Fast|Gigabit)Ethernet/.test(f.name) && !isSub(f.name);
      if (eth) {
        const m = linkMode(dev, f);
        const up = st === "up" && m;
        const speed = up ? `${m.speed}Mb/s` : f.speed === "auto" ? "Auto-speed" : `${f.speed}Mb/s`;
        const duplex = up ? (m.duplex === "full" ? "Full-duplex" : "Half-duplex") : f.duplex === "auto" ? "Auto-duplex" : f.duplex === "full" ? "Full-duplex" : "Half-duplex";
        lines.push(`  Keepalive set (10 sec)`, `  ${duplex}, ${speed}, media type is ${f.name.startsWith("Gig") ? "10/100/1000BaseTX" : "10/100BaseTX"}`, "  input flow-control is off, output flow-control is unsupported", "  ARP type: ARPA, ARP Timeout 04:00:00");
      }
      // a serial link: what crossed it, and the modem control signals
      if (f.name.startsWith("Serial") && !isSub(f.name)) {
        const c = counters(dev, f);
        const up = st === "up";
        lines.push(
          `  Keepalive set (10 sec)`, `  Last input ${c.in ? "00:00:02" : "never"}, output ${c.out ? "00:00:01" : "never"}, output hang never`,
          `  Last clearing of "show interface" counters ${c.cleared ? clock(Date.now() - c.cleared) : "never"}`,
          "  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0", "  Queueing strategy: fifo", "  Output queue: 0/40 (size/max)",
          "  5 minute input rate 0 bits/sec, 0 packets/sec", "  5 minute output rate 0 bits/sec, 0 packets/sec",
          `     ${c.in} packets input, ${c.inBytes} bytes, 0 no buffer`, `     Received ${c.cleared ? 0 : Math.round(c.in * 0.6)} broadcasts (0 IP multicasts)`,
          "     0 runts, 0 giants, 0 throttles", "     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored, 0 abort",
          `     ${c.out} packets output, ${c.outBytes} bytes, 0 underruns`, `     0 output errors, 0 collisions, ${c.resets} interface resets`,
          "     0 unknown protocol drops", "     0 output buffer failures, 0 output buffers swapped out", `     ${c.cleared ? 0 : 1} carrier transitions`,
          up ? "     DCD=up  DSR=up  DTR=up  RTS=up  CTS=up" : "     DCD=down  DSR=down  DTR=up  RTS=up  CTS=down",
        );
        return lines.join("\n");
      }
      if (!eth) {
        lines.push("  5 minute input rate 0 bits/sec, 0 packets/sec", "     0 packets input, 0 bytes, 0 no buffer", "     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored", "     0 packets output, 0 bytes, 0 underruns", "     0 output errors, 0 collisions, 0 interface resets");
        return lines.join("\n");
      }
      const c = counters(dev, f);
      const ago = c.cleared ? clock(Date.now() - c.cleared) : "never";
      const inErr = c.crc + c.runts;
      lines.push(
        `  Last input ${c.in ? "00:00:01" : "never"}, output ${c.out ? "00:00:00" : "never"}, output hang never`,
        `  Last clearing of "show interface" counters ${ago}`,
        "  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0",
        "  Queueing strategy: fifo",
        "  Output queue: 0/40 (size/max)",
        "  5 minute input rate 0 bits/sec, 0 packets/sec",
        "  5 minute output rate 0 bits/sec, 0 packets/sec",
        `     ${c.in} packets input, ${c.inBytes} bytes, 0 no buffer`,
        `     Received ${c.bcastIn + c.mcastIn} broadcasts (${c.mcastIn} multicasts)`,
        `     ${c.runts} runts, 0 giants, 0 throttles`,
        `     ${inErr} input errors, ${c.crc} CRC, 0 frame, 0 overrun, 0 ignored`,
        `     0 watchdog, ${c.mcastIn} multicast, 0 pause input`,
        "     0 input packets with dribble condition detected",
        `     ${c.out} packets output, ${c.outBytes} bytes, 0 underruns`,
        `     0 output errors, ${c.coll} collisions, ${c.resets} interface resets`,
        "     0 unknown protocol drops",
        `     0 babbles, ${c.late} late collision, 0 deferred`,
        "     0 lost carrier, 0 no carrier, 0 pause output",
        "     0 output buffer failures, 0 output buffers swapped out",
      );
      return lines.join("\n");
    })
    .join("\n");
}

// hh:mm:ss since a moment
const clock = (ms) => {
  const t = Math.max(1, Math.floor(ms / 1000));
  return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((x) => String(x).padStart(2, "0")).join(":");
};
const ethPorts = (dev) => sortedInterfaces(dev).filter((f) => /^(Fast|Gigabit)Ethernet/.test(f.name) && !isSub(f.name));
const rpad = (s, n) => String(s).padStart(n);

// show interfaces counters: octets and packets in, then out, per port
function intCounters(dev) {
  const rows = ethPorts(dev).map((f) => [short(f.name), counters(dev, f)]);
  const uc = (c, dir) => Math.max(0, dir === "in" ? c.in - c.mcastIn - c.bcastIn : c.out - Math.round(c.out * 0.4) - (c.cleared ? 0 : 3));
  return [
    `${pad("Port", 12)}${rpad("InOctets", 12)}${rpad("InUcastPkts", 15)}${rpad("InMcastPkts", 15)}${rpad("InBcastPkts", 15)}`,
    ...rows.map(([n, c]) => `${pad(n, 12)}${rpad(c.inBytes, 12)}${rpad(uc(c, "in"), 15)}${rpad(c.mcastIn, 15)}${rpad(c.bcastIn, 15)}`),
    "",
    `${pad("Port", 12)}${rpad("OutOctets", 12)}${rpad("OutUcastPkts", 15)}${rpad("OutMcastPkts", 15)}${rpad("OutBcastPkts", 15)}`,
    ...rows.map(([n, c]) => `${pad(n, 12)}${rpad(c.outBytes, 12)}${rpad(uc(c, "out"), 15)}${rpad(c.out - uc(c, "out") - (c.cleared ? 0 : 3), 15)}${rpad(c.cleared ? 0 : 3, 15)}`),
  ].join("\n");
}
// show interfaces counters errors: the two tables a Catalyst prints
function intErrors(dev) {
  const rows = ethPorts(dev).map((f) => [short(f.name), counters(dev, f)]);
  return [
    `${pad("Port", 10)}${rpad("Align-Err", 12)}${rpad("FCS-Err", 12)}${rpad("Xmit-Err", 12)}${rpad("Rcv-Err", 12)}${rpad("UnderSize", 11)}${rpad("OutDiscards", 13)}`,
    ...rows.map(([n, c]) => `${pad(n, 10)}${rpad(0, 12)}${rpad(c.crc, 12)}${rpad(0, 12)}${rpad(c.crc + c.runts, 12)}${rpad(c.runts, 11)}${rpad(0, 13)}`),
    "",
    `${pad("Port", 10)}${rpad("Single-Col", 11)}${rpad("Multi-Col", 11)}${rpad("Late-Col", 11)}${rpad("Excess-Col", 12)}${rpad("Carri-Sen", 11)}${rpad("Runts", 11)}${rpad("Giants", 11)}`,
    ...rows.map(([n, c]) => `${pad(n, 10)}${rpad(c.coll - c.late, 11)}${rpad(0, 11)}${rpad(c.late, 11)}${rpad(0, 12)}${rpad(0, 11)}${rpad(c.runts, 11)}${rpad(0, 11)}`),
  ].join("\n");
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
    `Voice VLAN: ${f.voiceVlan ? `${f.voiceVlan} (${dev.vlans[f.voiceVlan]?.name ?? "Inactive"})` : "none"}`,
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
  if (errOnly) {
    const rows = [`${pad("Port", 10)}${pad("Name", 19)}${pad("Status", 13)}${pad("Reason", 21)}Err-disabled Vlans`];
    for (const f of sortedInterfaces(dev).filter((f) => f.errdisabled && !f.shutdown)) rows.push(`${pad(short(f.name), 10)}${pad((f.description ?? "").slice(0, 18), 19)}${pad("err-disabled", 13)}${f.errReason ?? "psecure-violation"}`);
    return rows.join("\n");
  }
  const rows = [`${pad("Port", 10)}${pad("Name", 19)}${pad("Status", 13)}${pad("Vlan", 11)}${pad("Duplex", 7)}${pad("Speed", 7)}Type`];
  for (const f of sortedInterfaces(dev).filter((f) => /^(Fast|Gigabit)Ethernet|^Port-channel/.test(f.name) && (!errOnly || f.errdisabled))) {
    const [st] = status(dev, f);
    const s = f.shutdown ? "disabled" : f.errdisabled ? "err-disabled" : st === "up" ? "connected" : "notconnect";
    const vlan = !f.switchport ? "routed" : operMode(dev, f) === "trunk" ? "trunk" : String(f.accessVlan);
    // auto settings show what was negotiated (a-full, a-100) only on a port
    // that is connected; the type follows the port's speed
    const gig = f.name.startsWith("Gig");
    const m = s === "connected" ? linkMode(dev, f) : null;
    const duplex = f.duplex === "auto" ? (m ? `a-${m.duplex}` : "auto") : f.duplex;
    const speed = f.speed === "auto" ? (m ? `a-${m.speed}` : "auto") : f.speed;
    const type = f.name.startsWith("Port-channel") ? "" : gig ? "10/100/1000BaseTX" : "10/100BaseTX";
    rows.push(`${pad(short(f.name), 10)}${pad((f.description ?? "").slice(0, 18), 19)}${pad(s, 13)}${pad(vlan, 11)}${pad(duplex, 7)}${pad(speed, 7)}${type}`);
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

// every MAC the switch knows: learned from traffic, the lab's own, static
// entries and port-security addresses, sorted by VLAN and MAC like IOS
function macEntries(dev) {
  const all = new Map();
  const add = (vlan, mac, type, port) => all.set(`${vlan}|${mac}`, { vlan: Number(vlan), mac, type, port: short(port) });
  for (const m of dev.lab?.macs ?? []) add(m.vlan, m.mac, m.type ?? "DYNAMIC", m.port);
  for (const m of Object.values(dev.macLearned ?? {})) add(m.vlan, m.mac, "DYNAMIC", m.port);
  for (const m of dev.macStatic ?? []) add(m.vlan, m.mac, "STATIC", m.port);
  for (const [port, end] of Object.entries(dev.links)) {
    const f = dev.interfaces[port];
    if (end.device.type === "phone" && f?.switchport && status(dev, f)[1] === "up") add(phoneVlan(end.device) ?? f.accessVlan, end.device.mac, "DYNAMIC", port);
  }
  for (const f of Object.values(dev.interfaces)) for (const mac of f.ps.macs) add(f.accessVlan, mac, "STATIC", f.name);
  return [...all.values()].sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac));
}
function macTable(dev, a = {}, c) {
  const rows = ["          Mac Address Table", "-------------------------------------------", "", "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----"];
  const shown = macEntries(dev).filter((m) => (!c?.has("dynamic") || m.type === "DYNAMIC") && (!c?.has("static") || m.type === "STATIC") && (!a.name || m.port === short(a.name)) && (!a.v || m.vlan === a.v));
  for (const m of shown) rows.push(`${pad(String(m.vlan).padStart(4), 8)}${pad(m.mac, 18)}${pad(m.type, 12)}${m.port}`);
  rows.push(`Total Mac Addresses for this criterion: ${shown.length}`);
  return rows.join("\n");
}
function macCount(dev) {
  const by = {};
  for (const m of macEntries(dev)) (by[m.vlan] ??= []).push(m);
  const out = [];
  for (const [v, list] of Object.entries(by)) {
    const dyn = list.filter((m) => m.type === "DYNAMIC").length;
    out.push(`Mac Entries for Vlan ${v}:`, "---------------------------", `Dynamic Address Count  : ${dyn}`, `Static  Address Count  : ${list.length - dyn}`, `Total Mac Addresses    : ${list.length}`, "");
  }
  out.push(`Total Mac Address Space Available: ${8000 - macEntries(dev).length}`);
  return out.join("\n");
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
    if (r.out === "Null0") return true;
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
    else if (r.ad === w.ad && r.code === w.list[0].code && (r.code === "S" || r.metric === w.list[0].metric)) w.list.push(r);
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
    // every equal-cost path to that prefix is a descriptor block; the first is starred
    const paths = routes.filter((r) => r.net === best.net && r.bits === best.bits);
    return `Routing entry for ${best.net}/${best.bits}\n  Known via "${{ C: "connected", L: "connected", S: "static", O: "ospf 1" }[best.code[0]] ?? "ospf 1"}", distance ${best.ad ?? 0}, metric ${best.metric ?? 0}${best.bits === 0 ? ", candidate default path" : ""}\n  Routing Descriptor Blocks:\n${paths.map((r, i) => `  ${i ? " " : "*"} ${r.via ?? "directly connected"}${r.out ? ", via " + r.out : ""}`).join("\n")}`;
  }
  const def = routes.find((r) => r.net === "0.0.0.0" && r.bits === 0);
  const out = [CODES, "", def ? `Gateway of last resort is ${def.via ?? "0.0.0.0"} to network 0.0.0.0` : "Gateway of last resort is not set", ""];
  const sorted = [...routes].sort((a, b) => parseIp(a.net) - parseIp(b.net) || a.bits - b.bits);
  // IOS groups subnets under their classful network ("10.0.0.0/8 is
  // variably subnetted, 4 subnets, 2 masks"); a classful network or a
  // supernet on its own gets no heading and a narrower code column. The
  // heading counts the whole table even when only some routes are shown.
  const shown = args?.only ? sorted.filter(args.only) : sorted;
  const groups = new Map();
  for (const r of sorted) {
    const cb = classfulBits(r.net);
    const key = r.bits < cb ? `${r.net}/${r.bits}` : `${network(r.net, cb)}/${cb}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(r);
  }
  const prefix = (r) => `${r.net}/${r.bits}`;
  for (const [key, all] of groups) {
    const show = all.filter((r) => shown.includes(r));
    if (!show.length) continue;
    const [net, bits] = key.split("/");
    // equal-cost paths share one entry, so the heading counts prefixes
    const count = new Set(all.map(prefix)).size;
    const plain = count === 1 && all[0].bits <= Number(bits);
    if (!plain) {
      const masks = new Set(all.map((r) => r.bits)).size;
      out.push(masks > 1 ? `      ${net}/${bits} is variably subnetted, ${count} subnets, ${masks} masks` : `      ${net}/${bits} is subnetted, ${count} subnet${count > 1 ? "s" : ""}`);
    }
    const width = plain ? 6 : 9;
    show.forEach((r, i) => {
      const age = r.code.startsWith("O") ? ", 00:12:41" : "";
      const path = `[${r.ad}/${r.metric}]${r.via ? ` via ${r.via}${age}` : ""}${r.out ? `${r.via ? "," : " is directly connected,"} ${r.out}` : ""}`;
      // a second path to the same prefix goes on its own line under the first
      if (i && prefix(show[i - 1]) === prefix(r) && r.code !== "C" && r.code !== "L") return out.push(`${" ".repeat(width + prefix(r).length + 1)}${path}`);
      const code = pad(r.code === "S" && r.bits === 0 ? "S*" : r.code, width);
      if (r.code === "C" || r.code === "L") out.push(`${code}${prefix(r)} is directly connected, ${r.out}`);
      else out.push(`${code}${prefix(r)} ${path}`);
    });
  }
  return out.join("\n");
}
// the mask a network would have without subnetting: /8, /16 or /24
const classfulBits = (ip) => {
  const first = parseIp(ip) >>> 24;
  return first < 128 ? 8 : first < 192 ? 16 : 24;
};

function ipProtocols(dev) {
  const out = [];
  for (const [pid, p] of Object.entries(dev.ospf)) {
    const areas = new Set(Object.values(dev.interfaces).map((f) => ospfOf(dev, f)).filter((o) => o && String(o.pid) === pid).map((o) => String(o.area)));
    const n = Math.max(areas.size, 1);
    out.push(`Routing Protocol is "ospf ${pid}"`, "  Outgoing update filter list for all interfaces is not set", "  Incoming update filter list for all interfaces is not set", `  Router ID ${routerId(dev, Number(pid))}`);
    if (areas.size > 1) out.push("  It is an area border router");
    if (p.defaultOriginate) out.push("  It is an autonomous system boundary router", " Redistributing External Routes from,");
    out.push(`  Number of areas in this router is ${n}. ${n} normal 0 stub 0 nssa`, `  Maximum path: ${p.maxPaths ?? 4}`, "  Routing for Networks:");
    for (const n of p.networks) out.push(`    ${n.net} ${n.wild} area ${n.area}`);
    const pass = Object.keys(dev.interfaces).filter((n) => passive(dev, Number(pid), n));
    if (pass.length) out.push("  Passive Interface(s):", ...pass.map((n) => `    ${n}`));
    // every router whose LSAs this one has, over adjacencies that are up
    const seen = new Set([dev]);
    const queue = [dev];
    const sources = [];
    while (queue.length) {
      for (const nb of ospfNeighbors(queue.shift())) {
        if (!nb.up || seen.has(nb.device)) continue;
        seen.add(nb.device);
        queue.push(nb.device);
        sources.push(nb.rid);
      }
    }
    sources.sort((a, b) => parseIp(a) - parseIp(b));
    out.push("  Routing Information Sources:", "    Gateway         Distance      Last Update", ...sources.map((rid) => `    ${pad(rid, 16)}${String(p.distance ?? 110).padStart(8)}      00:00:${String(10 + (parseIp(rid) % 40)).padStart(2, "0")}`), `  Distance: (default is ${p.distance ?? 110})`, "");
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
  for (const n of ospfNeighbors(dev).filter((n) => n.up)) {
    // two DROTHERs stay at 2WAY; everyone else forms a full adjacency
    const el = ospfElection(dev, n.iface);
    const theirs = el ? el.roleOf(n.rid) : "  -";
    const state = el && el.mine === "DROTHER" && theirs === "DROTHER" ? "2WAY" : "FULL";
    rows.push(`${pad(n.rid, 15)}${pad(n.priority, 6)}${pad(`${state}/${theirs}`, 17)}${pad("00:00:3" + (n.rid.length % 10), 12)}${pad(n.ip, 16)}${n.iface.name}`);
  }
  return rows.length > 1 ? rows.join("\n") : "";
}

// the neighbors up on an interface, and how many of them are full
// adjacencies (two DROTHERs only reach 2WAY)
function adjacency(dev, f) {
  const el = ospfElection(dev, f);
  const list = ospfNeighbors(dev).filter((n) => n.iface === f && n.up).map((n) => {
    const r = el ? el.roleOf(n.rid) : "-";
    return { rid: n.rid, role: r, full: !el || !(el.mine === "DROTHER" && r === "DROTHER") };
  });
  return { el, list, nbrs: list.length, full: list.filter((x) => x.full).length };
}
function ospfInterface(dev, name, brief) {
  const list = sortedInterfaces(dev).filter((f) => ospfOf(dev, f) && (!name || f.name === name));
  if (brief) {
    const rows = [`${pad("Interface", 11)}${pad("PID", 6)}${pad("Area", 16)}${pad("IP Address/Mask", 20)}${pad("Cost", 6)}${pad("State", 6)}Nbrs F/C`];
    for (const f of list) {
      const o = ospfOf(dev, f);
      const { nbrs, full, el } = adjacency(dev, f);
      const state = f.name.startsWith("Loopback") ? "LOOP" : !el ? "P2P" : el.mine === "DROTHER" ? "DROTH" : el.mine;
      rows.push(`${pad(short(f.name), 11)}${pad(o.pid, 6)}${pad(o.area, 16)}${pad(`${f.ip}/${maskBits(f.mask)}`, 20)}${pad(cost(dev, f), 6)}${pad(state, 6)}${full}/${nbrs}`);
    }
    return rows.join("\n");
  }
  return list
    .map((f) => {
      const o = ospfOf(dev, f);
      const hello = f.ospf.hello ?? 10;
      const dead = f.ospf.dead ?? hello * 4;
      const p2p = f.ospf.network === "point-to-point";
      const adj = adjacency(dev, f);
      return [
        `${f.name} is ${status(dev, f).join(", line protocol is ")}`,
        `  Internet Address ${f.ip}/${maskBits(f.mask)}, Area ${o.area}`,
        `  Process ID ${o.pid}, Router ID ${routerId(dev, o.pid)}, Network Type ${p2p ? "POINT_TO_POINT" : f.name.startsWith("Loopback") ? "LOOPBACK" : "BROADCAST"}, Cost: ${cost(dev, f)}`,
        `  Transmit Delay is 1 sec, State ${!adj.el ? "POINT_TO_POINT" : adj.el.mine}, Priority ${f.ospf.priority ?? 1}`,
        ...(adj.el ? [adj.el.dr ? `  Designated Router (ID) ${adj.el.dr.rid}, Interface address ${adj.el.dr.ip}` : "  No designated router on this network", ...(adj.el.bdr ? [`  Backup Designated router (ID) ${adj.el.bdr.rid}, Interface address ${adj.el.bdr.ip}`] : adj.el.dr ? ["  No backup designated router on this network"] : [])] : []),
        `  Timer intervals configured, Hello ${hello}, Dead ${dead}, Wait ${dead}, Retransmit 5`,
        passive(dev, o.pid, f.name) ? "    No Hellos (Passive interface)" : `    Hello due in 00:00:0${hello % 10}`,
        `  Neighbor Count is ${adj.nbrs}, Adjacent neighbor count is ${adj.full}`,
        ...adj.list.filter((x) => x.full).map((x) => `    Adjacent with neighbor ${x.rid}${x.role === "DR" ? "  (Designated Router)" : x.role === "BDR" ? "  (Backup Designated Router)" : ""}`),
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

// show spanning-tree root: one line per VLAN, the root as this switch sees it
function stpRootTable(dev) {
  const vlans = Object.keys(dev.vlans).map(Number).filter((v) => v < 1002 && sortedInterfaces(dev).some((f) => f.switchport && carries(dev, f, v) && status(dev, f)[0] === "up")).sort((a, b) => a - b);
  if (!vlans.length) return "No spanning tree instance exists.";
  const rows = [`${" ".repeat(40)}Root    Hello Max Fwd`, `${pad("Vlan", 23)}${pad("Root ID", 17)}Cost    Time  Age Dly  Root Port`, "---------------- -------------------- --------- ----- --- ---  ------------"];
  for (const v of vlans) {
    const tree = stpPorts(dev, v);
    const id = `${bridgePriority(tree.root, v)} ${tree.root.mac}`;
    rows.push(`${pad(`VLAN${String(v).padStart(4, "0")}`, 17)}${pad(id, 21)}${String(tree.root === dev ? 0 : tree.cost).padStart(9)}${"2".padStart(6)}${"20".padStart(4)}${"15".padStart(4)}  ${tree.root === dev || !tree.rootPort ? "" : short(tree.rootPort.name)}`.trimEnd());
  }
  return rows.join("\n");
}
// show cdp interface: which ports send CDP, and how often
function cdpInterfaces(dev, only) {
  if (!dev.cdp) return "% CDP is not enabled";
  return sortedInterfaces(dev).filter((f) => f.cdp && !isSub(f.name) && !/^(Vlan|Loopback|Port-channel)/.test(f.name) && (!only || f.name === only)).map((f) => `${f.name} is ${status(dev, f).join(", line protocol is ")}\n  Encapsulation ${f.name.startsWith("Serial") ? "HDLC" : "ARPA"}\n  Sending CDP packets every ${dev.cdpTimer ?? 60} seconds\n  Holdtime is ${dev.cdpHold ?? 180} seconds`).join("\n");
}
// show snmp: the agent's counters, once a community turns it on
function snmpSummary(dev) {
  if (!Object.keys(dev.snmp.communities).length) return "%SNMP agent not enabled";
  return [`Chassis: FTX${String(dev.mac.replace(/\./g, "")).slice(-8).toUpperCase()}`, ...(dev.snmp.contact ? [`Contact: ${dev.snmp.contact}`] : []), ...(dev.snmp.location ? [`Location: ${dev.snmp.location}`] : []), "0 SNMP packets input", "    0 Bad SNMP version errors", "    0 Unknown community name", "    0 Illegal operation for community name supplied", "    0 Encoding errors", "    0 Number of requested variables", "    0 Number of altered variables", "    0 Get-request PDUs", "    0 Get-next PDUs", "    0 Set-request PDUs", "    0 Input queue packet drops (Maximum queue size 1000)", "0 SNMP packets output", "    0 Too big errors (Maximum packet size 1500)", "    0 No such name errors", "    0 Bad values errors", "    0 General errors", "    0 Response PDUs", "    0 Trap PDUs", `SNMP global trap: ${dev.snmp.traps ? "enabled" : "disabled"}`, "", "SNMP logging: " + (dev.snmp.hosts.length ? "enabled" : "disabled"), ...dev.snmp.hosts.map((h) => `    Logging to ${h.ip}.162, 0/10, 0 sent, 0 dropped.`)].join("\n");
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

// how the switch picks a member link for a frame (a 2960 hashes on source MAC by default)
function loadBalance(dev) {
  const how = dev.loadBalance ?? "src-mac";
  const mac = { "src-mac": "Source MAC address", "dst-mac": "Destination MAC address", "src-dst-mac": "Source XOR Destination MAC address", "src-ip": "Source MAC address", "dst-ip": "Destination MAC address", "src-dst-ip": "Source XOR Destination MAC address" }[how];
  const ip = { "src-ip": "Source IP address", "dst-ip": "Destination IP address", "src-dst-ip": "Source XOR Destination IP address" }[how] ?? mac;
  return ["EtherChannel Load-Balancing Configuration:", `        ${how}`, "", "EtherChannel Load-Balancing Addresses Used Per-Protocol:", `Non-IP: ${mac}`, `  IPv4: ${ip}`, `  IPv6: ${ip}`].join("\n");
}
const channelGroups = (dev) => {
  const groups = {};
  for (const f of sortedInterfaces(dev)) if (f.channel) (groups[f.channel.group] ??= []).push(f);
  return groups;
};
const ecState = (mode) => ({ active: "Active", passive: "Passive", desirable: "Desirable-Sl", auto: "Automatic-Sl", on: "On" })[mode] ?? "On";
function etherPortChannel(dev) {
  const out = ["                Channel-group listing:", "                ----------------------", ""];
  for (const [g, members] of Object.entries(channelGroups(dev))) {
    const inUse = members.filter((m) => bundled(dev, m));
    const proto = protocolOf(members[0].channel.mode);
    out.push(`Group: ${g}`, "----------", "                Port-channels in the group:", "                ---------------------------", "", `Port-channel: Po${g}${proto === "LACP" ? "    (Primary Aggregator)" : ""}`, "", "------------", "", "Age of the Port-channel   = 0d:01h:12m:03s", `Logical slot/port   = 2/${g}          Number of ports = ${inUse.length}`, "HotStandBy port = null", `Port state          = ${inUse.length ? "Port-channel Ag-Inuse" : "Port-channel Ag-Not-Inuse"}`, `Protocol            =   ${proto === "-" ? "" : proto}`, "Port security       = Disabled", "", "Ports in the Port-channel:", "", "Index   Load   Port     EC state        No of bits", "------+------+------+------------------+-----------");
    inUse.forEach((m, i) => out.push(`  ${i}     ${inUse.length > 1 ? (i % 2 ? "AA" : "55") : "FF"}     ${pad(short(m.name), 9)}${pad(ecState(m.channel.mode), 19)}${inUse.length > 1 ? 4 : 8}`));
    if (inUse.length) out.push("", `Time since last port bundled:    0d:01h:11m:58s    ${short(inUse[inUse.length - 1].name)}`);
    out.push("");
  }
  return out.join("\n");
}
// what each member hears from the switch on the other end of its cable
function channelNeighbors(dev, proto) {
  const groups = Object.entries(channelGroups(dev)).filter(([, ms]) => protocolOf(ms[0].channel.mode) === proto.toUpperCase());
  const out = proto === "lacp" ? ["Flags:  S - Device is requesting Slow LACPDUs", "        F - Device is requesting Fast LACPDUs", "        A - Device is in Active mode       P - Device is in Passive mode", ""] : ["Flags:  S - Device is sending Slow hello.  C - Device is in Consistent state.", "        A - Device is in Auto mode.        P - Device learns on physical port.", ""];
  for (const [g, members] of groups) {
    out.push(`Channel group ${g} neighbors`, "");
    if (proto === "lacp") out.push("Partner's information:", "", "                  LACP port                        Admin  Oper   Port    Port", "Port      Flags   Priority  Dev ID          Age    key    Key    Number  State");
    else out.push("          Partner              Partner          Partner         Partner Group", "Port      Name                 Device ID        Port       Age  Flags   Cap.");
    for (const m of members) {
      const end = dev.links[m.name];
      const p = end?.device.interfaces[end.iface];
      if (!p?.channel || p.shutdown || m.shutdown || protocolOf(p.channel.mode) !== proto.toUpperCase()) continue;
      if (proto === "lacp") out.push(`${pad(short(m.name), 10)}${pad(p.channel.mode === "active" ? "SA" : "SP", 8)}${pad(32768, 10)}${pad(end.device.mac, 16)}${pad("25s", 7)}${pad("0x0", 7)}${pad("0x" + p.channel.group.toString(16), 7)}${pad("0x" + (stpPortNumber(p) ?? 1).toString(16), 8)}${bundled(dev, m) ? "0x3D" : "0x45"}`);
      else out.push(`${pad(short(m.name), 10)}${pad(end.device.hostname, 21)}${pad(end.device.mac, 17)}${pad(short(p.name), 11)}${pad("10s", 5)}${pad(p.channel.mode === "auto" ? "SAC" : "SC", 8)}${10000 + p.channel.group}`);
    }
    out.push("");
  }
  return out.join("\n");
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
    const ports = members.map((m) => `${short(m.name)}(${bundled(dev, m) ? "P" : m.shutdown ? "D" : suspended(dev, m) ? "s" : protocolOf(m.channel.mode) === "-" ? "D" : "I"})`).join(" ");
    out.push(`${pad(g, 7)}${pad(`Po${g}(${layer}${anyUp ? "U" : "D"})`, 14)}${pad(protocolOf(members[0].channel.mode), 12)}${ports}`);
  }
  return out.join("\n");
}

// the holdtime a neighbor's entry shows: CDP counts down from the holdtime the
// neighbor sends and starts again at each advertisement; LLDP shows the TTL received
export const cdpHoldLeft = (d) => (d.cdpHold ?? 180) - (17 % (d.cdpTimer ?? 60));
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
    const phone = end.device.type === "phone";
    const cap = phone ? "H P" : end.device.type === "router" ? "R" : end.device.type === "l3switch" ? "R S" : "S";
    const platform = phone ? "IP Phone" : end.device.type === "router" ? "C2900" : end.device.type === "l3switch" ? "3560" : "2960";
    if (lldp) rows.push(`${pad(end.device.hostname, 21)}${pad(short(f.name), 15)}${pad(end.device.lldpHold ?? 120, 11)}${pad(end.device.type === "router" ? "R" : end.device.type === "l3switch" ? "B,R" : "B", 15)}${short(g.name)}`);
    else rows.push(`${pad(end.device.hostname, 17)}${pad(short(f.name), 17)}${pad(cdpHoldLeft(end.device), 10)}${pad(cap, 12)}${pad(platform, 10)}${phone ? `Port ${g.name.slice(-1)}` : short(g.name)}`);
  }
  if (lldp) rows.push("", `Total entries displayed: ${n}`);
  if (lldp && !dev.lldp) return "% LLDP is not enabled";
  if (!lldp && !dev.cdp) return "% CDP is not enabled";
  return rows.join("\n");
}

// one neighbor (show cdp entry <name>, * for all) or every one (detail)
function cdpDetail(dev, entry = null) {
  const out = [];
  for (const [name, end] of Object.entries(dev.links)) {
    const f = dev.interfaces[name];
    const g = end.device.interfaces[end.iface];
    if (!f || !g || f.shutdown || g.shutdown || !dev.cdp || !end.device.cdp || !f.cdp || !g.cdp || end.device.type === "pc") continue;
    if (entry && entry !== "*" && end.device.hostname !== entry) continue;
    const ip = g.ip ?? Object.values(end.device.interfaces).find((x) => x.ip)?.ip;
    // what the neighbor's CDP advertisement carries, as IOS 15 prints it
    const t = end.device.type;
    const platform = t === "phone" ? "Cisco IP Phone 7960" : t === "router" ? "Cisco CISCO2911/K9" : t === "l3switch" ? "cisco WS-C3560-24PS" : "cisco WS-C2960-24TT-L";
    const caps = t === "phone" ? "Host Phone" : t === "switch" ? "Switch IGMP" : "Router Switch IGMP";
    const version = t === "phone" ? "P00308010200" : t === "router" ? "Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.1(4)M4, RELEASE SOFTWARE (fc2)" : t === "l3switch" ? "Cisco IOS Software, C3560 Software (C3560-IPSERVICESK9-M), Version 15.0(2)SE4, RELEASE SOFTWARE (fc1)" : "Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE4, RELEASE SOFTWARE (fc1)";
    out.push("-------------------------", `Device ID: ${end.device.hostname}`, "Entry address(es): ", ...(ip ? [`  IP address: ${ip}`] : []), `Platform: ${platform},  Capabilities: ${caps} `, `Interface: ${f.name},  Port ID (outgoing port): ${g.name}`, `Holdtime : ${cdpHoldLeft(end.device)} sec`, "", "Version :", version, "Technical Support: http://www.cisco.com/techsupport", "Copyright (c) 1986-2012 by Cisco Systems, Inc.", "", "advertisement version: 2", ...(t !== "router" && t !== "phone" ? ["VTP Management Domain: ''", `Native VLAN: ${g.switchport ? g.nativeVlan ?? 1 : 1}`] : []), `Duplex: ${linkMode(end.device, g)?.duplex ?? (g.duplex === "half" ? "half" : "full")}`, "Management address(es): ", ...(ip ? [`  IP address: ${ip}`] : []), "");
  }
  if (!entry) out.push(`Total cdp entries displayed : ${out.filter((l) => l.startsWith("Device ID:")).length}`);
  return out.join("\n");
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

// a Windows or macOS client sends a client ID: 01 and its MAC
const clientId = (mac) => {
  const hex = "01" + mac.replace(/[^0-9a-f]/gi, "").toLowerCase();
  return hex.match(/.{1,4}/g).join(".");
};
// a lease's end, in IOS's "Oct 31 2026 04:12 AM"
const expires = (days) => {
  const t = new Date(Date.now() + days * 86400000);
  const h = t.getHours() % 12 || 12;
  return `${t.toLocaleString("en-US", { month: "short" })} ${String(t.getDate()).padStart(2, "0")} ${t.getFullYear()} ${String(h).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")} ${t.getHours() < 12 ? "AM" : "PM"}`;
};
function dhcpPool(dev, only) {
  return Object.entries(dev.dhcp.pools)
    .filter(([name]) => !only || name === only)
    .map(([name, p]) => {
      const bits = p.mask ? maskBits(p.mask) : 0;
      const size = p.mask ? 2 ** (32 - bits) - 2 : 0;
      // the pool's hosts, the excluded ones among them, its leases, and the
      // next address it would hand out
      const base = p.network ? parseIp(p.network) : 0;
      const ipOf = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
      const isExcl = (n) => dev.dhcp.excluded.some((e) => n >= parseIp(e.from) && n <= parseIp(e.to ?? e.from));
      const leases = (dev.dhcp.leases ?? []).filter((l) => l.pool === name);
      let excl = 0, next = null;
      for (let n = base + 1; n <= base + size; n++) {
        if (isExcl(n)) excl++;
        else if (next === null && !leases.some((l) => parseIp(l.ip) === n)) next = n;
      }
      const first = p.network ? ipOf(base + 1) : "0.0.0.0", last = p.network ? ipOf(base + size) : "0.0.0.0";
      return `\nPool ${name} :\n Utilization mark (high/low)    : 100 / 0\n Subnet size (first/next)       : 0 / 0\n Total addresses                : ${size}\n Leased addresses               : ${leases.length}\n Excluded addresses             : ${excl}\n Pending event                  : none\n\n 1 subnet is currently in the pool :\n Current index        IP address range                    Leased/Excluded/Total\n ${pad(next === null ? "0.0.0.0" : ipOf(next), 21)}${first}     - ${last}  ${leases.length} / ${excl} / ${size}`;
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
    for (const e of acl.entries) out.push(`    ${e.seq} ${aceText(e, acl.type === "standard")}${e.matches ? ` (${e.matches} match${e.matches === 1 ? "" : "es"})` : ""}`);
  }
  return out.join("\n");
}

// the area's link-state database as this router holds it: a router LSA for
// every router it can reach over full adjacencies (its link count: one per
// transit or stub network, two per point-to-point neighbor), a network LSA
// per segment with a DR, and a type-5 for a default an ASBR originates
function ospfDatabase(dev) {
  const pid = Number(Object.keys(dev.ospf)[0] ?? 1);
  if (!dev.ospf[pid]) return "";
  const routers = [dev];
  for (let i = 0; i < routers.length; i++) for (const n of ospfNeighbors(routers[i])) if (n.up && !routers.includes(n.device)) routers.push(n.device);
  const hex = (n) => "0x00" + (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  const sum = (t) => [...t].reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) & 0xffffff, 5381);
  const ridOf = (r) => routerId(r, Number(Object.keys(r.ospf)[0] ?? 1));
  const rows = [], nets = [], ext = [];
  routers.forEach((r, i) => {
    const rid = ridOf(r);
    let links = 0;
    for (const f of Object.values(r.interfaces)) {
      if (!ospfOf(r, f) || status(r, f)[1] !== "up" || !f.ip) continue;
      const nb = ospfNeighbors(r).filter((n) => n.iface === f && n.up);
      if (nb.length && (f.ospf.network === "point-to-point" || nb.some((n) => n.p2p))) links += 2;
      else links += 1;
      const e = nb.length ? ospfElection(r, f) : null;
      if (e?.mine === "DR") nets.push({ id: f.ip, adv: rid });
    }
    rows.push({ id: rid, adv: rid, age: 312 - i * 17, links });
    const p = Object.values(r.ospf)[0];
    if (p?.defaultOriginate && (p.defaultOriginate === "always" || r.routes.some((x) => x.net === "0.0.0.0" && x.mask === "0.0.0.0" && staticUsable(r, x)))) ext.push({ id: "0.0.0.0", adv: rid });
  });
  const out = [`            OSPF Router with ID (${ridOf(dev)}) (Process ID ${pid})`, "", "                Router Link States (Area 0)", "", "Link ID         ADV Router      Age         Seq#       Checksum Link count"];
  for (const r of rows.sort((a, b) => parseIp(a.id) - parseIp(b.id))) out.push(`${pad(r.id, 16)}${pad(r.adv, 16)}${pad(r.age, 12)}0x80000004 ${hex(sum(r.id + r.links))} ${r.links}`);
  if (nets.length) {
    out.push("", "                Net Link States (Area 0)", "", "Link ID         ADV Router      Age         Seq#       Checksum");
    for (const n of nets.sort((a, b) => parseIp(a.id) - parseIp(b.id))) out.push(`${pad(n.id, 16)}${pad(n.adv, 16)}${pad(298, 12)}0x80000001 ${hex(sum(n.id))}`);
  }
  if (ext.length) {
    out.push("", "                Type-5 AS External Link States", "", "Link ID         ADV Router      Age         Seq#       Checksum Tag");
    for (const x of ext) out.push(`${pad(x.id, 16)}${pad(x.adv, 16)}${pad(402, 12)}0x80000001 ${hex(sum(x.adv + "e"))} 1`);
  }
  return out.join("\n");
}

// AAA servers as IOS lists them: RADIUS with its state, TACACS+ with its socket counters
function aaaServers(dev) {
  if (!dev.aaa.newModel) return "";
  const out = [];
  let id = 1;
  for (const s of Object.values(dev.aaa.radius)) {
    const up = aaaServerUp(dev, "radius", s);
    out.push(`RADIUS: id ${id++}, priority 1, host ${s.address}, auth-port ${s.auth}, acct-port ${s.acct}`, `     State: current ${up ? "UP" : "DEAD"}, duration ${up ? 3086 : 0}s, previous duration 0s`, `     Dead: total time ${up ? 0 : 3086}s, count ${up ? 0 : 1}`, `     Authen: request ${up ? 4 : 3}, timeouts ${up ? 0 : 9}, failover 0, retransmission ${up ? 0 : 6}`, `             Response: accept ${up ? 4 : 0}, reject 0, challenge 0`);
  }
  for (const s of Object.values(dev.aaa.tacacs)) {
    const up = aaaServerUp(dev, "tacacs", s);
    out.push(`TACACS+: id ${id++}, priority 1, host ${s.address}, port ${s.port}`, `     State: current ${up ? "UP" : "DEAD"}, duration ${up ? 3086 : 0}s, previous duration 0s`);
  }
  return out.join("\n");
}
function tacacsServers(dev) {
  return Object.entries(dev.aaa.tacacs).map(([n, s]) => {
    const up = aaaServerUp(dev, "tacacs", s);
    const row = (k, v) => `${k.padStart(27)}: ${v}`;
    return [`Tacacs+ Server -  public  :`, row("Server name", s.legacy ? "" : n), row("Server address", s.address ?? "0.0.0.0"), row("Server port", s.port), row("Socket opens", String(up ? 4 : 0).padStart(10)), row("Socket closes", String(up ? 4 : 0).padStart(10)), row("Socket aborts", String(0).padStart(10)), row("Socket errors", String(0).padStart(10)), row("Socket Timeouts", String(up ? 0 : 3).padStart(10)), row("Failed Connect Attempts", String(up ? 0 : 3).padStart(10)), row("Total Packets Sent", String(up ? 8 : 0).padStart(10)), row("Total Packets Recv", String(up ? 8 : 0).padStart(10))].join("\n");
  }).join("\n\n");
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
      `Total MAC Addresses        : ${f.ps.macs.length + (f.ps.learned ?? []).length}`,
      `Configured MAC Addresses   : ${f.ps.macs.length}`,
      `Sticky MAC Addresses       : ${(f.ps.learned ?? []).filter((l) => l.sticky).length}`,
      `Last Source Address:Vlan   : ${f.lastViolator ?? ((f.ps.learned ?? []).length ? `${f.ps.learned[f.ps.learned.length - 1].mac}:${f.accessVlan}` : "0000.0000.0000:0")}`,
      `Security Violation Count   : ${f.violations ?? 0}`,
    ].join("\n");
  }
  const rows = ["Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action", "                (Count)       (Count)          (Count)", "----------------------------------------------------------------------------"];
  for (const f of sortedInterfaces(dev).filter((f) => f.ps.enabled)) rows.push(`${pad(short(f.name), 13)}${pad(f.ps.max, 15)}${pad(f.ps.macs.length + (f.ps.learned ?? []).length, 13)}${pad(f.violations ?? 0, 19)}${f.ps.violation[0].toUpperCase() + f.ps.violation.slice(1)}`);
  rows.push("----------------------------------------------------------------------------", `Total Addresses in System (excluding one mac per port)     : ${Object.values(dev.interfaces).reduce((n, f) => n + Math.max(0, f.ps.macs.length + (f.ps.learned ?? []).length - 1), 0)}`, "Max Addresses limit in System (excluding one mac per port) : 1024");
  return rows.join("\n");
}

function standby(dev, brief, all) {
  const rows = brief ? ["                     P indicates configured to preempt.", "                     |", `${pad("Interface", 11)}${pad("Grp", 5)}${pad("Pri", 4)}${pad("P", 2)}${pad("State", 8)}${pad("Active", 16)}${pad("Standby", 16)}Virtual IP`] : [];
  for (const f of sortedInterfaces(dev)) {
    for (const [g, grp] of Object.entries(f.hsrp.groups)) {
      // a group without a virtual IP never starts
      const rank = grp.ip ? hsrpRanking(dev, grp.ip, all ?? [dev], Number(g)) : [];
      const me = rank.findIndex((m) => m.device === dev && m.iface === f);
      const state = !grp.ip || status(dev, f)[1] !== "up" ? "Init" : me === 0 ? "Active" : me === 1 ? "Standby" : "Listen";
      const active = rank[0]?.device === dev ? "local" : rank[0]?.ip ?? "unknown";
      const stand = rank[1]?.device === dev ? "local" : rank[1]?.ip ?? "unknown";
      if (brief) rows.push(`${pad(short(f.name), 11)}${pad(g, 5)}${pad(grp.priority, 4)}${pad(grp.preempt ? "P" : "", 2)}${pad(state, 8)}${pad(active, 16)}${pad(stand, 16)}${grp.ip ?? "unknown"}`);
      else rows.push(`${f.name} - Group ${g}${f.hsrp.version === 2 ? " (version 2)" : ""}`, `  State is ${state}`, `  Virtual IP address is ${grp.ip ?? "unknown"}`, `  Active virtual MAC address is ${f.hsrp.version === 2 ? "0000.0c9f.f" + Number(g).toString(16).padStart(3, "0") : "0000.0c07.ac" + Number(g).toString(16).padStart(2, "0")}`, "  Hello time 3 sec, hold time 10 sec", `  Preemption ${grp.preempt ? "enabled" : "disabled"}`, `  Active router is ${active}`, `  Standby router is ${stand}`, `  Priority ${grp.priority} (${grp.priority === 100 ? "default 100" : "configured " + grp.priority})`, `  Group name is "hsrp-${short(f.name)}-${g}" (default)`);
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

// the neighbor cache: the IPv6 addresses (global on the same prefix, and
// link-local) of the device across each up IPv6 link, as neighbor discovery
// finds them
function ipv6Neighbors(dev, only) {
  const rows = ["IPv6 Address                              Age Link-layer Addr State Interface"];
  const row = (a, mac, state, f) => rows.push(`${pad(compressIpv6(a).toUpperCase(), 42)}${"0".padStart(3)} ${pad(mac, 16)}${pad(state, 6)}${short(f.name)}`);
  for (const f of sortedInterfaces(dev)) {
    if ((only && f.name !== only) || !(f.ipv6Enabled || f.ipv6.length) || status(dev, f)[1] !== "up") continue;
    const end = far(dev, f.name);
    const p = end?.iface;
    if (p && (p.ipv6Enabled || p.ipv6?.length) && status(end.device, p)[1] === "up" && !end.device.host) {
      const mine = f.ipv6.map((a) => ipv6Network(a.addr, a.bits));
      for (const a of [...p.ipv6.filter((a) => mine.includes(ipv6Network(a.addr, a.bits))).map((a) => a.addr), p.ipv6LinkLocal ?? linkLocal(end.device)]) row(a, end.device.mac, "REACH", f);
    }
    // PCs whose frames reach this interface (or its subinterface): their
    // link-local from the Router Solicitation, their global address once used
    for (const pc of (dev.lab?.all ?? []).filter((d) => d.host && Object.values(d.interfaces)[0].ipv6?.length)) {
      if (!segment(pc).some((n) => n.device === dev && n.iface === f)) continue;
      for (const a of Object.values(pc.interfaces)[0].ipv6) row(a.addr, pc.mac, "REACH", f);
      row(linkLocal(pc), pc.mac, "STALE", f);
    }
  }
  return rows.join("\n");
}

function linkLocal(dev) {
  const hex = dev.mac.replace(/\./g, "");
  const first = (parseInt(hex.slice(0, 2), 16) ^ 2).toString(16).padStart(2, "0");
  return `fe80::${first}${hex.slice(2, 4)}:${hex.slice(4, 6)}ff:fe${hex.slice(6, 8)}:${hex.slice(8)}`;
}

function ipv6Route(dev) {
  const out = ["IPv6 Routing Table - default - 1 entries", "Codes: C - Connected, L - Local, S - Static, U - Per-user Static route", "       B - BGP, R - RIP, I1 - ISIS L1, I2 - ISIS L2", "       IA - ISIS interarea, IS - ISIS summary, D - EIGRP, EX - EIGRP external", "       O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1, OE2 - OSPF ext 2", "       ND - ND Default, NDp - ND Prefix, DCE - Destination, NDr - Redirect", ""];
  for (const f of sortedInterfaces(dev)) {
    if (status(dev, f)[1] !== "up") continue;
    for (const a of f.ipv6) {
      if (a.auto) out.push(`NDp ${compressIpv6(ipv6Network(a.addr, a.bits))}/${a.bits} [2/0]`, `     via ${f.name}, directly connected`);
      else out.push(`C   ${compressIpv6(ipv6Network(a.addr, a.bits))}/${a.bits} [0/0]`, `     via ${f.name}, directly connected`);
      out.push(`L   ${compressIpv6(a.addr)}/128 [0/0]`, `     via ${f.name}, receive`);
    }
  }
  // a static route is in the table only when its next hop is on a connected
  // prefix (or its exit interface is up)
  const connected = sortedInterfaces(dev).filter((f) => status(dev, f)[1] === "up").flatMap((f) => f.ipv6.map((a) => ({ net: ipv6Network(a.addr, a.bits), bits: a.bits })));
  const usable = (r) => (r.out ? status(dev, dev.interfaces[r.out] ?? {})[1] === "up" : connected.some((c) => ipv6Network(r.via, c.bits) === c.net));
  for (const r of dev.ipv6Routes.filter(usable)) {
    if (r.nd) out.push(`ND  ${compressIpv6(r.addr)}/${r.bits} [2/0]`, `     via ${compressIpv6(r.ll)}, ${r.out}`);
    else out.push(`S   ${compressIpv6(r.addr)}/${r.bits} [${r.ad}/0]`, `     via ${r.via ? compressIpv6(r.via) : ""}${r.out ? (r.via ? ", " : "") + r.out : ""}`);
  }
  out.push("L   FF00::/8 [0/0]", "     via Null0, receive");
  out[0] = `IPv6 Routing Table - default - ${out.filter((l) => /^([CLS]|NDp?) /.test(l)).length} entries`;
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

// the clock, in the local zone (clock timezone, an hour more in summer time).
// A * means it is not authoritative: never set by hand and not synced by NTP.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const nthSunday = (y, m, n) => { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; };
const lastSunday = (y, m) => { const last = new Date(Date.UTC(y, m + 1, 0)); return last.getUTCDate() - last.getUTCDay(); };
function inSummer(dev, ms) {
  const t = new Date(ms), y = t.getUTCFullYear();
  const eu = /last\s+sun\w*\s+mar/i.test(dev.clock.summerRule ?? "");
  const start = eu ? Date.UTC(y, 2, lastSunday(y, 2), 1) : Date.UTC(y, 2, nthSunday(y, 2, 2), 7);
  const end = eu ? Date.UTC(y, 9, lastSunday(y, 9), 1) : Date.UTC(y, 10, nthSunday(y, 10, 1), 6);
  return ms >= start && ms < end;
}
export function clockText(dev, detail = false) {
  const tz = dev.clock.timezone;
  const offset = tz ? (tz.hours * 60 + (tz.hours < 0 ? -1 : 1) * (tz.minutes ?? 0)) * 60000 : 0;
  const synced = (dev.ntp.servers.length || dev.ntp.master) && ntpSync(dev);
  let utc = Date.UTC(1993, 2, 1, 12, 13, 47, 123);
  if (dev.clock.set) {
    const [time, x, z, year] = dev.clock.set.split(" ");
    const month = MONTHS.findIndex((m) => [x, z].some((w) => w && w.toLowerCase().startsWith(m)));
    const day = Number([x, z].find((w) => /^\d+$/.test(w)));
    const [h, mi, se = 0] = time.split(":").map(Number);
    utc = Date.UTC(Number(year), Math.max(0, month), day, h, mi, se, 3) - offset;
  }
  if (synced && !dev.clock.set) utc = Date.UTC(2026, 10, 3, 9, 14, 22, 517);
  const dst = dev.clock.summer && inSummer(dev, utc);
  const t = new Date(utc + offset + (dst ? 3600000 : 0));
  const two = (n) => String(n).padStart(2, "0");
  const zone = dst ? dev.clock.summer : tz?.zone ?? "UTC";
  const line = `${synced || dev.clock.set ? "" : "*"}${two(t.getUTCHours())}:${two(t.getUTCMinutes())}:${two(t.getUTCSeconds())}.${String(t.getUTCMilliseconds()).padStart(3, "0")} ${zone} ${DAYS[t.getUTCDay()]} ${MONTHS[t.getUTCMonth()][0].toUpperCase() + MONTHS[t.getUTCMonth()].slice(1)} ${t.getUTCDate()} ${t.getUTCFullYear()}`;
  return detail ? `${line}\n${synced ? "Time source is NTP" : dev.clock.set ? "Time source is user configuration" : "No time source"}` : line;
}

// show hosts: the name lookup settings and the static and learned names
function hostsTable(dev) {
  const rows = [`Default domain is ${dev.domainName ?? "not set"}`, `Name/address lookup uses ${dev.domainLookup && dev.nameServers.length ? "domain service" : "static mappings"}`, ...(dev.nameServers.length ? [`Name servers are ${dev.nameServers.join(", ")}`] : []), "", "Codes: UN - unknown, EX - expired, OK - OK, ?? - revalidate", "       temp - temporary, perm - permanent", "       NA - Not Applicable None - Not defined", "", `${pad("Host", 26)}${pad("Port", 6)}${pad("Flags", 11)}${pad("Age", 4)}${pad("Type", 7)}Address(es)`];
  for (const [name, ip] of Object.entries(dev.hosts)) rows.push(`${pad(name, 26)}${pad("None", 6)}${pad("(perm, OK)", 11)}${pad("0", 4)}${pad("IP", 7)}${ip}`);
  return rows.join("\n");
}
// show controllers serial: which end of the cable this is, and its clock
function controllers(dev, name) {
  const f = dev.interfaces[name];
  if (!f?.name.startsWith("Serial")) return "% Invalid input detected at '^' marker.";
  const end = far(dev, f.name);
  const head = [`Interface ${f.name}`, "Hardware is GT96K"];
  if (!end) return [...head, "No serial cable attached", "idb at 0x6913E3B0, driver data structure at 0x6914B8E0"].join("\n");
  const dce = f.dce;
  const clocked = dce ? f.clockRate : end.iface.clockRate;
  const line = dce ? (f.clockRate ? `DCE V.35, clock rate ${f.clockRate}` : "DCE V.35, no clock") : clocked ? "DTE V.35 TX and RX clocks detected." : "DTE V.35 clocks stopped.";
  return [...head, line, "idb at 0x6913E3B0, driver data structure at 0x6914B8E0", "wic_info 0x6914C0C8", "Physical Port 0, SCC Num 0", "MPSC Registers:", "MMCR_L=0x000304C0, MMCR_H=0x00000000, MPCR=0x00000000", "CHR1=0x00FE007E, CHR2=0x00000000, CHR3=0x0000064A, CHR4=0x00000000"].join("\n");
}

function ntpStatus(dev) {
  if (!dev.ntp.master && !dev.ntp.servers.length) return "%NTP is not enabled.";
  const s = ntpSync(dev);
  if (!s) return "Clock is unsynchronized, stratum 16, no reference clock\nnominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**24\nreference time is 00000000.00000000 (00:00:00.000 UTC Mon Jan 1 1900)";
  return `Clock is synchronized, stratum ${s.stratum}, reference is ${s.ref}\nnominal freq is 250.0000 Hz, actual freq is 249.9990 Hz, precision is 2**${dev.ntp.master ? 19 : 24}`;
}
// each configured server: * the one in use, its stratum and reference;
// one that never answered stays at .INIT. and stratum 16
function ntpAssociations(dev) {
  const s = ntpSync(dev);
  const rows = dev.ntp.servers.map((sv) => {
    const used = s?.server === sv.ip;
    return used ? `*~${pad(sv.ip, 16)}${pad(s.peerRef, 16)}${pad(s.peer, 5)}    14     64   377  1.204   0.009   0.184` : ` ~${pad(sv.ip, 16)}${pad(".INIT.", 16)}16      -     64     0  0.000   0.000 15937.`;
  });
  if (dev.ntp.master) rows.unshift(`*~${pad("127.127.1.1", 16)}${pad(".LOCL.", 16)}${pad(dev.ntp.master - 1, 5)}     6     16   377  0.000   0.000   0.240`);
  return ["  address         ref clock       st   when   poll reach  delay  offset   disp", ...rows, " * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured"].join("\n");
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
    // what the switch logged while the lab ran (violations, DAI drops), and
    // CDP's complaint about a duplex mismatch with a neighbor
    ...((log) => (log.length ? ["", "Log Buffer (4096 bytes):", "", ...log] : []))([...(dev.logBuffer ?? []), ...duplexLog(dev)]),
  ].join("\n");
}

// CDP compares its own duplex with the one the neighbor advertises
function duplexLog(dev) {
  if (!dev.cdp) return [];
  return ethPorts(dev).flatMap((f) => {
    const m = status(dev, f)[1] === "up" ? linkMode(dev, f) : null;
    const end = far(dev, f.name);
    if (!m?.mismatch || !f.cdp || !end.iface.cdp || !end.device.cdp || end.device.type === "pc") return [];
    return [`*Mar  1 01:${String(10 + (seedOf(f.name) % 49)).padStart(2, "0")}:42.117: %CDP-4-DUPLEX_MISMATCH: duplex mismatch discovered on ${f.name} (not ${m.farDuplex} duplex), with ${end.device.hostname} ${end.name} (${m.farDuplex} duplex).`];
  });
}
const seedOf = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 3);

function vtpStatus(dev) {
  return [`VTP Version capable             : 1 to 3`, `VTP version running             : ${dev.vtp.version}`, `VTP Domain Name                 : ${dev.vtp.domain ?? ""}`, "VTP Pruning Mode                : Disabled", "VTP Traps Generation            : Disabled", `Device ID                       : ${dev.mac}`, "", `Feature VLAN:`, "--------------", `VTP Operating Mode                : ${dev.vtp.mode[0].toUpperCase() + dev.vtp.mode.slice(1)}`, "Maximum VLANs supported locally   : 255", `Number of existing VLANs          : ${Object.keys(dev.vlans).length + 4}`].join("\n");
}

function sshInfo(dev) {
  if (!dev.rsa) return "SSH Disabled - version 1.99\n%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).";
  const v = dev.sshVersion === 2 ? "2.0" : dev.sshVersion === 1 ? "1.5" : "1.99";
  return `SSH Enabled - version ${v}\nAuthentication timeout: ${dev.sshTimeout ?? 120} secs; Authentication retries: ${dev.sshRetries ?? 3}\nMinimum expected Diffie Hellman key size : 1024 bits\nIOS Keys in SECSH format(ssh-rsa, base64 encoded): ${dev.hostname}`;
}

// the ARP cache: the router's own addresses (age -), and what it has learned:
// next hops it sent to, OSPF neighbors on Ethernet, hosts that ARPed for it
function arp(dev) {
  const rows = [`${pad("Protocol", 10)}${pad("Address", 17)}${pad("Age (min)", 11)}${pad("Hardware Addr", 16)}${pad("Type", 7)}Interface`];
  const entries = new Map();
  for (const f of sortedInterfaces(dev)) if (f.ip && status(dev, f)[1] === "up") entries.set(f.ip, { mac: dev.mac, iface: f.name, age: "-" });
  const upIf = (ip) => sortedInterfaces(dev).find((f) => f.ip && f.mask && status(dev, f)[1] === "up" && network(ip, maskBits(f.mask)) === network(f.ip, maskBits(f.mask)));
  const learn = (ip, mac, iface, age) => {
    if (!entries.has(ip) && iface != null) entries.set(ip, { mac, iface, age });
  };
  for (const n of ospfNeighbors(dev).filter((n) => n.up && !n.iface.name.startsWith("Serial"))) learn(n.ip, n.device.mac, n.iface.name, "12");
  for (const ip of dev.arped ?? []) {
    const o = (dev.lab?.all ?? []).find((d) => d !== dev && Object.values(d.interfaces).some((f) => f.ip === ip));
    if (o) learn(ip, o.mac, upIf(ip)?.name, "3");
    else if (upIf(ip)) learn(ip, "Incomplete", "", "0");
  }
  for (const [ip, a] of Object.entries(dev.arpLearned ?? {})) if (upIf(ip)) learn(ip, a.mac, a.iface, "1");
  for (const a of dev.lab?.arp ?? []) learn(a.ip, a.mac, a.iface, "0");
  for (const [ip, e] of [...entries].sort((a, b) => parseIp(a[0]) - parseIp(b[0]))) rows.push(`${pad("Internet", 10)}${pad(ip, 17)}${pad(e.age, 11)}${pad(e.mac, 16)}${pad("ARPA", 7)}${e.iface}`.trimEnd());
  return rows.join("\n");
}

function snooping(dev) {
  const rows = [`Switch DHCP snooping is ${dev.snooping.enabled ? "enabled" : "disabled"}`, "DHCP snooping is configured on following VLANs:", rangeText(dev.snooping.vlans) || "none", `Insertion of option 82 is ${dev.snooping.option82 ? "enabled" : "disabled"}`, "Interface                  Trusted    Allow option    Rate limit (pps)", "-----------------------    -------    ------------    ----------------"];
  for (const f of sortedInterfaces(dev).filter((f) => f.snoopTrust || f.snoopRate)) rows.push(`${pad(f.name, 27)}${pad(f.snoopTrust ? "yes" : "no", 11)}${pad("no", 16)}${f.snoopRate ?? "unlimited"}`);
  return rows.join("\n");
}

function dai(dev, only) {
  const vlans = only ?? dev.dai.vlans;
  const rows = ["", "Source Mac Validation      : Disabled", "Destination Mac Validation : Disabled", "IP Address Validation      : Disabled", "", " Vlan     Configuration    Operation   ACL Match          Static ACL", " ----     -------------    ---------   ---------          ----------"];
  for (const v of vlans) rows.push(`${String(v).padStart(5)}     ${pad(dev.dai.vlans.includes(v) ? "Enabled" : "Disabled", 17)}${dev.dai.vlans.includes(v) && dev.vlans[v] ? "Active" : "Inactive"}`);
  rows.push("", " Vlan     ACL Logging      DHCP Logging      Probe Logging", " ----     -----------      ------------      -------------");
  for (const v of vlans) rows.push(`${String(v).padStart(5)}     Deny             Deny              Off`);
  rows.push("", " Vlan      Forwarded        Dropped     DHCP Drops      ACL Drops", " ----      ---------        -------     ----------      ---------");
  for (const v of vlans) {
    const drops = (dev.logBuffer ?? []).filter((l) => l.includes("SW_DAI") && l.includes(`vlan ${v}.`)).length;
    rows.push(`${String(v).padStart(5)}${String(dev.daiForwarded?.[v] ?? 0).padStart(14)}${String(drops).padStart(15)}${String(drops).padStart(15)}${"0".padStart(15)}`);
  }
  return rows.join("\n");
}
function daiInterfaces(dev) {
  const rows = ["", " Interface        Trust State     Rate (pps)    Burst Interval", " ---------------  -----------     ----------    --------------"];
  for (const f of sortedInterfaces(dev).filter((f) => f.switchport && /Ethernet/.test(f.name))) rows.push(` ${pad(short(f.name), 17)}${pad(f.daiTrust ? "Trusted" : "Untrusted", 16)}${pad(f.daiTrust ? "None" : "15", 14)}${f.daiTrust ? "N/A" : "1"}`);
  return rows.join("\n");
}
function snoopingBindings(dev, all = false) {
  const mac = (m) => m.replace(/\./g, "").replace(/(..)(?=.)/g, "$1:").toUpperCase();
  // show ip dhcp snooping binding lists the learned ones; show ip source
  // binding the static ones too
  const b = (dev.snooping.bindings ?? []).filter((x) => all || !x.static);
  return ["MacAddress          IpAddress        Lease(sec)  Type           VLAN  Interface", "------------------  ---------------  ----------  -------------  ----  --------------------", ...b.map((x) => `${pad(mac(x.mac), 20)}${pad(x.ip, 17)}${pad(x.static ? "infinite" : x.lease - 2, 12)}${pad(x.static ? "static" : "dhcp-snooping", 15)}${pad(x.vlan, 6)}${x.iface}`), `Total number of bindings: ${b.length}`, ""].join("\n");
}

export const SHOWS = {
  flash,
  patterns: [
    ["show running-config [interface <name:iface>]", (d, a) => runningConfig(d, a.name), true],
    ["show startup-config", (d) => (d.saved ? runningConfig({ ...d.saved, lab: d.lab, links: d.links }).replace("Building configuration...\n\nCurrent configuration", "Using 1024 out of 262136 bytes\n!") : "startup-config is not present"), true],
    ["show version", (d) => version(d)],
    ["show ip interface brief", (d) => ipIntBrief(d)],
    ["show ip interface [<name:iface>]", (d, a) => sortedInterfaces(d).filter((f) => !a.name || f.name === a.name).map((f) => ipInterface(d, f)).join("\n")],
    ["show interfaces [<name:iface>]", (d, a) => interfaces(d, a.name)],
    ["show interfaces <name:iface> switchport", (d, a) => switchportInfo(d, a.name)],
    ["show interfaces switchport", (d) => sortedInterfaces(d).filter((f) => f.switchport).map((f) => switchportInfo(d, f.name)).join("\n\n")],
    ["show interfaces trunk", (d) => trunks(d)],
    ["show interfaces counters", (d) => intCounters(d)],
    ["show interfaces counters errors", (d) => intErrors(d)],
    ["show interfaces status", (d) => intStatus(d)],
    ["show interfaces status err-disabled", (d) => intStatus(d, true)],
    ["show spanning-tree pathcost method", (d) => `Spanning tree default pathcost method used is ${d.stp.pathcost}`],
    ["show dhcp lease", (d) => dhcpLease(d)],
    ["show interfaces description", (d) => [`${pad("Interface", 31)}${pad("Status", 15)}${pad("Protocol", 9)}Description`, ...sortedInterfaces(d).map((f) => `${pad(short(f.name), 31)}${pad(status(d, f)[0] === "administratively down" ? "admin down" : status(d, f)[0], 15)}${pad(status(d, f)[1], 9)}${f.description ?? ""}`)].join("\n")],
    ["show vlan [brief]", (d, a, c) => vlanBrief(d, !c.has("brief"))],
    ["show vlan id <id:num:1-4094>", (d, a) => (d.vlans[a.id] ? vlanBrief({ ...d, vlans: { [a.id]: d.vlans[a.id] } }, false).split("\n").slice(0, 3).join("\n") : `VLAN id ${a.id} not found in current VLAN database`)],
    ["show mac address-table [(dynamic | static)] [(interface <name:iface> | vlan <v:num:1-4094>)]", (d, a, c) => macTable(d, a, c)],
    ["show mac address-table count", (d) => macCount(d)],
    ["show mac address-table aging-time", (d) => `Global Aging Time: ${String(d.macAging).padStart(5)}\nVlan    Aging Time\n----    ----------`],
    ["show ip route [(<net:ip> | static | connected | ospf)]", (d, a, c) => {
      if (c.has("static")) return ipRoute(d, { only: (r) => r.code === "S" });
      if (c.has("connected")) return ipRoute(d, { only: (r) => r.code === "C" || r.code === "L" });
      if (c.has("ospf")) return ipRoute(d, { only: (r) => r.code.startsWith("O") });
      return ipRoute(d, a);
    }],
    ["show ip protocols", (d) => ipProtocols(d)],
    ["show ip ospf neighbor [detail]", (d) => ospfNeighbor(d)],
    ["show ip ospf interface [<name:iface>]", (d, a) => ospfInterface(d, a.name, false)],
    ["show ip ospf interface brief", (d) => ospfInterface(d, null, true)],
    ["show ip ospf", (d) => Object.keys(d.ospf).map((pid) => ` Routing Process "ospf ${pid}" with ID ${routerId(d, Number(pid))}\n Start time: 00:00:12.508, Time elapsed: 01:12:03.304\n Supports only single TOS(TOS0) routes\n Reference bandwidth unit is ${d.ospf[pid].refBw ?? 100} mbps\n    Area BACKBONE(0)\n        Number of interfaces in this area is ${Object.values(d.interfaces).filter((f) => ospfOf(d, f)?.pid === Number(pid)).length}`).join("\n")],
    ["show ip ospf database", (d) => ospfDatabase(d)],
    ["show ip rip database", () => ""],
    ["show ip eigrp neighbors", () => "EIGRP-IPv4 Neighbors for AS(100)\nH   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq"],
    ["show spanning-tree [vlan <v:num:1-4094>]", (d, a) => spanningTree(d, a.v)],
    ["show spanning-tree summary", (d) => stpSummary(d)],
    ["show spanning-tree root", (d) => stpRootTable(d)],
    ["show spanning-tree interface <name:iface> [detail]", (d, a) => stpInterface(d, a.name)],
    ["show etherchannel summary", (d) => etherchannel(d)],
    ["show etherchannel load-balance", (d) => loadBalance(d)],
    ["show etherchannel port-channel", (d) => etherPortChannel(d)],
    ["show lacp neighbor", (d) => channelNeighbors(d, "lacp")],
    ["show pagp neighbor", (d) => channelNeighbors(d, "pagp")],
    ["show etherchannel port-channel", (d) => etherchannel(d)],
    ["show cdp neighbors", (d) => cdpNeighbors(d, false)],
    ["show cdp interface [<name:iface>]", (d, a) => cdpInterfaces(d, a.name)],
    ["show cdp neighbors detail", (d) => cdpDetail(d)],
    ["show cdp entry <name:word>", (d, a) => cdpDetail(d, a.name)],
    ["show cdp", (d) => (d.cdp ? `Global CDP information:\n        Sending CDP packets every ${d.cdpTimer ?? 60} seconds\n        Sending a holdtime value of ${d.cdpHold ?? 180} seconds\n        Sending CDPv2 advertisements is  enabled` : "% CDP is not enabled")],
    ["show lldp neighbors [detail]", (d) => cdpNeighbors(d, true)],
    ["show lldp", (d) => (d.lldp ? `Global LLDP Information:\n    Status: ACTIVE\n    LLDP advertisements are sent every ${d.lldpTimer ?? 30} seconds\n    LLDP hold time advertised is ${d.lldpHold ?? 120} seconds\n    LLDP interface reinitialisation delay is ${d.lldpReinit ?? 2} seconds` : "% LLDP is not enabled")],
    ["show ip dhcp pool [<name:word>]", (d, a) => dhcpPool(d, a.name)],
    ["show ip dhcp binding", (d) => ["Bindings from all pools not associated with VRF:", `${pad("IP address", 18)}${pad("Client-ID/", 20)}${pad("Lease expiration", 26)}Type`, `${pad("", 18)}Hardware address/`, ...(d.lab?.bindings ?? []).map((b) => `${pad(b.ip, 18)}${pad(b.mac, 20)}${pad("Mar 02 2026 12:00 AM", 26)}Automatic`), ...(d.dhcp?.leases ?? []).map((l) => `${pad(l.ip, 18)}${pad(l.clientId ? clientId(l.mac) : l.mac, 20)}${pad(expires(l.days), 26)}Automatic`)].join("\n")],
    ["show ip dhcp conflict", () => "IP address        Detection method   Detection time          VRF"],
    ["show ip nat translations [verbose]", (d) => natTranslations(d)],
    ["show ip nat statistics", (d) => `Total active translations: ${natCounts(d).total} (${d.nat.statics.length} static, ${natCounts(d).dynamic} dynamic; ${natCounts(d).extended} extended)\nOutside interfaces:\n  ${Object.values(d.interfaces).filter((f) => f.nat === "outside").map((f) => f.name).join(", ")}\nInside interfaces:\n  ${Object.values(d.interfaces).filter((f) => f.nat === "inside").map((f) => f.name).join(", ")}\nHits: ${d.natStats?.hits ?? 0}  Misses: ${d.natStats?.misses ?? 0}\nDynamic mappings:\n${d.nat.dynamic.map((m) => `-- Inside Source\n[Id: 1] access-list ${m.acl} ${m.pool ? "pool " + m.pool : "interface " + m.out} refcount ${(d.nat.live ?? []).filter((t) => t.dynamic && t.pool === m.pool).length}`).join("\n")}`],
    ["show (access-lists | ip access-lists) [(<n:num:1-2699> | <name:word>)]", (d, a, c) => accessLists(d, a.n ?? a.name, c.has("ip"))],
    ["show port-security [interface <name:iface>]", (d, a) => portSecurity(d, a.name)],
    ["show port-security address", (d) => ["          Secure Mac Address Table", "-----------------------------------------------------------------------------", "Vlan    Mac Address       Type                          Ports   Remaining Age", ...sortedInterfaces(d).flatMap((f) => [...f.ps.macs.map((m) => [m, "SecureConfigured"]), ...(f.ps.learned ?? []).map((l) => [l.mac, l.sticky ? "SecureSticky" : "SecureDynamic"])].map(([m, type]) => `${pad(f.accessVlan, 8)}${pad(m, 18)}${pad(type, 30)}${pad(short(f.name), 8)}-`)), "-----------------------------------------------------------------------------", `Total Addresses in System (excluding one mac per port)     : ${Math.max(0, Object.values(d.interfaces).reduce((n, f) => n + Math.max(0, f.ps.macs.length + (f.ps.learned ?? []).length - 1), 0))}`, "Max Addresses limit in System (excluding one mac per port) : 1024"].join("\n")],
    ["show standby [brief]", (d, a, c) => standby(d, c.has("brief"), d.lab?.all)],
    // SLAAC addresses and ND routes follow what the neighbors advertise now
    ["show ipv6 interface brief", (d) => (syncIpv6(d.lab?.all), ipv6Brief(d))],
    ["show ipv6 neighbors [<name:iface>]", (d, a) => (syncIpv6(d.lab?.all), ipv6Neighbors(d, a.name))],
    ["show ipv6 interface [<name:iface>]", (d, a) => (syncIpv6(d.lab?.all), ipv6Brief({ ...d, interfaces: a.name ? { [a.name]: d.interfaces[a.name] } : d.interfaces }))],
    ["show ipv6 route", (d) => (syncIpv6(d.lab?.all), ipv6Route(d))],
    ["show hosts", (d) => hostsTable(d)],
    ["show controllers <name:iface>", (d, a) => controllers(d, a.name)],
    ["show clock [detail]", (d, a, c) => clockText(d, c.has("detail"))],
    ["show ntp status", (d) => ntpStatus(d)],
    ["show ntp associations", (d) => ntpAssociations(d)],
    ["show logging", (d) => logging(d)],
    // the last commands of this mode (exec or config), as many as the history size
    ["show history", (d) => {
      const t = d.term ?? { history: d.lines.con.history ?? 10, on: true };
      const list = (/^(user|priv)$/.test(d.mode) ? d.execHistory : d.configHistory) ?? [];
      return t.on && t.history ? list.slice(-t.history).map((h) => "  " + h).join("\n") : "";
    }],
    ["show terminal", (d) => {
      const t = d.term ?? { length: 24, width: 80, history: d.lines.con.history ?? 10, on: true };
      return [`Line 0, Location: "", Type: ""`, `Length: ${t.length} lines, Width: ${t.width} columns`, "Baud rate (TX/RX) is 9600/9600, no parity, 2 stopbits, 8 databits", "Status: PSI Enabled, Ready, Active, Automore On", "Capabilities: none", "Modem state: Ready", `Time since activation: 00:${String(12 + (d.history.length % 40)).padStart(2, "0")}:31`, `Editing is enabled.`, `History is ${t.on ? "enabled" : "disabled"}, history size is ${t.history}.`, "DNS resolution in show commands is enabled", "Full user help is disabled", "Allowed input transports are none.", "Allowed output transports are telnet ssh.", "Preferred transport is telnet.", "No output characters are padded", "No special data dispatching characters"].join("\n");
    }],
    ["show flash: ", (d) => flash(d)],
    ["show users", (d) => "    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00"],
    ["show ip ssh", (d) => sshInfo(d)],
    ["show aaa servers", (d) => aaaServers(d)],
    ["show tacacs", (d) => tacacsServers(d)],
    ["show ssh", (d) => (d.rsa ? "%No SSHv2 server connections running." : "SSH Disabled")],
    ["show crypto key mypubkey rsa", (d) => (d.rsa ? `% Key pair was generated at: 0:12:44 UTC Mar 1 1993\nKey name: ${d.hostname}.${d.domainName}\n Storage Device: not specified\n Usage: General Purpose Key\n Key is not exportable.\n Key Data:\n  ${d.rsa} bit key` : "")],
    ["show vtp status", (d) => vtpStatus(d)],
    ["show (arp | ip arp)", (d) => arp(d)],
    ["show ip dhcp snooping binding", (d) => snoopingBindings(d)],
    ["show ip source binding", (d) => snoopingBindings(d, true)],
    ["show ip dhcp snooping", (d) => snooping(d)],
    ["show ip arp inspection interfaces", (d) => daiInterfaces(d)],
    ["show ip arp inspection [vlan <v:vlist>]", (d, a) => dai(d, a.v)],
    ["show errdisable recovery", (d) => {
      const on = (r) => d.errdisable.causes.includes(r) || d.errdisable.causes.includes("all");
      const every = d.errdisable.interval ?? 300;
      // a port err-disabled for a cause with recovery on comes back at the next timeout
      const due = sortedInterfaces(d).filter((f) => f.errdisabled && !f.shutdown && on(f.errReason ?? "psecure-violation"));
      return ["ErrDisable Reason            Timer Status", "-----------------            --------------", ...["arp-inspection", "bpduguard", "dhcp-rate-limit", "link-flap", "psecure-violation", "udld"].map((r) => `${pad(r, 29)}${on(r) ? "Enabled" : "Disabled"}`), "", `Timer interval: ${every} seconds`, "", "Interfaces that will be enabled at the next timeout:", "", ...(due.length ? ["Interface       Errdisable reason       Time left(sec)", "---------       -----------------       --------------", ...due.map((f, i) => `${pad(short(f.name), 16)}${pad(f.errReason ?? "psecure-violation", 24)}${Math.max(1, every - 83 - 17 * i)}`)] : [])].join("\n");
    }],
    ["show debugging", (d) => (d.debugs.length ? d.debugs.map((x) => `  ${x} debugging is on`).join("\n") : "")],
    ["show snmp", (d) => snmpSummary(d)],
    ["show snmp community", (d) => Object.entries(d.snmp.communities).map(([n, c]) => `Community name: ${n}\nCommunity Index: ${n}\nCommunity SecurityName: ${n}\nstorage-type: nonvolatile        active   access: ${c.access === "rw" ? "read-write" : "read-only"}`).join("\n\n")],
    ["show line", () => "   Tty Typ     Tx/Rx    A Modem  Roty AccO AccI   Uses   Noise  Overruns   Int\n*    0 CTY              -    -      -    -    -      0       0     0/0       -"],
  ],
};
