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
    intro: "Ένα παλιό site τρέχει RIP. Βάλε τον R1 στο RIPv2.",
    tasks: [
      { text: "RIP version 2 στον R1.", check: (t) => need(t.dev("R1").rip?.version === 2, "Χρειάζεται router rip και version 2.") },
      { text: "Διαφήμισε τα 192.168.1.0 και 10.0.0.0.", check: (t) => need(["192.168.1.0", "10.0.0.0"].every((n) => t.dev("R1").rip?.networks.some((x) => x.net === n)), "Στο RIP το network γράφεται classful: network 192.168.1.0 και network 10.0.0.0.") },
      { text: "Κλείσε το auto-summary.", check: (t) => need(t.dev("R1").rip && !t.dev("R1").rip.autoSummary, "Χρειάζεται no auto-summary.") },
    ],
    solution: { R1: [...EN, "router rip", "version 2", "network 192.168.1.0", "network 10.0.0.0", "no auto-summary"] },
    teach: "Το RIP είναι distance vector με metric το hop count (max 15) και AD 120. Δεν είναι πια στην ύλη του 200-301.",
  }),
  lab({
    id: "eigrp", module: M, title: "EIGRP", extra: true,
    cmds: ["router eigrp", "network wildcard"],
    devices: two(), links: twoLinks,
    intro: "Ενεργοποίησε EIGRP AS 100 στον R1 για τα δύο subnets του.",
    tasks: [
      { text: "EIGRP AS 100 με network 192.168.1.0/24 και 10.0.12.0/30 (με wildcard).", check: (t) => { const e = t.dev("R1").eigrp[100]; return need(e && e.networks.some((n) => n.net === "192.168.1.0" && n.wild === "0.0.0.255") && e.networks.some((n) => n.net === "10.0.12.0" && n.wild === "0.0.0.3"), "Χρειάζεται router eigrp 100, network 192.168.1.0 0.0.0.255 και network 10.0.12.0 0.0.0.3."); } },
      { text: "Το G0/0 (LAN) να είναι passive.", check: (t) => need(t.dev("R1").eigrp[100]?.passive.includes("GigabitEthernet0/0"), "Χρειάζεται passive-interface g0/0.") },
    ],
    solution: { R1: [...EN, "router eigrp 100", "network 192.168.1.0 0.0.0.255", "network 10.0.12.0 0.0.0.3", "passive-interface g0/0"] },
    teach: "Το EIGRP έχει AD 90 (internal) και 170 (external), και για να γίνουν γείτονες δύο routers πρέπει να έχουν ίδιο AS. Είναι εκτός ύλης του 200-301, αλλά το AD του αξίζει να το θυμάσαι.",
  }),
  lab({
    id: "vtp", module: M, title: "VTP modes", extra: true,
    cmds: ["vtp domain", "vtp mode", "show vtp status"],
    devices: [S("SW1", 25, 30), S("SW2", 75, 30)],
    links: [["SW1", "g0/1", "SW2", "g0/1"]],
    intro: "Ο SW1 διαχειρίζεται τις VLANs. Ο SW2 τις παίρνει από αυτόν.",
    tasks: [
      { text: "Και οι δύο στο domain CCNA.", check: (t) => need(t.dev("SW1").vtp.domain === "CCNA" && t.dev("SW2").vtp.domain === "CCNA", "Χρειάζεται vtp domain CCNA και στους δύο.") },
      { text: "Ο SW2 σε client mode.", check: (t) => need(t.dev("SW2").vtp.mode === "client", "Χρειάζεται vtp mode client στον SW2.") },
      { text: "Δες την κατάσταση του VTP στον SW2.", check: (t) => need(t.ran("SW2", /^show vtp status$/), "show vtp status") },
    ],
    solution: { SW1: [...EN, "vtp domain CCNA"], SW2: [...EN, "vtp domain CCNA", "vtp mode client", "end", "show vtp status"] },
    teach: "Τα VTP modes: server (default), client, transparent (κρατά τοπικές VLANs και απλώς προωθεί), off. Στην πράξη πολλά δίκτυα το έχουν transparent για ασφάλεια.",
  }),
];
