import { lab, R, S, PC, HOST, cfg, EN, need, is } from "./kit.js";
import { expandIpv6 } from "../engine/ip.js";
import { fromRouter6 } from "../engine/host.js";

const M = "ipv6";
const has6 = (t, d, i, addr, bits) => t.f(d, i).ipv6.some((a) => a.addr === expandIpv6(addr) && a.bits === bits);
const r6 = (t, d, pfx, bits) => t.dev(d).ipv6Routes.find((r) => r.addr === expandIpv6(pfx) && r.bits === bits);
const pair = (a = [], b = []) => [
  R("R1", 25, 28, cfg("interface g0/0", "no shutdown", "interface g0/1", "no shutdown", ...a)),
  R("R2", 75, 28, cfg("interface g0/0", "no shutdown", "interface g0/1", "no shutdown", ...b)),
  PC("PC1", 10, 58), PC("PC2", 90, 58),
];
const pairLinks = [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"], ["R2", "g0/0", "PC2", "fa0"]];
const addressed = [
  ["ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:1::1/64", "interface g0/1", "ipv6 address 2001:db8:12::1/64"],
  ["ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:2::1/64", "interface g0/1", "ipv6 address 2001:db8:12::2/64"],
];

export default [
  lab({
    id: "ipv6-address", module: M, title: "IPv6 global unicast address",
    cmds: ["ipv6 address", "show ipv6 interface brief"],
    devices: pair(), links: pairLinks,
    intro: "The network is moving to dual stack. Start with R1.",
    tasks: [
      { text: "R1 G0/0: 2001:db8:1::1/64.", check: (t) => need(has6(t, "R1", "g0/0", "2001:db8:1::1", 64), "Expected ipv6 address 2001:db8:1::1/64 on G0/0.") },
      { text: "R1 G0/1: 2001:db8:12::1/64.", check: (t) => need(has6(t, "R1", "g0/1", "2001:db8:12::1", 64), "Expected ipv6 address 2001:db8:12::1/64 on G0/1.") },
      { text: "Check the addresses with show ipv6 interface brief.", check: (t) => need(t.ran("R1", /^show ipv6 interface brief$/), "Run show ipv6 interface brief.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ipv6 address 2001:db8:1::1/64", "interface g0/1", "ipv6 address 2001:db8:12::1/64", "end", "show ipv6 interface brief"] },
    teach: "IPv6 prefixes are written with /, never as a mask. Once a global address is configured, the interface also creates a link-local address (FE80::/10) with EUI-64.",
  }),
  lab({
    id: "ipv6-unicast-routing", module: M, title: "ipv6 unicast-routing",
    cmds: ["ipv6 unicast-routing"],
    devices: pair(["interface g0/0", "ipv6 address 2001:db8:1::1/64"]), links: pairLinks,
    intro: "Hosts on the LAN get no address with SLAAC, and R1 does not forward IPv6 packets.",
    tasks: [{ text: "Enable IPv6 routing on R1.", check: (t) => need(t.dev("R1").ipv6Routing, "Expected ipv6 unicast-routing (global configuration).") }],
    solution: { R1: [...EN, "ipv6 unicast-routing"] },
    teach: "Without ipv6 unicast-routing the router does not forward IPv6 or send Router Advertisements, so SLAAC does not work either. IPv4 routing is on by default; IPv6 routing is not.",
  }),
  lab({
    id: "ipv6-eui64", module: M, title: "EUI-64",
    cmds: ["ipv6 address eui-64", "show ipv6 interface brief"],
    devices: pair(), links: pairLinks,
    intro: "The interface ID should be built automatically from the MAC address.",
    tasks: [
      { text: "R1 G0/0: prefix 2001:db8:1::/64 with EUI-64.", check: (t) => need(t.f("R1", "g0/0").ipv6.some((a) => a.eui && a.bits === 64 && a.addr.startsWith("2001:0db8:0001:0000:")), "Expected ipv6 address 2001:db8:1::/64 eui-64.") },
      { text: "Check which address was created.", check: (t) => need(t.ran("R1", /^show ipv6 interface/), "Run show ipv6 interface brief.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ipv6 address 2001:db8:1::/64 eui-64", "end", "show ipv6 interface brief"] },
    teach: "EUI-64 splits the 48-bit MAC in half, inserts FFFE in the middle and flips the 7th bit. For example, MAC 0050.7966.6800 gives the interface ID 0250:79FF:FE66:6800.",
  }),
  lab({
    id: "ipv6-link-local", module: M, title: "Manual link-local address",
    cmds: ["ipv6 address link-local"],
    devices: pair(), links: pairLinks,
    intro: "Set a simple link-local address so next hops are easy to read.",
    tasks: [{ text: "Set FE80::1 as the link-local address on G0/0 and G0/1 of R1.", check: (t) => need(["g0/0", "g0/1"].every((i) => t.f("R1", i).ipv6LinkLocal === expandIpv6("fe80::1")), "Expected ipv6 address fe80::1 link-local on both interfaces.") }],
    solution: { R1: [...EN, "interface g0/0", "ipv6 address fe80::1 link-local", "interface g0/1", "ipv6 address fe80::1 link-local"] },
    teach: "A link-local address only has to be unique on its own link, so FE80::1 can be on every interface. It is never routed.",
  }),
  lab({
    id: "ipv6-slaac-client", module: M, title: "Router as a SLAAC client",
    cmds: ["ipv6 address autoconfig", "ipv6 address autoconfig default", "show ipv6 interface brief", "show ipv6 route"],
    devices: [R("R1", 30, 30, cfg("ipv6 unicast-routing", "interface g0/1", "no shutdown")), R("ISP", 75, 30, cfg("ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:ffff::1/64", "no shutdown"))],
    links: [["R1", "g0/1", "ISP", "g0/0"]],
    intro: "The ISP hands out an IPv6 prefix with Router Advertisements. R1's G0/1 should take an address from it, and a default route too.",
    tasks: [
      { text: "Make G0/1 build its own address with SLAAC and install a default route from the advertisement.", check: (t) => need(t.f("R1", "g0/1").ipv6Auto && t.f("R1", "g0/1").ipv6AutoDefault, t.f("R1", "g0/1").ipv6Auto ? "Add default: ipv6 address autoconfig default." : "Expected ipv6 address autoconfig default on G0/1.") },
      { text: "Which global address did G0/1 build (show ipv6 interface brief)?", ask: "IPv6 address", check: (t) => need(expandIpv6(t.reply.trim().split("/")[0]) === expandIpv6(`2001:db8:ffff:0:${t.dev("R1").mac.replace(/\./g, "").replace(/^(..)/, (m) => (parseInt(m, 16) ^ 2).toString(16).padStart(2, "0")).replace(/^(.{6})/, "$1fffe").match(/.{4}/g).join(":")}`), "The ISP's prefix 2001:db8:ffff::/64 and the EUI-64 interface ID from R1's MAC (IOS uses EUI-64 for autoconfig).") },
      { text: "How does the default route show up in show ipv6 route?", choices: ["ND ::/0 via the ISP's link-local address", "S ::/0 via 2001:db8:ffff::1", "C ::/0", "It does not appear"], check: (t) => need(t.reply === "ND ::/0 via the ISP's link-local address", "Code ND (ND Default), AD 2, next hop the link-local address the RA came from.") },
      { text: "Ping the ISP at 2001:db8:ffff::1.", check: (t) => need(t.ran("R1", /^ping 2001:db8:ffff::1$/i) && fromRouter6(t.dev("R1"), expandIpv6("2001:db8:ffff::1"))?.ok, "ping 2001:db8:ffff::1 from R1.") },
    ],
    solution: { R1: [...EN, "interface g0/1", "ipv6 address autoconfig default", "end", "show ipv6 interface brief", "show ipv6 route", "ping 2001:db8:ffff::1"] },
    answers: { 1: "2001:db8:ffff:0:201:42ff:fea3:2466", 2: "ND ::/0 via the ISP's link-local address" },
    teach: "SLAAC: the host sends an RS, the router answers with an RA carrying the prefix, and the host builds its own interface ID (EUI-64 on IOS, random on Windows and macOS). ipv6 address autoconfig on a router interface does the same; with default it also installs the RA's router as a default route (ND, AD 2). ipv6 enable creates only a link-local address.",
  }),
  lab({
    id: "ipv6-static", module: M, title: "IPv6 static route",
    cmds: ["ipv6 route", "show ipv6 route"],
    devices: pair(addressed[0], addressed[1]), links: pairLinks,
    intro: "R1 must reach R2's LAN (2001:db8:2::/64).",
    tasks: [
      { text: "Static route to 2001:db8:2::/64 through 2001:db8:12::2.", check: (t) => { const r = r6(t, "R1", "2001:db8:2::", 64); return need(r && r.via === expandIpv6("2001:db8:12::2"), "Expected ipv6 route 2001:db8:2::/64 2001:db8:12::2."); } },
      { text: "Display the IPv6 routing table.", check: (t) => need(t.ran("R1", /^show ipv6 route/), "Run show ipv6 route.") },
    ],
    solution: { R1: [...EN, "ipv6 route 2001:db8:2::/64 2001:db8:12::2", "end", "show ipv6 route"] },
    teach: "If the next hop is a link-local address (FE80::...), the exit interface is required too: ipv6 route 2001:db8:2::/64 g0/1 fe80::2.",
  }),
  lab({
    id: "ipv6-default", module: M, title: "IPv6 default route",
    cmds: ["ipv6 route ::/0"],
    devices: pair(addressed[0], addressed[1]), links: pairLinks,
    intro: "R2 is a stub router: every unknown network goes to R1, whose G0/1 should answer at the easy-to-read link-local FE80::1.",
    tasks: [
      { text: "Default route on R2 with exit interface G0/1 and the link-local next hop FE80::1.", check: (t) => { const r = r6(t, "R2", "::", 0); return need(r && r.out === "GigabitEthernet0/1" && r.via === expandIpv6("fe80::1"), r ? "The default route exists, but not with g0/1 and fe80::1." : "Expected ipv6 route ::/0 g0/1 fe80::1."); } },
      { text: "What does IOS answer to ipv6 route ::/0 fe80::1, with no interface?", choices: ["% Interface has to be specified for a link-local nexthop", "Nothing: the route is added", "% Invalid input detected", "% Bad mask"], check: (t) => need(t.reply === "% Interface has to be specified for a link-local nexthop", "Try it: a link-local address exists on every link, so IOS needs the interface to know which one.") },
      { text: "From R2, ping R1's LAN address 2001:db8:1::1.", check: (t) => need(t.ran("R2", /^ping 2001:db8:1::1$/i) && fromRouter6(t.dev("R2"), expandIpv6("2001:db8:1::1"))?.ok, "R1 needs fe80::1 on G0/1 (the next hop R2 points at); R1 answers from its connected route back.") },
    ],
    solution: { R1: [...EN, "interface g0/1", "ipv6 address fe80::1 link-local"], R2: [...EN, "ipv6 route ::/0 fe80::1", "ipv6 route ::/0 g0/1 fe80::1", "end", "ping 2001:db8:1::1"] },
    answers: { 1: "% Interface has to be specified for a link-local nexthop" },
    teach: "::/0 is the IPv6 default route, the equivalent of 0.0.0.0/0.",
  }),
  lab({
    id: "sim-ipv6", module: M, title: "Sim: IPv6 end to end", kind: "sim",
    cmds: ["ipv6 unicast-routing", "ipv6 address", "ipv6 route"],
    devices: pair(), links: pairLinks,
    intro: "Set up IPv6 between the two LANs with static routes.",
    tasks: [
      { text: "IPv6 routing on both routers.", check: (t) => need(t.dev("R1").ipv6Routing && t.dev("R2").ipv6Routing, "ipv6 unicast-routing is missing somewhere.") },
      { text: "R1: G0/0 2001:db8:1::1/64, G0/1 2001:db8:12::1/64.", check: (t) => need(has6(t, "R1", "g0/0", "2001:db8:1::1", 64) && has6(t, "R1", "g0/1", "2001:db8:12::1", 64), "R1's addresses are not correct.") },
      { text: "R2: G0/0 2001:db8:2::1/64, G0/1 2001:db8:12::2/64.", check: (t) => need(has6(t, "R2", "g0/0", "2001:db8:2::1", 64) && has6(t, "R2", "g0/1", "2001:db8:12::2", 64), "R2's addresses are not correct.") },
      { text: "R1: a route to 2001:db8:2::/64. R2: a default route to R1 (2001:db8:12::1).", check: (t) => need(r6(t, "R1", "2001:db8:2::", 64)?.via === expandIpv6("2001:db8:12::2") && r6(t, "R2", "::", 0)?.via === expandIpv6("2001:db8:12::1"), "An ipv6 route is missing or wrong.") },
    ],
    solution: {
      R1: [...EN, "ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:1::1/64", "interface g0/1", "ipv6 address 2001:db8:12::1/64", "exit", "ipv6 route 2001:db8:2::/64 2001:db8:12::2"],
      R2: [...EN, "ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:2::1/64", "interface g0/1", "ipv6 address 2001:db8:12::2/64", "exit", "ipv6 route ::/0 2001:db8:12::1"],
    },
    teach: "Address types: global unicast 2000::/3, unique local FC00::/7, link-local FE80::/10, multicast FF00::/8 (FF02::1 all nodes, FF02::2 all routers).",
  }),  lab({
    id: "ipv6-neighbors", module: M, title: "show ipv6 neighbors",
    cmds: ["show ipv6 neighbors"],
    devices: pair(...addressed), links: pairLinks,
    intro: "IPv6 has no ARP: neighbor discovery (NDP) fills the neighbor cache. Read it on R1.",
    tasks: [
      { text: "Which link-local address does R1 list for R2?", ask: "IPv6 address", check: (t) => need(t.ran("R1", /^sh(ow?)? ipv6 nei/) && expandIpv6(t.reply.trim()) === expandIpv6("fe80::201:42ff:fea3:2467"), "show ipv6 neighbors on R1: the FE80:: entry on Gi0/1.") },
      { text: "Which ICMPv6 messages fill this table?", choices: ["Neighbor Solicitation and Neighbor Advertisement", "Router Solicitation and Router Advertisement", "Echo Request and Echo Reply", "ARP request and reply"], check: (t) => need(t.reply === "Neighbor Solicitation and Neighbor Advertisement", "NS/NA (ICMPv6 types 135 and 136) replace ARP; RS/RA (133/134) are for SLAAC.") },
      { text: "Which MAC address does R1 list for 2001:DB8:12::2?", ask: "MAC", check: (t) => need(is.mac(t.reply, "0001.42a3.2467"), "The Link-layer Addr column.") },
    ],
    solution: { R1: ["enable", "show ipv6 neighbors"] },
    answers: { 0: "FE80::201:42FF:FEA3:2467", 1: "Neighbor Solicitation and Neighbor Advertisement", 2: "0001.42a3.2467" },
    teach: "show ipv6 neighbors is the IPv6 counterpart of show ip arp: each neighbor's global and link-local addresses with the MAC learned by Neighbor Solicitation/Advertisement (sent to the solicited-node multicast address FF02::1:FFxx:xxxx). States: REACH (confirmed recently), STALE, DELAY, PROBE, INCMP.",
  }),
  lab({
    id: "ipv6-hosts", module: M, title: "PCs on IPv6: SLAAC and ping -6",
    cmds: ["ipv6 unicast-routing", "ipv6 address link-local", "ipconfig", "ip -6 addr", "ip -6 route", "ping -6", "ping6"],
    devices: [
      R("R1", 50, 14, cfg("interface g0/0", "ipv6 address 2001:db8:acad:10::1/64", "no shutdown", "interface g0/1", "ipv6 address 2001:db8:acad:20::1/64", "no shutdown")),
      S("SW1", 26, 38),
      HOST("PC1", 12, 64, "windows", { ipv6: "auto", mac: "0050.7966.0611" }),
      HOST("PC2", 40, 64, "linux", { ipv6: "auto", mac: "0050.7966.0612" }),
      HOST("PC3", 78, 46, "mac", { ipv6: "2001:db8:acad:20::30/64", gateway6: "fe80::1", mac: "0050.7966.0613" }),
    ],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["SW1", "fa0/1", "PC1", "fa0"], ["SW1", "fa0/2", "PC2", "fa0"], ["R1", "g0/1", "PC3", "fa0"]],
    intro: "An IPv6-only office. PC1 and PC2 should configure themselves with SLAAC from R1; PC3 has a static address with fe80::1 as its gateway. Right now neither PC on the LAN has a global address.",
    tasks: [
      { text: "Why does PC2 (ip -6 addr) show only its fe80:: address?", choices: ["R1 does not route IPv6, so it sends no Router Advertisements", "PC2 needs DHCPv6", "The switch blocks IPv6", "Link-local addresses replace global ones"], check: (t) => need(t.reply === "R1 does not route IPv6, so it sends no Router Advertisements", "A router sends RAs (the prefix for SLAAC) only with ipv6 unicast-routing on.") },
      { text: "Make R1 route IPv6, and give both its interfaces the link-local address fe80::1.", check: (t) => need(t.dev("R1").ipv6Routing && ["g0/0", "g0/1"].every((i) => t.f("R1", i).ipv6LinkLocal === expandIpv6("fe80::1")), "ipv6 unicast-routing, then ipv6 address fe80::1 link-local on G0/0 and on G0/1.") },
      { text: "Which global address did PC2 (Linux, EUI-64) build?", ask: "IPv6 address", check: (t) => need(expandIpv6(t.reply.trim().split("/")[0]) === expandIpv6("2001:db8:acad:10:250:79ff:fe66:612"), "ip -6 addr on PC2: the prefix 2001:db8:acad:10::/64 and the EUI-64 ID from MAC 0050.7966.0612 (flip the 7th bit: 02, insert ff:fe): 250:79ff:fe66:612.") },
      { text: "What does PC1's ipconfig show as its IPv6 default gateway?", choices: ["fe80::1%12", "2001:db8:acad:10::1", "::", "There is none"], check: (t) => need(t.reply === "fe80::1%12", "Hosts use the router's link-local address (from the RA) as the IPv6 gateway; %12 is the interface index.") },
      { text: "Is PC1's interface ID built from its MAC like PC2's?", choices: ["No: Windows picks a random interface ID", "Yes: every OS uses EUI-64", "No: Windows uses DHCPv6", "Yes, but with ff:fe at the end"], check: (t) => need(t.reply === "No: Windows picks a random interface ID", "Compare ipconfig with the MAC 0050.7966.0611: Windows (and macOS) use a random ID for privacy; Linux here uses EUI-64.") },
      { text: "From PC1, ping PC3 (2001:db8:acad:20::30) over IPv6.", check: (t) => need(t.ran("PC1", /^ping .*-6|^ping .*2001:/) && t.reach6("PC1", "2001:db8:acad:20::30"), "ping -6 2001:db8:acad:20::30 on PC1. PC3 answers through fe80::1 on G0/1.") },
      { text: "From PC2, ping6 PC1.", check: (t) => need(t.ran("PC2", /^ping6? /) && t.reach6("PC2", t.dev("PC1").interfaces.FastEthernet0.ipv6[0]?.addr ?? "::"), "ping6 to the address ipconfig shows on PC1 (on-link, no router needed).") },
    ],
    solution: {
      PC2: ["ip -6 addr"],
      R1: [...EN, "ipv6 unicast-routing", "interface g0/0", "ipv6 address fe80::1 link-local", "interface g0/1", "ipv6 address fe80::1 link-local", "end"],
      "PC2#2": ["ip -6 addr", "ip -6 route"],
      PC1: ["ipconfig", "ping -6 2001:db8:acad:20::30"],
      "PC2#3": ["ping6 -c 2 2001:db8:acad:10:e997:8d95:84b7:6103"],
    },
    answers: { 0: "R1 does not route IPv6, so it sends no Router Advertisements", 2: "2001:db8:acad:10:250:79ff:fe66:612", 3: "fe80::1%12", 4: "No: Windows picks a random interface ID" },
    teach: "SLAAC: a host sends a Router Solicitation, the router (only with ipv6 unicast-routing) answers with a Router Advertisement carrying the /64 prefix, and the host adds its own interface ID: EUI-64 from the MAC (Linux here), or a random one (Windows, macOS). The default gateway is the router's link-local address, so a short manual one like fe80::1 is easy to read. Test with ping -6 (Windows, Linux) or ping6 (Linux, macOS).",
  }),
];
