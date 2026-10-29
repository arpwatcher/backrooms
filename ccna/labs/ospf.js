import { lab, R, PC, ISP, cfg, EN, need, is } from "./kit.js";

const M = "ospf";
const two = (a = [], b = []) => [R("R1", 25, 28, cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", ...a)), R("R2", 75, 28, cfg("interface g0/0", "ip address 10.2.2.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", ...b)), PC("PC1", 25, 52, "10.1.1.10/24", "10.1.1.1"), PC("PC2", 75, 52, "10.2.2.10/24", "10.2.2.1")];
const links = [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"], ["R2", "g0/0", "PC2", "fa0"]];
const learned = { R1: [{ net: "10.2.2.0", bits: 24, via: "10.0.12.2", out: "GigabitEthernet0/1" }], R2: [{ net: "10.1.1.0", bits: 24, via: "10.0.12.1", out: "GigabitEthernet0/1" }] };
const area = (t, r, i) => t.ospfOf(r, i)?.area;
const r2ospf = ["router ospf 1", "network 10.2.2.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0"];

export default [
  lab({
    id: "ospf-network", module: M, title: "OSPF with network statements",
    cmds: ["router ospf", "network <net> <wildcard> area"],
    devices: two([], r2ospf), links, learned,
    intro: "R2 already runs OSPF. Enable OSPF on R1 for both of its networks.",
    tasks: [
      { text: "Start OSPF process 1 on R1.", check: (t) => need(t.dev("R1").ospf[1], "Expected router ospf 1.") },
      { text: "Put 10.1.1.0/24 in area 0.", check: (t) => need(area(t, "R1", "g0/0") === 0, "G0/0 (10.1.1.0/24) is not in OSPF area 0. Use network 10.1.1.0 0.0.0.255 area 0 (a wildcard, not a mask).") },
      { text: "Put the link to R2 (10.0.12.0/30) in area 0 so that an adjacency forms.", check: (t) => need(t.ospfAdj("R1", "R2"), area(t, "R1", "g0/1") === undefined ? "G0/1 is not in OSPF: network 10.0.12.0 0.0.0.3 area 0." : "No adjacency formed with R2.") },
    ],
    solution: { R1: [...EN, "router ospf 1", "network 10.1.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0"] },
    teach: "network <address> <wildcard> area <n> enables OSPF on every interface whose IP matches. Wildcard = 255.255.255.255 minus the mask (/24 is 0.0.0.255, /30 is 0.0.0.3). The process ID is local and need not match the neighbor's.",
  }),
  lab({
    id: "ospf-interface", module: M, title: "OSPF per interface: ip ospf area",
    cmds: ["ip ospf <pid> area"],
    devices: two([], r2ospf), links, learned,
    intro: "Instead of network statements, enable OSPF directly on R1's interfaces.",
    tasks: [
      { text: "Create process 1 on R1 (router ospf 1).", check: (t) => need(t.dev("R1").ospf[1], "Expected router ospf 1 (the process must exist).") },
      { text: "Put G0/0 and G0/1 in area 0 with an interface command.", check: (t) => need(["g0/0", "g0/1"].every((i) => t.f("R1", i).ospf.pid === 1 && t.f("R1", i).ospf.area === 0), "Expected ip ospf 1 area 0 on G0/0 and G0/1.") },
      { text: "The adjacency with R2 must be FULL.", check: (t) => need(t.ospfAdj("R1", "R2"), "No adjacency formed with R2.") },
    ],
    solution: { R1: [...EN, "router ospf 1", "interface g0/0", "ip ospf 1 area 0", "interface g0/1", "ip ospf 1 area 0"] },
    teach: "ip ospf <pid> area <n> on the interface is cleaner than network statements, because you control exactly which interfaces join.",
  }),
  lab({
    id: "ospf-router-id", module: M, title: "OSPF router ID",
    cmds: ["router-id", "clear ip ospf process", "show ip ospf"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], [...r2ospf]), links, learned,
    intro: "R1 picked its router ID from its interface addresses. The design calls for router ID 1.1.1.1.",
    tasks: [
      { text: "Set R1's router ID to 1.1.1.1.", check: (t) => need(t.dev("R1").ospf[1]?.routerId === "1.1.1.1", "Expected router-id 1.1.1.1 under router ospf 1.") },
      { text: "Make the router ID take effect (OSPF is already running).", check: (t) => need(t.ran("R1", /^clear ip ospf process$/) || t.ran("R1", /^reload$/), "While OSPF runs, the new router ID takes effect after clear ip ospf process (answer yes).") },
    ],
    solution: { R1: [...EN, "router ospf 1", "router-id 1.1.1.1", "end", "clear ip ospf process", "yes", "show ip ospf"] },
    teach: "Router ID selection order: 1) the router-id command, 2) the highest IP on an up loopback, 3) the highest IP on an up physical interface. Two routers with the same router ID do not become neighbors.",
  }),
  lab({
    id: "ospf-passive", module: M, title: "passive-interface",
    cmds: ["passive-interface"],
    devices: two(["router ospf 1", "network 10.1.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0"], r2ospf), links, learned,
    intro: "R1 sends OSPF hellos onto the user LAN (G0/0), where there is no router.",
    tasks: [{ text: "Stop hellos on G0/0 of R1 without removing its network from OSPF.", check: (t) => need(t.passive("R1", 1, "g0/0") && area(t, "R1", "g0/0") === 0 && t.ospfAdj("R1", "R2"), "Expected passive-interface g0/0 under router ospf 1 (the adjacency through G0/1 must stay).") }],
    solution: { R1: [...EN, "router ospf 1", "passive-interface g0/0"] },
    teach: "A passive interface is still advertised in OSPF but sends no hellos, so no neighbor can form there. That is also a security measure.",
  }),
  lab({
    id: "ospf-passive-default", module: M, title: "passive-interface default",
    cmds: ["passive-interface default", "no passive-interface"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "R1 will get many LAN interfaces. Safer: make them all passive except the links to routers.",
    tasks: [
      { text: "Make every interface on R1 passive by default.", check: (t) => need(t.dev("R1").ospf[1]?.passiveDefault, "Expected passive-interface default.") },
      { text: "Leave only G0/1 toward R2 active (not passive).", check: (t) => need(!t.passive("R1", 1, "g0/1") && t.passive("R1", 1, "g0/0") && t.ospfAdj("R1", "R2"), "Expected no passive-interface g0/1.") },
    ],
    solution: { R1: [...EN, "router ospf 1", "passive-interface default", "no passive-interface g0/1"] },
    teach: "Forget the no passive-interface and every adjacency is lost, because the links to the routers become passive too.",
  }),
  lab({
    id: "ospf-cost", module: M, title: "OSPF cost and reference bandwidth",
    cmds: ["auto-cost reference-bandwidth", "ip ospf cost"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "With the default reference bandwidth (100 Mbps), a 1 Gbps link and a 100 Mbps link both cost 1.",
    tasks: [
      { text: "On R1, change the reference bandwidth to 100000 Mbps (100 Gbps).", check: (t) => need(t.dev("R1").ospf[1]?.refBw === 100000, "Expected auto-cost reference-bandwidth 100000.") },
      { text: "On G0/1 of R1, set the cost to 50 directly.", check: (t) => need(t.cost("R1", "g0/1") === 50, `G0/1 has cost ${t.cost("R1", "g0/1")}. Use ip ospf cost 50.`) },
    ],
    solution: { R1: [...EN, "router ospf 1", "auto-cost reference-bandwidth 100000", "interface g0/1", "ip ospf cost 50"] },
    teach: "cost = reference bandwidth / interface bandwidth (minimum 1). Every router should use the same reference bandwidth. ip ospf cost overrides the calculation.",
  }),
  lab({
    id: "ospf-bandwidth", module: M, title: "bandwidth and the OSPF cost",
    cmds: ["bandwidth", "no bandwidth", "show ip ospf interface brief"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "G0/1 of R1 really runs over a 10 Mbps circuit, but OSPF thinks it is a gigabit link.",
    tasks: [
      { text: "Tell IOS that G0/1 has 10000 kbps, so OSPF calculates cost 10.", check: (t) => need(t.f("R1", "g0/1").bandwidth === 10000 && t.cost("R1", "g0/1") === 10, `G0/1 has cost ${t.cost("R1", "g0/1")}. Expected bandwidth 10000 (in kbps).`) },
      { text: "Check the new cost.", check: (t) => need(t.ran("R1", /^show ip ospf interface( brief)?/), "Run show ip ospf interface brief.") },
    ],
    solution: { R1: [...EN, "interface g0/1", "bandwidth 10000", "end", "show ip ospf interface brief"] },
    teach: "bandwidth is in kbps and changes only what routing protocols calculate, not the real speed of the link. no bandwidth returns to the default. OSPF cost = 100 Mbps / 10 Mbps = 10.",
  }),
  lab({
    id: "ospf-dr-priority", module: M, title: "DR/BDR with ip ospf priority",
    cmds: ["ip ospf priority", "show ip ospf neighbor"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "On the segment between R1 and R2, R1 must always be the DR.",
    tasks: [
      { text: "Set the OSPF priority on G0/1 of R1 to 100.", check: (t) => need(t.f("R1", "g0/1").ospf.priority === 100, "Expected ip ospf priority 100 on G0/1.") },
      { text: "Verify from R2 that R1 is listed as the DR.", check: (t) => need(t.ran("R2", /^show ip ospf neighbor/), "Run show ip ospf neighbor on R2.") },
    ],
    solution: { R1: [...EN, "interface g0/1", "ip ospf priority 100"], R2: ["enable", "show ip ospf neighbor"] },
    teach: "The DR is the highest priority (default 1; 0 means never DR), then the highest router ID. The election does not preempt: changing the DR needs clear ip ospf process.",
  }),
  lab({
    id: "ospf-p2p", module: M, title: "ip ospf network point-to-point",
    cmds: ["ip ospf network point-to-point"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "The R1-R2 link has only two routers, so a DR/BDR election is not needed.",
    tasks: [{ text: "Make G0/1 point-to-point for OSPF on both routers.", check: (t) => need(t.f("R1", "g0/1").ospf.network === "point-to-point" && t.f("R2", "g0/1").ospf.network === "point-to-point", "Expected ip ospf network point-to-point on G0/1 of both routers.") }],
    solution: { R1: [...EN, "interface g0/1", "ip ospf network point-to-point"], R2: [...EN, "interface g0/1", "ip ospf network point-to-point"] },
    teach: "With the point-to-point network type there is no DR/BDR election, and the adjacency comes up faster. show ip ospf neighbor shows it as FULL/ -.",
  }),
  lab({
    id: "ospf-timers", module: M, title: "Hello and dead timers",
    cmds: ["ip ospf hello-interval", "ip ospf dead-interval"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0", "interface g0/1", "ip ospf hello-interval 5", "ip ospf dead-interval 20"], r2ospf), links, learned,
    intro: "The R1-R2 adjacency went down after a change on R1. R2 uses the default timers.",
    tasks: [
      { text: "Find the mismatch by looking at the OSPF details of G0/1 on both routers.", check: (t) => need(t.ran("R1", /^show ip ospf interface/) || t.ran("R2", /^show ip ospf interface/), "Run show ip ospf interface g0/1.") },
      { text: "Bring the adjacency back by changing R2's timers to match R1 (5/20).", check: (t) => need(t.ospfAdj("R1", "R2") && t.f("R2", "g0/1").ospf.hello === 5, "Hello and dead timers must match at both ends (5 and 20 on R2).") },
    ],
    solution: { R1: ["enable", "show ip ospf interface g0/1"], R2: [...EN, "interface g0/1", "ip ospf hello-interval 5", "ip ospf dead-interval 20"] },
    teach: "To become neighbors these must match: area, subnet and mask, hello and dead timers, authentication, MTU and stub flags. The router ID must be unique.",
  }),
  lab({
    id: "ospf-default-originate", module: M, title: "default-information originate",
    cmds: ["default-information originate"],
    devices: [R("R1", 25, 28, cfg("interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "interface g0/2", "ip address 203.0.113.2 255.255.255.252", "no shutdown", "ip route 0.0.0.0 0.0.0.0 203.0.113.1", "router ospf 1", "network 10.0.12.0 0.0.0.3 area 0")), R("R2", 60, 28, cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "router ospf 1", "network 10.0.12.0 0.0.0.3 area 0")), ISP("ISP", 25, 52)],
    links: [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/2", "ISP", "g0/0"]],
    intro: "R1 has a default route to the ISP, but the internal routers do not learn it.",
    tasks: [{ text: "Make R1 advertise its default route into OSPF.", check: (t) => need(t.dev("R1").ospf[1]?.defaultOriginate, "Expected default-information originate under router ospf 1.") }],
    solution: { R1: [...EN, "router ospf 1", "default-information originate"] },
    teach: "It advertises 0.0.0.0/0 (O*E2 on the other routers) only if R1 itself has a default route. With always, it advertises it regardless.",
  }),
  lab({
    id: "ospf-verify", module: M, title: "Verifying OSPF: neighbors, interfaces, routes",
    cmds: ["show ip ospf neighbor", "show ip ospf interface brief", "show ip route ospf", "show ip protocols"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "OSPF is running. Learn the verification commands the exam keeps asking for.",
    tasks: [
      { text: "On R1, display the OSPF neighbors.", check: (t) => need(t.ran("R1", /^show ip ospf neighbor/), "Run show ip ospf neighbor.") },
      { text: "Display which interfaces run OSPF, with their area and cost.", check: (t) => need(t.ran("R1", /^show ip ospf interface brief$/), "Run show ip ospf interface brief.") },
      { text: "Display only the routes learned through OSPF.", check: (t) => need(t.ran("R1", /^show ip route ospf$/), "Run show ip route ospf.") },
      { text: "Display the router ID, networks and passive interfaces with one command.", check: (t) => need(t.ran("R1", /^show ip protocols$/), "Run show ip protocols.") },
    ],
    solution: { R1: ["enable", "show ip ospf neighbor", "show ip ospf interface brief", "show ip route ospf", "show ip protocols"] },
    teach: "O is intra-area, O IA is inter-area, O E2 is external (for example from default-information originate). OSPF's AD is 110 and its metric is cost.",
  }),
  lab({
    id: "sim-ospf", module: M, title: "Sim: single-area OSPF on three routers", kind: "sim",
    cmds: ["router ospf", "router-id", "network", "passive-interface", "ip ospf"],
    devices: [R("R1", 18, 25, cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "interface lo0", "ip address 1.1.1.1 255.255.255.255")), R("R2", 50, 25, cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface g0/2", "ip address 10.0.23.1 255.255.255.252", "no shutdown")), R("R3", 82, 25, cfg("interface g0/0", "ip address 10.3.3.1 255.255.255.0", "no shutdown", "interface g0/2", "ip address 10.0.23.2 255.255.255.252", "no shutdown")), PC("PC1", 18, 52, "10.1.1.10/24", "10.1.1.1"), PC("PC3", 82, 52, "10.3.3.10/24", "10.3.3.1")],
    links: [["R1", "g0/1", "R2", "g0/1"], ["R2", "g0/2", "R3", "g0/2"], ["R1", "g0/0", "PC1", "fa0"], ["R3", "g0/0", "PC3", "fa0"]],
    learned: { R1: [{ net: "10.0.23.0", bits: 30, via: "10.0.12.2", out: "GigabitEthernet0/1" }, { net: "10.3.3.0", bits: 24, via: "10.0.12.2", out: "GigabitEthernet0/1", metric: 3 }] },
    intro: "Three routers in a line. Every network goes in area 0, process 10.",
    tasks: [
      { text: "R1, R2, R3: OSPF process 10 with all their interfaces (and R1's Lo0) in area 0.", check: (t) => need([["R1", ["g0/0", "g0/1", "lo0"]], ["R2", ["g0/1", "g0/2"]], ["R3", ["g0/0", "g0/2"]]].every(([r, ifs]) => ifs.every((i) => t.ospfOf(r, i)?.pid === 10 && t.ospfOf(r, i)?.area === 0)), "An interface is not in OSPF 10 area 0.") },
      { text: "Router IDs: R1 1.1.1.1, R2 2.2.2.2, R3 3.3.3.3.", check: (t) => need(t.routerId("R1", 10) === "1.1.1.1" && t.routerId("R2", 10) === "2.2.2.2" && t.routerId("R3", 10) === "3.3.3.3", "The router IDs are not correct (R1 can also take 1.1.1.1 from Lo0).") },
      { text: "The LAN interfaces (G0/0 on R1 and R3) must not send hellos.", check: (t) => need(t.passive("R1", 10, "g0/0") && t.passive("R3", 10, "g0/0"), "Expected passive-interface g0/0 on R1 and R3.") },
      { text: "FULL adjacencies: R1-R2 and R2-R3.", check: (t) => need(t.ospfAdj("R1", "R2") && t.ospfAdj("R2", "R3"), "Not every adjacency is up.") },
    ],
    solution: {
      R1: [...EN, "router ospf 10", "router-id 1.1.1.1", "network 10.1.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0", "network 1.1.1.1 0.0.0.0 area 0", "passive-interface g0/0"],
      R2: [...EN, "router ospf 10", "router-id 2.2.2.2", "network 10.0.12.0 0.0.0.3 area 0", "network 10.0.23.0 0.0.0.3 area 0"],
      R3: [...EN, "router ospf 10", "router-id 3.3.3.3", "network 10.3.3.0 0.0.0.255 area 0", "network 10.0.23.0 0.0.0.3 area 0", "passive-interface g0/0"],
    },
    teach: "A network statement with wildcard 0.0.0.0 matches a single IP. Configure the router ID before the network statements, so no clear ip ospf process is needed.",
  }),
  lab({
    id: "ospf-neighbor-read", module: M, title: "Reading show ip ospf neighbor",
    cmds: ["show ip ospf neighbor"],
    devices: two(["router ospf 1", "router-id 1.1.1.1", "network 10.0.0.0 0.255.255.255 area 0"], ["router ospf 1", "router-id 2.2.2.2", "network 10.0.0.0 0.255.255.255 area 0"]), links, learned,
    intro: "OSPF is up between R1 and R2. Answer from the output on R1.",
    tasks: [
      { text: "On R1, display the OSPF neighbors.", check: (t) => need(t.ran("R1", /^show ip ospf neighbor/), "Run show ip ospf neighbor.") },
      { text: "What is the neighbor's router ID?", ask: "a.b.c.d", check: (t) => need(is.ip(t.reply, "2.2.2.2"), "Read the Neighbor ID column.") },
      { text: "Which address does R1 reach the neighbor at?", ask: "a.b.c.d", check: (t) => need(is.ip(t.reply, "10.0.12.2"), "Read the Address column (the neighbor's interface, not its router ID).") },
    ],
    solution: { R1: ["enable", "show ip ospf neighbor"] },
    answers: { 1: "2.2.2.2", 2: "10.0.12.2" },
    teach: "Neighbor ID is the neighbor's router ID; Address is the IP of its interface on the shared link. State FULL means the databases are synchronized; FULL/DR, FULL/BDR or FULL/DROTHER show its role, and FULL/ - is a point-to-point link.",
  }),
  lab({
    id: "sim-ospf-fix", module: M, title: "Sim: R1 and R2 are not OSPF neighbors", kind: "sim",
    cmds: ["show ip ospf interface", "show ip protocols", "passive-interface", "network area"],
    devices: two(["router ospf 1", "network 10.1.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0", "passive-interface g0/1"], ["router ospf 1", "network 10.2.2.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 1"]), links, learned,
    intro: "Both routers run OSPF, but R1's LAN cannot reach R2's. There are two faults.",
    tasks: [
      { text: "Check the OSPF configuration on both routers.", check: (t) => need(["R1", "R2"].every((r) => t.ran(r, /^show (ip protocols|ip ospf interface|running-config)/)), "Run show ip protocols (or show ip ospf interface) on R1 and on R2.") },
      { text: "Fix the fault on R1.", check: (t) => need(!t.passive("R1", 1, "g0/1"), "R1 does not send hellos on G0/1: it is passive.") },
      { text: "Fix the fault on R2, keeping everything in area 0.", check: (t) => need(t.ospfOf("R2", "g0/1")?.area === 0, "R2 puts the R1-R2 link in area 1; it must be area 0 at both ends.") },
      { text: "The adjacency must be FULL.", check: (t) => need(t.ospfAdj("R1", "R2"), "The routers are still not neighbors.") },
    ],
    solution: {
      R1: ["enable", "show ip protocols", "configure terminal", "router ospf 1", "no passive-interface g0/1"],
      R2: ["enable", "show ip protocols", "configure terminal", "router ospf 1", "no network 10.0.12.0 0.0.0.3 area 1", "network 10.0.12.0 0.0.0.3 area 0"],
    },
    teach: "show ip protocols lists the networks, areas and passive interfaces; show ip ospf interface shows each interface's area and timers. A passive interface sends no hellos, and both ends of a link must be in the same area.",
  }),
];
