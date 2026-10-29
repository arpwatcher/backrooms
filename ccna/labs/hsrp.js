import { lab, R, S, PC, cfg, EN, need, is } from "./kit.js";

const M = "hsrp";
const base = (a = [], b = []) => [R("R1", 25, 15, cfg("interface g0/0", "ip address 10.10.10.2 255.255.255.0", "no shutdown", ...a)), R("R2", 75, 15, cfg("interface g0/0", "ip address 10.10.10.3 255.255.255.0", "no shutdown", ...b)), S("SW1", 50, 38), PC("PC1", 50, 56, "10.10.10.50/24", "10.10.10.1")];
const links = [["R1", "g0/0", "SW1", "g0/1"], ["R2", "g0/0", "SW1", "g0/2"], ["SW1", "fa0/1", "PC1", "fa0"]];
const grp = (t, r, g = 1) => t.f(r, "g0/0").hsrp.groups[g];

export default [
  lab({
    id: "hsrp-basic", module: M, title: "HSRP: virtual gateway",
    cmds: ["standby ip", "show standby brief"],
    devices: base(), links,
    intro: "Hosts use 10.10.10.1 as their gateway. If one router fails, the other must take over that address.",
    tasks: [
      { text: "R1: HSRP group 1 with virtual IP 10.10.10.1.", check: (t) => need(grp(t, "R1")?.ip === "10.10.10.1", "Expected standby 1 ip 10.10.10.1 on G0/0 of R1.") },
      { text: "R2: the same group and virtual IP.", check: (t) => need(grp(t, "R2")?.ip === "10.10.10.1", "Expected standby 1 ip 10.10.10.1 on G0/0 of R2.") },
      { text: "Check which router is Active and which is Standby.", check: (t) => need(t.ran("R1", /^show standby( brief)?$/) || t.ran("R2", /^show standby( brief)?$/), "Run show standby brief.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "standby 1 ip 10.10.10.1", "end", "show standby brief"], R2: [...EN, "interface g0/0", "standby 1 ip 10.10.10.1"] },
    teach: "The virtual IP is the hosts' gateway, paired with a virtual MAC (0000.0c07.acXX, where XX is the group in hex). The highest priority (default 100) becomes Active; on a tie, the highest interface IP wins.",
  }),
  lab({
    id: "hsrp-priority", module: M, title: "HSRP priority and preempt",
    cmds: ["standby priority", "standby preempt"],
    devices: base(["standby 1 ip 10.10.10.1"], ["standby 1 ip 10.10.10.1"]), links,
    intro: "R2 is Active now because it has the higher IP. R1 should be Active, and take the role back whenever it recovers.",
    tasks: [
      { text: "Set R1's priority for group 1 to 110.", check: (t) => need(grp(t, "R1")?.priority === 110, "Expected standby 1 priority 110.") },
      { text: "Enable preemption on R1.", check: (t) => need(grp(t, "R1")?.preempt, "Without standby 1 preempt, R1 does not take the role back from the current Active router.") },
      { text: "R1 must now be the Active router.", check: (t) => need(t.hsrpActive("R1", "10.10.10.1"), "R1 is not Active.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "standby 1 priority 110", "standby 1 preempt"] },
    teach: "HSRP does not preempt by default: a router with a higher priority that comes up later does not take over unless preempt is configured.",
  }),
  lab({
    id: "hsrp-v2", module: M, title: "HSRP version 2",
    cmds: ["standby version 2"],
    devices: base(["standby 1 ip 10.10.10.1"], ["standby 1 ip 10.10.10.1"]), links,
    intro: "The company wants HSRPv2, for group numbers above 255 and IPv6 support.",
    tasks: [{ text: "Change HSRP to version 2 on both routers.", check: (t) => need(t.f("R1", "g0/0").hsrp.version === 2 && t.f("R2", "g0/0").hsrp.version === 2, "Expected standby version 2 on G0/0 of both routers.") }],
    solution: { R1: [...EN, "interface g0/0", "standby version 2"], R2: [...EN, "interface g0/0", "standby version 2"] },
    teach: "HSRPv1 and v2 do not interoperate. v2 uses groups 0-4095, multicast 224.0.0.102 and virtual MAC 0000.0c9f.fXXX.",
  }),
  lab({
    id: "sim-hsrp", module: M, title: "Sim: HSRP for two VLANs with load sharing", kind: "sim",
    cmds: ["standby ip", "standby priority", "standby preempt"],
    devices: [R("R1", 25, 15, cfg("interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 10.10.10.2 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 10.10.20.2 255.255.255.0")), R("R2", 75, 15, cfg("interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 10.10.10.3 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 10.10.20.3 255.255.255.0")), S("SW1", 50, 40, cfg("vlan 10", "vlan 20", "interface range g0/1 - 2", "switchport mode trunk"))],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["R2", "g0/0", "SW1", "g0/2"]],
    intro: "R1 must be Active for VLAN 10 and R2 for VLAN 20, so the load is shared.",
    tasks: [
      { text: "VLAN 10: group 10 with virtual IP 10.10.10.1 on both routers.", check: (t) => need(t.f("R1", "g0/0.10").hsrp.groups[10]?.ip === "10.10.10.1" && t.f("R2", "g0/0.10").hsrp.groups[10]?.ip === "10.10.10.1", "standby 10 ip 10.10.10.1 is missing somewhere.") },
      { text: "VLAN 20: group 20 with virtual IP 10.10.20.1 on both routers.", check: (t) => need(t.f("R1", "g0/0.20").hsrp.groups[20]?.ip === "10.10.20.1" && t.f("R2", "g0/0.20").hsrp.groups[20]?.ip === "10.10.20.1", "standby 20 ip 10.10.20.1 is missing somewhere.") },
      { text: "R1 is Active for VLAN 10 (priority 110, preempt).", check: (t) => need(t.hsrpActive("R1", "10.10.10.1") && t.f("R1", "g0/0.10").hsrp.groups[10]?.preempt, "R1 is not Active with preempt for VLAN 10.") },
      { text: "R2 is Active for VLAN 20 (priority 110, preempt).", check: (t) => need(t.hsrpActive("R2", "10.10.20.1") && t.f("R2", "g0/0.20").hsrp.groups[20]?.preempt, "R2 is not Active with preempt for VLAN 20.") },
    ],
    solution: {
      R1: [...EN, "interface g0/0.10", "standby 10 ip 10.10.10.1", "standby 10 priority 110", "standby 10 preempt", "interface g0/0.20", "standby 20 ip 10.10.20.1"],
      R2: [...EN, "interface g0/0.10", "standby 10 ip 10.10.10.1", "interface g0/0.20", "standby 20 ip 10.10.20.1", "standby 20 priority 110", "standby 20 preempt"],
    },
    teach: "HSRP does not load balance within a group. Share the load with a separate group per VLAN, each with a different Active router. GLBP does real load balancing.",
  }),
  lab({
    id: "hsrp-read", module: M, title: "Reading show standby brief",
    cmds: ["show standby brief"],
    devices: base(["standby 1 ip 10.10.10.1", "standby 1 priority 120", "standby 1 preempt"], ["standby 1 ip 10.10.10.1"]), links,
    intro: "Answer from the output on R2.",
    tasks: [
      { text: "On R2, display the HSRP summary.", check: (t) => need(t.ran("R2", /^show standby( brief)?$/), "Run show standby brief.") },
      { text: "What is R2's HSRP state?", choices: ["Active", "Standby", "Listen", "Init"], check: (t) => need(t.reply === "Standby", "R1 has priority 120, R2 the default 100.") },
      { text: "What is the virtual IP that hosts use as their gateway?", ask: "a.b.c.d", check: (t) => need(is.ip(t.reply, "10.10.10.1"), "Read the Virtual IP column.") },
    ],
    solution: { R2: ["enable", "show standby brief"] },
    answers: { 1: "Standby", 2: "10.10.10.1" },
    teach: "In show standby brief, P next to the priority means preempt is on, and the Active and Standby columns show which router holds each role (local means this router).",
  }),
  lab({
    id: "sim-hsrp-fix", module: M, title: "Sim: both routers think they are Active", kind: "sim",
    cmds: ["show standby brief", "no standby", "standby ip"],
    devices: base(["standby 1 ip 10.10.10.1", "standby 1 priority 110", "standby 1 preempt"], ["standby 2 ip 10.10.10.254"]), links,
    intro: "Hosts use 10.10.10.1 as their gateway. R2 was meant to be its backup, but it does not take over when R1 fails.",
    tasks: [
      { text: "Compare the HSRP settings on R1 and R2.", check: (t) => need(t.ran("R1", /^show standby/) && t.ran("R2", /^show standby/), "Run show standby brief on both routers.") },
      { text: "Remove R2's wrong group.", check: (t) => need(!t.f("R2", "g0/0").hsrp.groups[2], "R2 still has group 2. Use no standby 2.") },
      { text: "Put R2 in the same group as R1, with the same virtual IP.", check: (t) => need(t.f("R2", "g0/0").hsrp.groups[1]?.ip === "10.10.10.1", "Expected standby 1 ip 10.10.10.1 on R2's G0/0.") },
      { text: "R1 must stay Active.", check: (t) => need(t.hsrpActive("R1", "10.10.10.1"), "R1 is not Active.") },
    ],
    solution: { R1: ["enable", "show standby brief"], R2: ["enable", "show standby brief", "configure terminal", "interface g0/0", "no standby 2", "standby 1 ip 10.10.10.1"] },
    teach: "HSRP peers must agree on the group number and the virtual IP (and the version). Routers in different groups never hear each other, so each one is Active for its own group.",
  }),
];
