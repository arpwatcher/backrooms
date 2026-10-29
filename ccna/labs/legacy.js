import { lab, R, S, cfg, EN, need } from "./kit.js";

// RIP, EIGRP and VTP left the blueprint with 200-301; they stay here for
// people who meet them at work or in older material
const M = "legacy";
const two = () => [
  R("R1", 25, 30, cfg("interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown")),
  R("R2", 75, 30, cfg("interface g0/0", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown")),
];
const twoLinks = [["R1", "g0/1", "R2", "g0/1"]];

export default [
  lab({
    id: "rip-v2", module: M, title: "RIPv2", extra: true,
    cmds: ["router rip", "version 2", "no auto-summary"],
    devices: two(), links: twoLinks,
    intro: "An old site runs RIP. Put R1 on RIPv2.",
    tasks: [
      { text: "RIP version 2 on R1.", check: (t) => need(t.dev("R1").rip?.version === 2, "Expected router rip and version 2.") },
      { text: "Advertise 192.168.1.0 and 10.0.0.0.", check: (t) => need(["192.168.1.0", "10.0.0.0"].every((n) => t.dev("R1").rip?.networks.some((x) => x.net === n)), "RIP network statements are classful: network 192.168.1.0 and network 10.0.0.0.") },
      { text: "Disable auto-summary.", check: (t) => need(t.dev("R1").rip && !t.dev("R1").rip.autoSummary, "Expected no auto-summary.") },
    ],
    solution: { R1: [...EN, "router rip", "version 2", "network 192.168.1.0", "network 10.0.0.0", "no auto-summary"] },
    teach: "RIP is distance vector with hop count as its metric (maximum 15) and AD 120. It is no longer on 200-301.",
  }),
  lab({
    id: "eigrp", module: M, title: "EIGRP", extra: true,
    cmds: ["router eigrp", "network wildcard"],
    devices: two(), links: twoLinks,
    intro: "Enable EIGRP AS 100 on R1 for both of its subnets.",
    tasks: [
      { text: "EIGRP AS 100 with network 192.168.1.0/24 and 10.0.12.0/30 (with wildcards).", check: (t) => { const e = t.dev("R1").eigrp[100]; return need(e && e.networks.some((n) => n.net === "192.168.1.0" && n.wild === "0.0.0.255") && e.networks.some((n) => n.net === "10.0.12.0" && n.wild === "0.0.0.3"), "Expected router eigrp 100, network 192.168.1.0 0.0.0.255 and network 10.0.12.0 0.0.0.3."); } },
      { text: "Make G0/0 (the LAN) passive.", check: (t) => need(t.dev("R1").eigrp[100]?.passive.includes("GigabitEthernet0/0"), "Expected passive-interface g0/0.") },
    ],
    solution: { R1: [...EN, "router eigrp 100", "network 192.168.1.0 0.0.0.255", "network 10.0.12.0 0.0.0.3", "passive-interface g0/0"] },
    teach: "EIGRP has AD 90 (internal) and 170 (external), and neighbors must use the same AS. It is not on 200-301, but its AD is still worth remembering.",
  }),
  lab({
    id: "ospf-multiarea", module: M, title: "Multi-area OSPF and area range", extra: true,
    cmds: ["network area 1", "area range"],
    devices: [R("R1", 25, 30, cfg("interface g0/0", "ip address 10.0.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.1.12.1 255.255.255.252", "no shutdown")), R("R2", 75, 30, cfg("interface g0/1", "ip address 10.1.12.2 255.255.255.252", "no shutdown"))],
    links: [["R1", "g0/1", "R2", "g0/1"]],
    intro: "R1 is an ABR: its LAN is in area 1 and its link to R2 in area 0.",
    tasks: [
      { text: "R1: G0/0 (10.0.1.0/24) in area 1, G0/1 (10.1.12.0/30) in area 0, process 1.", check: (t) => need(t.ospfOf("R1", "g0/0")?.area === 1 && t.ospfOf("R1", "g0/1")?.area === 0, "G0/0 must be in area 1 and G0/1 in area 0.") },
      { text: "Summarize area 1 as 10.0.0.0/16 toward area 0.", check: (t) => need(t.dev("R1").ospf[1]?.ranges.some((r) => r.area === 1 && r.net === "10.0.0.0" && r.mask === "255.255.0.0"), "Expected area 1 range 10.0.0.0 255.255.0.0.") },
    ],
    solution: { R1: [...EN, "router ospf 1", "network 10.0.1.0 0.0.0.255 area 1", "network 10.1.12.0 0.0.0.3 area 0", "area 1 range 10.0.0.0 255.255.0.0"] },
    teach: "200-301 covers single-area OSPFv2 only. An ABR connects an area to area 0, and area range summarizes an area's routes (O IA in the other areas).",
  }),
  lab({
    id: "rip-summary", module: M, title: "RIP summary on an interface", extra: true,
    cmds: ["ip summary-address rip"],
    devices: two(), links: twoLinks,
    intro: "R1 should advertise one summary for 10.0.0.0/16 toward R2 instead of every subnet.",
    tasks: [{ text: "On G0/1 of R1, summarize 10.0.0.0/16 for RIP.", check: (t) => need(t.f("R1", "g0/1").ripSummary === "10.0.0.0 255.255.0.0", "Expected ip summary-address rip 10.0.0.0 255.255.0.0 on G0/1.") }],
    solution: { R1: [...EN, "router rip", "version 2", "no auto-summary", "network 10.0.0.0", "interface g0/1", "ip summary-address rip 10.0.0.0 255.255.0.0"] },
    teach: "RIP summarizes per interface, with ip summary-address rip. It is not on 200-301.",
  }),
  lab({
    id: "vtp", module: M, title: "VTP modes", extra: true,
    cmds: ["vtp domain", "vtp mode", "show vtp status"],
    devices: [S("SW1", 25, 30), S("SW2", 75, 30)],
    links: [["SW1", "g0/1", "SW2", "g0/1"]],
    intro: "SW1 manages the VLANs. SW2 learns them from it.",
    tasks: [
      { text: "Both switches in domain CCNA.", check: (t) => need(t.dev("SW1").vtp.domain === "CCNA" && t.dev("SW2").vtp.domain === "CCNA", "Expected vtp domain CCNA on both switches.") },
      { text: "SW2 in client mode.", check: (t) => need(t.dev("SW2").vtp.mode === "client", "Expected vtp mode client on SW2.") },
      { text: "Display the VTP status on SW2.", check: (t) => need(t.ran("SW2", /^show vtp status$/), "Run show vtp status.") },
    ],
    solution: { SW1: [...EN, "vtp domain CCNA"], SW2: [...EN, "vtp domain CCNA", "vtp mode client", "end", "show vtp status"] },
    teach: "VTP modes: server (default), client, transparent (keeps local VLANs and just forwards), off. Many networks run transparent for safety.",
  }),
];
