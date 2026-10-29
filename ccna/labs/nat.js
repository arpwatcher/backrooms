import { lab, R, PC, SRV, ISP, cfg, EN, need } from "./kit.js";

const M = "nat";
const edge = (extra = []) => R("R1", 50, 25, cfg("interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 203.0.113.2 255.255.255.248", "no shutdown", "ip route 0.0.0.0 0.0.0.0 203.0.113.1", ...extra));
const topo = (extra) => [edge(extra), PC("PC1", 18, 52, "192.168.1.10/24", "192.168.1.1"), SRV("WEB", 50, 55, "192.168.1.100/24", "192.168.1.1"), ISP("Internet", 85, 25)];
const links = [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "Internet", "g0/0"]];
const sides = (t) => t.f("R1", "g0/0").nat === "inside" && t.f("R1", "g0/1").nat === "outside";
const sidesMsg = "G0/0 needs ip nat inside and G0/1 needs ip nat outside.";

export default [
  lab({
    id: "nat-inside-outside", module: M, title: "ip nat inside / outside",
    cmds: ["ip nat inside", "ip nat outside"],
    devices: topo(), links,
    intro: "Before any NAT works, the router must know which interfaces are inside and which are outside.",
    tasks: [
      { text: "Mark G0/0 (LAN) as inside.", check: (t) => need(t.f("R1", "g0/0").nat === "inside", "Expected ip nat inside on G0/0.") },
      { text: "Mark G0/1 (Internet) as outside.", check: (t) => need(t.f("R1", "g0/1").nat === "outside", "Expected ip nat outside on G0/1.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"] },
    teach: "Inside local is the host's private address. Inside global is the public address that represents it. Outside local and outside global describe the remote host (usually the same).",
  }),
  lab({
    id: "static-nat", module: M, title: "Static NAT for a server",
    cmds: ["ip nat inside source static"],
    devices: topo(["interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"]), links: [...links, ["R1", "g0/2", "WEB", "fa0"]],
    intro: "The web server 192.168.1.100 must be reachable from the Internet as 203.0.113.5.",
    tasks: [{ text: "Permanently map 192.168.1.100 to 203.0.113.5.", check: (t) => need(t.dev("R1").nat.statics.some((s) => s.local === "192.168.1.100" && s.global === "203.0.113.5" && !s.proto), "Expected ip nat inside source static 192.168.1.100 203.0.113.5.") }],
    solution: { R1: [...EN, "ip nat inside source static 192.168.1.100 203.0.113.5", "end", "show ip nat translations"] },
    teach: "Static NAT is a permanent one-to-one mapping, and it also works for connections started from outside. It appears in show ip nat translations right away.",
  }),
  lab({
    id: "dynamic-nat", module: M, title: "Dynamic NAT with a pool",
    cmds: ["ip nat pool", "access-list", "ip nat inside source list pool"],
    devices: topo(["interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"]), links,
    intro: "The ISP assigned the public addresses 203.0.113.3 to 203.0.113.6. Users on 192.168.1.0/24 must use them dynamically.",
    tasks: [
      { text: "Create ACL 1 matching 192.168.1.0/24.", check: (t) => { const a = t.acl("R1", 1); return need(a?.entries.some((e) => e.action === "permit" && e.src.net === "192.168.1.0" && e.src.wild === "0.0.0.255"), "Expected access-list 1 permit 192.168.1.0 0.0.0.255."); } },
      { text: "Create pool PUBLIC with 203.0.113.3 - 203.0.113.6, mask /29.", check: (t) => { const p = t.dev("R1").nat.pools.PUBLIC; return need(p?.start === "203.0.113.3" && p.end === "203.0.113.6" && p.mask === "255.255.255.248", "Expected ip nat pool PUBLIC 203.0.113.3 203.0.113.6 netmask 255.255.255.248."); } },
      { text: "Bind ACL 1 to the pool (without overload).", check: (t) => need(t.dev("R1").nat.dynamic.some((d) => d.acl === "1" && d.pool === "PUBLIC" && !d.overload), "Expected ip nat inside source list 1 pool PUBLIC.") },
    ],
    solution: { R1: [...EN, "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat pool PUBLIC 203.0.113.3 203.0.113.6 netmask 255.255.255.248", "ip nat inside source list 1 pool PUBLIC"] },
    teach: "Without overload, each inside host holds one public address while it is active. With 4 addresses, a fifth user waits until one is released.",
  }),
  lab({
    id: "pat", module: M, title: "PAT (NAT overload) on the outside interface",
    cmds: ["ip nat inside source list interface overload"],
    devices: topo(), links,
    intro: "The whole LAN must reach the Internet using the single public address on G0/1.",
    tasks: [
      { text: "Configure the inside and outside interfaces.", check: (t) => need(sides(t), sidesMsg) },
      { text: "Create ACL 1 matching 192.168.1.0/24.", check: (t) => need(t.acl("R1", 1)?.entries.some((e) => e.action === "permit" && e.src.net === "192.168.1.0" && e.src.wild === "0.0.0.255"), "Expected access-list 1 permit 192.168.1.0 0.0.0.255.") },
      { text: "Configure PAT using the address of G0/1.", check: (t) => need(t.dev("R1").nat.dynamic.some((d) => d.acl === "1" && d.out === "GigabitEthernet0/1" && d.overload), "Expected ip nat inside source list 1 interface g0/1 overload.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "exit", "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat inside source list 1 interface g0/1 overload"] },
    teach: "PAT tells connections apart by port number, so thousands of hosts share one address. It is the NAT every home router does.",
  }),
  lab({
    id: "port-forward", module: M, title: "Static PAT (port forwarding)",
    cmds: ["ip nat inside source static tcp"],
    devices: topo(["interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"]), links,
    intro: "Only HTTP (TCP 80) on the public address 203.0.113.2 may reach the server 192.168.1.100.",
    tasks: [{ text: "Forward TCP 80 on 203.0.113.2 to 192.168.1.100 port 80.", check: (t) => need(t.dev("R1").nat.statics.some((s) => s.proto === "tcp" && s.local === "192.168.1.100" && s.lport === 80 && s.global === "203.0.113.2" && s.gport === 80), "Expected ip nat inside source static tcp 192.168.1.100 80 203.0.113.2 80.") }],
    solution: { R1: [...EN, "ip nat inside source static tcp 192.168.1.100 80 203.0.113.2 80"] },
    teach: "The order is: protocol, inside local IP and port, then inside global IP and port.",
  }),
  lab({
    id: "sim-nat", module: M, title: "Sim: PAT and static NAT together", kind: "sim",
    cmds: ["ip nat inside", "ip nat outside", "access-list", "ip nat inside source list", "ip nat inside source static", "show ip nat translations"],
    devices: [edge(), PC("PC1", 18, 52, "192.168.1.10/24", "192.168.1.1"), SRV("WEB", 50, 55, "192.168.1.100/24", "192.168.1.1"), ISP("Internet", 85, 25)],
    links: [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "Internet", "g0/0"]],
    intro: "Users go out with PAT on the address of G0/1. The WEB server is seen as 203.0.113.4.",
    tasks: [
      { text: "Inside: G0/0. Outside: G0/1.", check: (t) => need(sides(t), sidesMsg) },
      { text: "Static NAT: 192.168.1.100 as 203.0.113.4.", check: (t) => need(t.dev("R1").nat.statics.some((s) => s.local === "192.168.1.100" && s.global === "203.0.113.4"), "The server's static NAT entry is missing.") },
      { text: "Named standard ACL NAT-USERS permitting 192.168.1.0/24.", check: (t) => { const a = t.acl("R1", "NAT-USERS"); return need(a?.type === "standard" && a.entries.some((e) => e.action === "permit" && e.src.net === "192.168.1.0" && e.src.wild === "0.0.0.255"), "Expected ip access-list standard NAT-USERS with permit 192.168.1.0 0.0.0.255."); } },
      { text: "PAT for NAT-USERS on the address of G0/1.", check: (t) => need(t.dev("R1").nat.dynamic.some((d) => d.acl === "NAT-USERS" && d.out === "GigabitEthernet0/1" && d.overload), "Expected ip nat inside source list NAT-USERS interface g0/1 overload.") },
      { text: "Display the NAT translation table.", check: (t) => need(t.ran("R1", /^show ip nat translations/), "Run show ip nat translations.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "exit", "ip nat inside source static 192.168.1.100 203.0.113.4", "ip access-list standard NAT-USERS", "permit 192.168.1.0 0.0.0.255", "exit", "ip nat inside source list NAT-USERS interface g0/1 overload", "end", "show ip nat translations"] },
    teach: "A common exam scenario is \"PCs cannot reach the Internet\". Typical causes: inside and outside swapped, an ACL with the wrong wildcard, or a missing overload.",
  }),
  lab({
    id: "sim-nat-fix", module: M, title: "Sim: users cannot reach the Internet", kind: "sim",
    cmds: ["show ip nat translations", "show running-config | include nat", "ip nat inside", "access-list"],
    devices: topo(["interface g0/0", "ip nat outside", "interface g0/1", "ip nat inside", "exit", "access-list 1 permit 192.168.1.0 0.0.0.0", "ip nat inside source list 1 interface g0/1 overload"]), links,
    intro: "PAT was configured on R1, but no translations ever appear. There are two faults.",
    tasks: [
      { text: "Look at R1's NAT configuration.", check: (t) => need(t.ran("R1", /^show (running-config|ip nat (translations|statistics)|access-lists)/), "Start with show running-config | include nat, show ip nat statistics or show access-lists.") },
      { text: "Fix the interface roles.", check: (t) => need(sides(t), sidesMsg) },
      { text: "Make ACL 1 match the whole 192.168.1.0/24 LAN.", check: (t) => need(t.acl("R1", 1)?.entries.some((e) => e.action === "permit" && e.src.net === "192.168.1.0" && e.src.wild === "0.0.0.255"), "Wildcard 0.0.0.0 matches only the address 192.168.1.0. A /24 needs 0.0.0.255.") },
    ],
    solution: { R1: ["enable", "show running-config | include nat", "configure terminal", "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "exit", "no access-list 1", "access-list 1 permit 192.168.1.0 0.0.0.255"] },
    teach: "NAT troubleshooting checklist: inside and outside on the right interfaces, an ACL that matches the inside addresses (wildcard, not mask), the right ACL number in ip nat inside source, overload for PAT, and a route out.",
  }),
];
