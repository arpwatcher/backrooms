import { lab, R, S, PC, cfg, EN, need } from "./kit.js";

const M = "hsrp";
const base = (a = [], b = []) => [R("R1", 25, 15, cfg("interface g0/0", "ip address 10.10.10.2 255.255.255.0", "no shutdown", ...a)), R("R2", 75, 15, cfg("interface g0/0", "ip address 10.10.10.3 255.255.255.0", "no shutdown", ...b)), S("SW1", 50, 38), PC("PC1", 50, 56, "10.10.10.50/24", "10.10.10.1")];
const links = [["R1", "g0/0", "SW1", "g0/1"], ["R2", "g0/0", "SW1", "g0/2"], ["SW1", "fa0/1", "PC1", "fa0"]];
const grp = (t, r, g = 1) => t.f(r, "g0/0").hsrp.groups[g];

export default [
  lab({
    id: "hsrp-basic", module: M, title: "HSRP: virtual gateway",
    cmds: ["standby ip", "show standby brief"],
    devices: base(), links,
    intro: "Τα PCs έχουν gateway 10.10.10.1. Αν πέσει ένας router, ο άλλος πρέπει να αναλάβει αυτή τη διεύθυνση.",
    tasks: [
      { text: "R1: HSRP group 1 με virtual IP 10.10.10.1.", check: (t) => need(grp(t, "R1")?.ip === "10.10.10.1", "Στο G0/0 του R1 χρειάζεται standby 1 ip 10.10.10.1.") },
      { text: "R2: το ίδιο group και virtual IP.", check: (t) => need(grp(t, "R2")?.ip === "10.10.10.1", "Στο G0/0 του R2 χρειάζεται standby 1 ip 10.10.10.1.") },
      { text: "Δες ποιος είναι Active και ποιος Standby.", check: (t) => need(t.ran("R1", /^show standby( brief)?$/) || t.ran("R2", /^show standby( brief)?$/), "show standby brief") },
    ],
    solution: { R1: [...EN, "interface g0/0", "standby 1 ip 10.10.10.1", "end", "show standby brief"], R2: [...EN, "interface g0/0", "standby 1 ip 10.10.10.1"] },
    teach: "Η virtual IP είναι το gateway των hosts, και μια virtual MAC (0000.0c07.acXX, όπου XX το group σε hex) τη συνοδεύει. Active γίνεται η μεγαλύτερη priority (default 100) και σε ισοπαλία η μεγαλύτερη πραγματική IP.",
  }),
  lab({
    id: "hsrp-priority", module: M, title: "HSRP priority και preempt",
    cmds: ["standby priority", "standby preempt"],
    devices: base(["standby 1 ip 10.10.10.1"], ["standby 1 ip 10.10.10.1"]), links,
    intro: "Τώρα Active είναι ο R2, γιατί έχει μεγαλύτερη IP. Θέλουμε τον R1 Active, και να ξαναπαίρνει τον ρόλο όταν επανέρχεται.",
    tasks: [
      { text: "Βάλε στον R1 priority 110 στο group 1.", check: (t) => need(grp(t, "R1")?.priority === 110, "Χρειάζεται standby 1 priority 110.") },
      { text: "Ενεργοποίησε preempt στον R1.", check: (t) => need(grp(t, "R1")?.preempt, "Χωρίς standby 1 preempt ο R1 δεν παίρνει πίσω τον ρόλο από τον τρέχοντα Active.") },
      { text: "Ο R1 να είναι πλέον Active.", check: (t) => need(t.hsrpActive("R1", "10.10.10.1"), "Ο R1 δεν είναι Active.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "standby 1 priority 110", "standby 1 preempt"] },
    teach: "Το HSRP δεν είναι preemptive από προεπιλογή: ένας router με μεγαλύτερη priority που ανεβαίνει αργότερα δεν αναλαμβάνει, εκτός αν έχει preempt.",
  }),
  lab({
    id: "hsrp-v2", module: M, title: "HSRP version 2",
    cmds: ["standby version 2"],
    devices: base(["standby 1 ip 10.10.10.1"], ["standby 1 ip 10.10.10.1"]), links,
    intro: "Η εταιρεία θέλει HSRPv2, για να μπορεί να χρησιμοποιεί group αριθμούς πάνω από 255 και IPv6.",
    tasks: [{ text: "Γύρνα το HSRP σε version 2 και στους δύο routers.", check: (t) => need(t.f("R1", "g0/0").hsrp.version === 2 && t.f("R2", "g0/0").hsrp.version === 2, "Χρειάζεται standby version 2 στο G0/0 και των δύο.") }],
    solution: { R1: [...EN, "interface g0/0", "standby version 2"], R2: [...EN, "interface g0/0", "standby version 2"] },
    teach: "HSRPv1 και v2 δεν συνεργάζονται. Η v2 έχει groups 0-4095, multicast 224.0.0.102 και virtual MAC 0000.0c9f.fXXX.",
  }),
  lab({
    id: "sim-hsrp", module: M, title: "Sim: HSRP για δύο VLANs με load sharing", kind: "sim",
    cmds: ["standby ip", "standby priority", "standby preempt"],
    devices: [R("R1", 25, 15, cfg("interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 10.10.10.2 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 10.10.20.2 255.255.255.0")), R("R2", 75, 15, cfg("interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 10.10.10.3 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 10.10.20.3 255.255.255.0")), S("SW1", 50, 40, cfg("vlan 10", "vlan 20", "interface range g0/1 - 2", "switchport mode trunk"))],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["R2", "g0/0", "SW1", "g0/2"]],
    intro: "Ο R1 πρέπει να είναι Active για τη VLAN 10 και ο R2 για τη VLAN 20, ώστε να μοιράζεται το φορτίο.",
    tasks: [
      { text: "VLAN 10: group 10 με virtual IP 10.10.10.1 και στους δύο routers.", check: (t) => need(t.f("R1", "g0/0.10").hsrp.groups[10]?.ip === "10.10.10.1" && t.f("R2", "g0/0.10").hsrp.groups[10]?.ip === "10.10.10.1", "Λείπει το standby 10 ip 10.10.10.1 κάπου.") },
      { text: "VLAN 20: group 20 με virtual IP 10.10.20.1 και στους δύο routers.", check: (t) => need(t.f("R1", "g0/0.20").hsrp.groups[20]?.ip === "10.10.20.1" && t.f("R2", "g0/0.20").hsrp.groups[20]?.ip === "10.10.20.1", "Λείπει το standby 20 ip 10.10.20.1 κάπου.") },
      { text: "Ο R1 Active για τη VLAN 10 (priority 110, preempt).", check: (t) => need(t.hsrpActive("R1", "10.10.10.1") && t.f("R1", "g0/0.10").hsrp.groups[10]?.preempt, "Ο R1 δεν είναι Active με preempt για τη VLAN 10.") },
      { text: "Ο R2 Active για τη VLAN 20 (priority 110, preempt).", check: (t) => need(t.hsrpActive("R2", "10.10.20.1") && t.f("R2", "g0/0.20").hsrp.groups[20]?.preempt, "Ο R2 δεν είναι Active με preempt για τη VLAN 20.") },
    ],
    solution: {
      R1: [...EN, "interface g0/0.10", "standby 10 ip 10.10.10.1", "standby 10 priority 110", "standby 10 preempt", "interface g0/0.20", "standby 20 ip 10.10.20.1"],
      R2: [...EN, "interface g0/0.10", "standby 10 ip 10.10.10.1", "interface g0/0.20", "standby 20 ip 10.10.20.1", "standby 20 priority 110", "standby 20 preempt"],
    },
    teach: "Το HSRP δεν κάνει load balancing μέσα σε ένα group. Μοιράζεις το φορτίο με ξεχωριστά groups ανά VLAN, με διαφορετικό Active router στο καθένα. Το GLBP κάνει πραγματικό load balancing.",
  }),
];
