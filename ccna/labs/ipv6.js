import { lab, R, PC, cfg, EN, need } from "./kit.js";
import { expandIpv6 } from "../engine/ip.js";

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
    cmds: ["ipv6 address autoconfig", "ipv6 enable"],
    devices: [R("R1", 30, 30, cfg("interface g0/1", "no shutdown")), PC("ISP", 75, 30)],
    links: [["R1", "g0/1", "ISP", "fa0"]],
    intro: "The ISP hands out an IPv6 prefix with Router Advertisements.",
    tasks: [{ text: "Make G0/1 build its own address with SLAAC.", check: (t) => need(t.f("R1", "g0/1").ipv6Auto, "Expected ipv6 address autoconfig.") }],
    solution: { R1: [...EN, "interface g0/1", "ipv6 address autoconfig"] },
    teach: "SLAAC: the host sends an RS, the router answers with an RA carrying the prefix, and the host builds its own interface ID (EUI-64 or random). ipv6 enable creates only a link-local address.",
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
    intro: "R2 is a stub router: every unknown network goes to R1.",
    tasks: [{ text: "Default route on R2 with exit interface G0/1 and the link-local next hop FE80::1.", check: (t) => { const r = r6(t, "R2", "::", 0); return need(r && r.out === "GigabitEthernet0/1" && r.via === expandIpv6("fe80::1"), r ? "The default route exists, but not with g0/1 and fe80::1." : "Expected ipv6 route ::/0 g0/1 fe80::1."); } }],
    solution: { R2: [...EN, "ipv6 route ::/0 g0/1 fe80::1"], R1: [...EN, "interface g0/1", "ipv6 address fe80::1 link-local"] },
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
  }),
];
