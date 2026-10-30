import { lab, R, PC, ISP, cfg, EN, need } from "./kit.js";

const M = "routing";
// R1 - R2 - R3 in a line, LANs on the ends
const r1 = cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown");
const r2 = cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface g0/2", "ip address 10.0.23.1 255.255.255.252", "no shutdown");
const r3 = cfg("interface g0/0", "ip address 10.3.3.1 255.255.255.0", "no shutdown", "interface g0/2", "ip address 10.0.23.2 255.255.255.252", "no shutdown");
const line = () => [R("R1", 18, 28, r1), R("R2", 50, 28, r2), R("R3", 82, 28, r3), PC("PC1", 18, 52, "10.1.1.10/24", "10.1.1.1"), PC("PC3", 82, 52, "10.3.3.10/24", "10.3.3.1")];
const lineLinks = [["R1", "g0/1", "R2", "g0/1"], ["R2", "g0/2", "R3", "g0/2"], ["R1", "g0/0", "PC1", "fa0"], ["R3", "g0/0", "PC3", "fa0"]];
const has = (t, dev, net, mask, via, ad) => t.statics(dev).some((r) => r.net === net && r.mask === mask && (!via || r.via === via || r.out === via) && (ad === undefined || r.ad === ad));

export default [
  lab({
    id: "static-next-hop", module: M, title: "Static route with a next hop",
    cmds: ["ip route", "show ip route"],
    devices: line(), links: lineLinks,
    intro: "R1 does not know how to reach R3's LAN (10.3.3.0/24).",
    tasks: [
      { text: "On R1, add a static route to 10.3.3.0/24 through R2 (10.0.12.2).", check: (t) => need(has(t, "R1", "10.3.3.0", "255.255.255.0", "10.0.12.2"), "Expected ip route 10.3.3.0 255.255.255.0 10.0.12.2.") },
      { text: "Verify that the route is in the routing table (S).", check: (t) => need(t.route("R1", "10.3.3.0", 24, "S") && t.ran("R1", /^show ip route/), "Check show ip route: it must show S 10.3.3.0/24 [1/0] via 10.0.12.2.") },
    ],
    solution: { R1: [...EN, "ip route 10.3.3.0 255.255.255.0 10.0.12.2", "end", "show ip route"] },
    teach: "ip route <network> <mask> <next-hop IP | exit interface> [AD]. The next hop must be on a connected network. The table shows [AD/metric], [1/0] for a static route.",
  }),
  lab({
    id: "static-exit-if", module: M, title: "Static route with an exit interface",
    cmds: ["ip route <net> <mask> <interface>"],
    devices: [R("R1", 25, 28, cfg("interface s0/0/0", "ip address 172.16.0.1 255.255.255.252", "clock rate 64000", "no shutdown")), R("R2", 75, 28, cfg("interface s0/0/0", "ip address 172.16.0.2 255.255.255.252", "no shutdown", "interface g0/0", "ip address 192.168.2.1 255.255.255.0", "no shutdown"))],
    links: [["R1", "s0/0/0", "R2", "s0/0/0"]],
    intro: "On a point-to-point serial link it is enough to name the interface the traffic leaves through.",
    tasks: [{ text: "On R1, add a route to 192.168.2.0/24 with Serial0/0/0 as the exit interface.", check: (t) => need(t.statics("R1").some((r) => r.net === "192.168.2.0" && r.mask === "255.255.255.0" && r.out === "Serial0/0/0"), "Expected ip route 192.168.2.0 255.255.255.0 s0/0/0.") }],
    solution: { R1: [...EN, "ip route 192.168.2.0 255.255.255.0 s0/0/0"] },
    teach: "With an exit interface the route shows as directly connected. On Ethernet (multi-access) add the next hop too, or the router ARPs for every destination.",
  }),
  lab({
    id: "default-route", module: M, title: "Default route to the ISP",
    cmds: ["ip route 0.0.0.0 0.0.0.0"],
    devices: [R("R1", 30, 30, cfg("interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 203.0.113.2 255.255.255.252", "no shutdown")), ISP("ISP", 75, 30)],
    links: [["R1", "g0/1", "ISP", "g0/0"]],
    intro: "Anything not local goes to the Internet through the ISP (203.0.113.1).",
    tasks: [
      { text: "Add a default route through 203.0.113.1.", check: (t) => need(has(t, "R1", "0.0.0.0", "0.0.0.0", "203.0.113.1"), "Expected ip route 0.0.0.0 0.0.0.0 203.0.113.1.") },
      { text: "Make sure R1 now has a gateway of last resort.", check: (t) => need(t.route("R1", "0.0.0.0", 0) && t.ran("R1", /^show ip route/), "Check show ip route: Gateway of last resort is 203.0.113.1 and S* 0.0.0.0/0.") },
    ],
    solution: { R1: [...EN, "ip route 0.0.0.0 0.0.0.0 203.0.113.1", "end", "show ip route"] },
    teach: "0.0.0.0/0 matches everything but is the least specific route, so it is used only when nothing better matches (longest prefix match).",
  }),
  lab({
    id: "floating-static", module: M, title: "Floating static route (backup)",
    cmds: ["ip route <net> <mask> <nh> <AD>"],
    devices: [R("R1", 30, 30, cfg("interface g0/1", "ip address 203.0.113.2 255.255.255.252", "no shutdown", "interface g0/2", "ip address 198.51.100.2 255.255.255.252", "no shutdown", "ip route 0.0.0.0 0.0.0.0 203.0.113.1")), ISP("ISP1", 75, 15), ISP("ISP2", 75, 45)],
    links: [["R1", "g0/1", "ISP1", "g0/0"], ["R1", "g0/2", "ISP2", "g0/0"]],
    intro: "R1 reaches the Internet through ISP1. If that fails, ISP2 (198.51.100.1) must be used.",
    tasks: [{ text: "Add a backup default route through 198.51.100.1 that enters the table only if the primary is lost (AD 5).", check: (t) => need(has(t, "R1", "0.0.0.0", "0.0.0.0", "198.51.100.1", 5) && has(t, "R1", "0.0.0.0", "0.0.0.0", "203.0.113.1", 1), "Expected ip route 0.0.0.0 0.0.0.0 198.51.100.1 5, with the primary route kept.") }],
    solution: { R1: [...EN, "ip route 0.0.0.0 0.0.0.0 198.51.100.1 5", "do show ip route"] },
    teach: "A floating static route has the same destination as the primary with a higher AD, so it stays out of the table until the primary is lost. To back up OSPF (AD 110), use an AD above 110.",
  }),
  lab({
    id: "host-route", module: M, title: "Host route (/32)",
    cmds: ["ip route <ip> 255.255.255.255"],
    devices: line(), links: lineLinks,
    intro: "Only the server 10.3.3.100 must be reachable from R1, not the whole LAN.",
    tasks: [{ text: "On R1, add a route for host 10.3.3.100 only, through 10.0.12.2.", check: (t) => need(has(t, "R1", "10.3.3.100", "255.255.255.255", "10.0.12.2"), "Expected ip route 10.3.3.100 255.255.255.255 10.0.12.2.") }],
    solution: { R1: [...EN, "ip route 10.3.3.100 255.255.255.255 10.0.12.2"] },
    teach: "A /32 is the most specific match possible and beats any other route covering the same address.",
  }),
  lab({
    id: "summary-route", module: M, title: "Summary static route",
    cmds: ["ip route"],
    devices: [R("R1", 30, 30, cfg("interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown")), R("R2", 70, 30, cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface lo0", "ip address 172.16.0.1 255.255.255.0", "interface lo1", "ip address 172.16.1.1 255.255.255.0", "interface lo2", "ip address 172.16.2.1 255.255.255.0", "interface lo3", "ip address 172.16.3.1 255.255.255.0"))],
    links: [["R1", "g0/1", "R2", "g0/1"]],
    intro: "Networks 172.16.0.0/24 to 172.16.3.0/24 sit behind R2. R1 should have a single route for them.",
    tasks: [{ text: "On R1, add one summary route that covers exactly the four networks, through 10.0.12.2.", check: (t) => need(has(t, "R1", "172.16.0.0", "255.255.252.0", "10.0.12.2"), "172.16.0-3.0 fit in 172.16.0.0/22: ip route 172.16.0.0 255.255.252.0 10.0.12.2.") }],
    solution: { R1: [...EN, "ip route 172.16.0.0 255.255.252.0 10.0.12.2"] },
    teach: "To summarise, find the common bits: 0-3 in the third octet is 000000xx, so 16 + 6 bits = /22 = 255.255.252.0.",
  }),
  lab({
    id: "sim-static", module: M, title: "Sim: full routing with static routes", kind: "sim",
    cmds: ["ip route", "ping", "show ip route"],
    devices: line(), links: lineLinks,
    intro: "PC1 (10.1.1.10) and PC3 (10.3.3.10) must communicate. There is no routing protocol, so use static routes only.",
    tasks: [
      { text: "R1: a route to 10.3.3.0/24.", check: (t) => need(has(t, "R1", "10.3.3.0", "255.255.255.0", "10.0.12.2") || has(t, "R1", "0.0.0.0", "0.0.0.0", "10.0.12.2"), "R1 does not know 10.3.3.0/24 (nor a default route through R2).") },
      { text: "R3: a route to 10.1.1.0/24.", check: (t) => need(has(t, "R3", "10.1.1.0", "255.255.255.0", "10.0.23.1") || has(t, "R3", "0.0.0.0", "0.0.0.0", "10.0.23.1"), "R3 does not know 10.1.1.0/24.") },
      { text: "R2: routes to both LANs (10.1.1.0/24 and 10.3.3.0/24).", check: (t) => need(has(t, "R2", "10.1.1.0", "255.255.255.0", "10.0.12.1") && has(t, "R2", "10.3.3.0", "255.255.255.0", "10.0.23.2"), "R2 needs both routes. Return traffic needs a route back too.") },
      { text: "From R1, verify with a ping to 10.3.3.1 sourced from its LAN (ping 10.3.3.1 source g0/0).", check: (t) => need(t.ran("R1", /^ping 10\.3\.3\.1 source (GigabitEthernet0\/0|10\.1\.1\.1)/), "Run ping 10.3.3.1 source g0/0 on R1. A plain ping is sent from 10.0.12.1, which R3 has no route to.") },
    ],
    solution: {
      R1: [...EN, "ip route 10.3.3.0 255.255.255.0 10.0.12.2", "end"],
      R2: [...EN, "ip route 10.1.1.0 255.255.255.0 10.0.12.1", "ip route 10.3.3.0 255.255.255.0 10.0.23.2"],
      R3: [...EN, "ip route 10.1.1.0 255.255.255.0 10.0.23.1"],
      "R1#2": ["ping 10.3.3.1 source g0/0"],
    },
    teach: "The most common trap: traffic gets there but cannot come back. Every router on the path must know both ends. A router's own ping is sent from its exit interface, here 10.0.12.1, so it also needs the far router to know that link; ping with source g0/0 tests what PC1 would see.",
  }),
];
