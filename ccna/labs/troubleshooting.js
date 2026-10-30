import { lab, R, PC, cfg, EN, need } from "./kit.js";

const M = "troubleshooting";
const r1 = cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "ip route 10.3.3.0 255.255.255.0 10.0.12.2");
const r2 = (extra = []) => cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface g0/2", "ip address 10.0.23.1 255.255.255.252", "no shutdown", "ip route 10.3.3.0 255.255.255.0 10.0.23.2", ...extra);
// R3 also knows the R1-R2 link, so a plain ping from R1 (sourced from
// 10.0.12.1) gets its answer back
const r3 = (extra = []) => cfg("interface g0/0", "ip address 10.3.3.1 255.255.255.0", "no shutdown", "interface g0/2", "ip address 10.0.23.2 255.255.255.252", "no shutdown", "ip route 10.1.1.0 255.255.255.0 10.0.23.1", "ip route 10.0.12.0 255.255.255.252 10.0.23.1", ...extra);
const line = (b = [], c = []) => [R("R1", 18, 28, r1), R("R2", 50, 28, r2(b)), R("R3", 82, 28, r3(c)), PC("PC1", 18, 52, "10.1.1.10/24", "10.1.1.1"), PC("PC3", 82, 52, "10.3.3.10/24", "10.3.3.1")];
const links = [["R1", "g0/1", "R2", "g0/1"], ["R2", "g0/2", "R3", "g0/2"], ["R1", "g0/0", "PC1", "fa0"], ["R3", "g0/0", "PC3", "fa0"]];
const routeBack = (t) => t.statics("R2").some((r) => r.net === "10.1.1.0" && r.mask === "255.255.255.0" && r.via === "10.0.12.1");

export default [
  lab({
    id: "ping", module: M, title: "ping",
    cmds: ["ping"],
    devices: line(["ip route 10.1.1.0 255.255.255.0 10.0.12.1"]), links,
    intro: "Check end-to-end reachability from R1.",
    tasks: [
      { text: "From R1, ping R3's LAN interface 10.3.3.1.", check: (t) => need(t.ran("R1", /^ping 10\.3\.3\.1$/), "Run ping 10.3.3.1 on R1.") },
      { text: "Ping it again with 100 packets.", check: (t) => need(t.ran("R1", /^ping 10\.3\.3\.1 repeat 100$/), "Run ping 10.3.3.1 repeat 100.") },
    ],
    solution: { R1: ["enable", "ping 10.3.3.1", "ping 10.3.3.1 repeat 100"] },
    teach: "In IOS ping output, ! is a reply, . is a timeout and U is destination unreachable. The first ping often shows .!!!! because the first packet waits for ARP.",
  }),
  lab({
    id: "extended-ping", module: M, title: "Extended ping with a source",
    cmds: ["ping source"],
    devices: line(), links,
    intro: "R1 can reach 10.3.3.1, but PC1's LAN cannot. A ping from R1's G0/1 address hides the problem.",
    tasks: [
      { text: "From R1, ping 10.3.3.1 using G0/0 (10.1.1.1) as the source.", check: (t) => need(t.ran("R1", /^ping 10\.3\.3\.1 source (GigabitEthernet0\/0|10\.1\.1\.1)$/), "Run ping 10.3.3.1 source g0/0 (or source 10.1.1.1).") },
      { text: "The reply has no way back to 10.1.1.0/24. Give R2 the missing route.", check: (t) => need(routeBack(t), "R2 needs ip route 10.1.1.0 255.255.255.0 10.0.12.1.") },
    ],
    solution: { R1: ["enable", "ping 10.3.3.1 source g0/0"], R2: [...EN, "ip route 10.1.1.0 255.255.255.0 10.0.12.1"] },
    teach: "A ping uses the address of the exit interface as its source. With source you test the path from a LAN, as a host there would. Typing ping alone starts the interactive extended ping.",
  }),
  lab({
    id: "traceroute", module: M, title: "traceroute",
    cmds: ["traceroute"],
    devices: line(["ip route 10.1.1.0 255.255.255.0 10.0.12.1"]), links,
    intro: "Find the path from R1 to PC3.",
    tasks: [{ text: "Trace the route from R1 to 10.3.3.10.", check: (t) => need(t.ran("R1", /^traceroute 10\.3\.3\.10$/), "Run traceroute 10.3.3.10 on R1 (tracert is the Windows command).") }],
    solution: { R1: ["enable", "traceroute 10.3.3.10"] },
    teach: "traceroute sends packets with TTL 1, 2, 3... and each router that drops one answers with ICMP Time Exceeded, which reveals the hops. * * * means that hop did not answer.",
  }),
  lab({
    id: "debug-icmp", module: M, title: "debug ip icmp and undebug all",
    cmds: ["debug ip icmp", "show debugging", "undebug all"],
    devices: line(["ip route 10.1.1.0 255.255.255.0 10.0.12.1"]), links,
    intro: "Watch the ICMP messages R3 sends and receives, then switch debugging off.",
    tasks: [
      { text: "On R3, turn on ICMP debugging.", check: (t) => need(t.ran("R3", /^debug ip icmp$/), "Run debug ip icmp on R3.") },
      { text: "Check which debugs are on.", check: (t) => need(t.ran("R3", /^show debugging$/), "Run show debugging.") },
      { text: "Turn every debug off.", check: (t) => need(t.ran("R3", /^(undebug all|no debug all)$/) && !t.dev("R3").debugs.length, "Run undebug all (u all).") },
    ],
    solution: { R3: ["enable", "debug ip icmp", "show debugging", "undebug all"] },
    teach: "debug output can overload a busy router, so turn it off as soon as you are done. Debug output appears on the console; over Telnet/SSH you also need terminal monitor.",
  }),
  lab({
    id: "sim-connectivity", module: M, title: "Sim: PC1 cannot reach PC3", kind: "sim",
    cmds: ["ping", "traceroute", "show ip interface brief", "show ip route"],
    devices: [R("R1", 18, 28, r1), R("R2", 50, 28, r2()), R("R3", 82, 28, r3(["interface g0/2", "shutdown"])), PC("PC1", 18, 52, "10.1.1.10/24", "10.1.1.1"), PC("PC3", 82, 52, "10.3.3.10/24", "10.3.3.1")],
    links,
    intro: "Users on PC1 report that PC3 is unreachable. Find both faults and fix them.",
    tasks: [
      { text: "Test from R1 with a ping sourced from its LAN.", check: (t) => need(t.ran("R1", /^ping 10\.3\.3\.(1|10) source/), "Start with ping 10.3.3.10 source g0/0 on R1.") },
      { text: "Find and fix the interface fault on the path.", check: (t) => need(t.up("R3", "g0/2"), "One link on the path is down. Check show ip interface brief on each router.") },
      { text: "Find and fix the routing fault on the path.", check: (t) => need(routeBack(t), "Return traffic to 10.1.1.0/24 has no route on one router. Check show ip route on R2.") },
    ],
    solution: { R1: ["enable", "ping 10.3.3.10 source g0/0"], R3: [...EN, "interface g0/2", "no shutdown"], R2: [...EN, "ip route 10.1.1.0 255.255.255.0 10.0.12.1"] },
    teach: "Work layer by layer: interface status (show ip interface brief), then addressing, then routing in both directions (show ip route on every hop).",
  }),
];
