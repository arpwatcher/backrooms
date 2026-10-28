import { lab, S, PC, cfg, EN, need } from "./kit.js";

const M = "stp";
const tri = (s1 = [], s2 = [], s3 = []) => [S("SW1", 50, 12, s1), S("SW2", 22, 45, s2), S("SW3", 78, 45, s3)];
const triLinks = [["SW1", "g0/1", "SW2", "g0/1"], ["SW1", "g0/2", "SW3", "g0/1"], ["SW2", "g0/2", "SW3", "g0/2"]];
const trunks = cfg("interface range g0/1 - 2", "switchport mode trunk");

export default [
  lab({
    id: "stp-mode", module: M, title: "spanning-tree mode rapid-pvst",
    cmds: ["spanning-tree mode rapid-pvst", "show spanning-tree"],
    devices: [S("SW1", 50, 30)],
    intro: "Ο SW1 τρέχει το παλιό PVST+ (802.1D) και η σύγκλιση παίρνει 30 έως 50 δευτερόλεπτα.",
    tasks: [
      { text: "Γύρνα τον SW1 σε Rapid PVST+.", check: (t) => need(t.dev("SW1").stp.mode === "rapid-pvst", `Το mode είναι ${t.dev("SW1").stp.mode}.`) },
      { text: "Επιβεβαίωσε το protocol που τρέχει.", check: (t) => need(t.ran("SW1", /^show spanning-tree/), "Τρέξε show spanning-tree ή show spanning-tree summary.") },
    ],
    solution: { SW1: [...EN, "spanning-tree mode rapid-pvst", "end", "show spanning-tree summary"] },
    teach: "Το Rapid PVST+ (802.1w ανά VLAN) συγκλίνει σε λίγα δευτερόλεπτα. Στο show spanning-tree φαίνεται ως protocol rstp, ενώ το PVST+ φαίνεται ως ieee.",
  }),
  lab({
    id: "stp-root-primary", module: M, title: "Root bridge: root primary / secondary",
    cmds: ["spanning-tree vlan root primary", "spanning-tree vlan root secondary"],
    devices: tri(trunks, trunks, trunks), links: triLinks,
    intro: "Ο SW1 είναι ο core switch και πρέπει να είναι root για τη VLAN 1, με τον SW2 backup.",
    tasks: [
      { text: "Κάνε τον SW1 root bridge για τη VLAN 1 με τη μακροεντολή root.", check: (t) => need(t.root("SW1", 1) && t.dev("SW1").stp.vlans[1]?.root === "primary", t.root("SW1", 1) ? "Είναι root, αλλά η άσκηση ζητάει spanning-tree vlan 1 root primary." : "Ο SW1 δεν είναι root για τη VLAN 1.") },
      { text: "Κάνε τον SW2 secondary root (backup) για τη VLAN 1.", check: (t) => need(t.dev("SW2").stp.vlans[1]?.root === "secondary", "Στον SW2 χρειάζεται spanning-tree vlan 1 root secondary.") },
    ],
    solution: { SW1: [...EN, "spanning-tree vlan 1 root primary"], SW2: [...EN, "spanning-tree vlan 1 root secondary"] },
    teach: "Το root primary βάζει priority 24576 (ή χαμηλότερα, ώστε να κερδίσει τον τρέχοντα root). Το secondary βάζει 28672. Το default είναι 32768 + VLAN ID (sys-id-ext), και αν οι priorities είναι ίσες κερδίζει η χαμηλότερη MAC.",
  }),
  lab({
    id: "stp-priority", module: M, title: "spanning-tree vlan priority",
    cmds: ["spanning-tree vlan priority", "show spanning-tree vlan"],
    devices: tri(trunks, trunks, trunks), links: triLinks,
    intro: "Ο SW3 πρέπει να γίνει root για τη VLAN 1 με συγκεκριμένη priority.",
    tasks: [
      { text: "Βάλε στον SW3 priority 4096 για τη VLAN 1.", check: (t) => need(t.dev("SW3").stp.vlans[1]?.priority === 4096, `Η priority του SW3 για τη VLAN 1 είναι ${t.dev("SW3").stp.vlans[1]?.priority ?? 32768}.`) },
      { text: "Επιβεβαίωσε ότι ο SW3 είναι πλέον ο root.", check: (t) => need(t.root("SW3", 1) && t.ran("SW3", /^show spanning-tree/), "Δες show spanning-tree vlan 1 στον SW3 (This bridge is the root).") },
    ],
    solution: { SW3: [...EN, "spanning-tree vlan 1 priority 4096", "end", "show spanning-tree vlan 1"] },
    teach: "Η priority μπαίνει σε βήματα του 4096 (0, 4096, 8192 ... 61440). Οποιαδήποτε άλλη τιμή απορρίπτεται.",
  }),
  lab({
    id: "portfast", module: M, title: "spanning-tree portfast",
    cmds: ["spanning-tree portfast"],
    devices: [S("SW1", 40, 30), PC("PC1", 80, 30, "10.0.0.20/24")],
    links: [["SW1", "fa0/5", "PC1", "fa0"]],
    intro: "Οι χρήστες περιμένουν 30 δευτερόλεπτα μέχρι να πάρουν IP, γιατί η θύρα περνάει από listening και learning.",
    tasks: [{ text: "Κάνε τη Fa0/5 (θύρα PC) να περνάει αμέσως σε forwarding.", check: (t) => need(t.f("SW1", "fa0/5").stp.portfast === "edge", "Χρειάζεται spanning-tree portfast στη Fa0/5.") }],
    solution: { SW1: [...EN, "interface fa0/5", "switchport mode access", "spanning-tree portfast"] },
    teach: "Το PortFast πάει σε θύρες τελικών συσκευών μόνο, ποτέ σε θύρες προς switch. Μπαίνει μαζί με BPDU Guard, ώστε αν κάποιος συνδέσει switch εκεί, η θύρα να κλείνει.",
  }),
  lab({
    id: "bpduguard", module: M, title: "spanning-tree bpduguard enable",
    cmds: ["spanning-tree bpduguard enable"],
    devices: [S("SW1", 40, 30, cfg("interface fa0/6", "switchport mode access", "spanning-tree portfast")), PC("PC1", 80, 30, "10.0.0.21/24")],
    links: [["SW1", "fa0/6", "PC1", "fa0"]],
    intro: "Στη Fa0/6 υπάρχει PortFast. Αν κάποιος συνδέσει εκεί switch, μπορεί να δημιουργηθεί loop.",
    tasks: [{ text: "Κάνε τη Fa0/6 να μπαίνει σε err-disabled αν δεχτεί BPDU.", check: (t) => need(t.f("SW1", "fa0/6").stp.bpduguard === true, "Χρειάζεται spanning-tree bpduguard enable στη Fa0/6.") }],
    solution: { SW1: [...EN, "interface fa0/6", "spanning-tree bpduguard enable"] },
    teach: "Με BPDU μια θύρα με BPDU Guard γίνεται err-disabled. Επαναφορά: shutdown και no shutdown, ή αυτόματα με errdisable recovery cause bpduguard.",
  }),
  lab({
    id: "portfast-default", module: M, title: "PortFast και BPDU Guard για όλες τις access",
    cmds: ["spanning-tree portfast default", "spanning-tree portfast bpduguard default"],
    devices: [S("SW1", 50, 30)],
    intro: "Ο SW1 έχει 24 θύρες χρηστών και δεν θες να το ρυθμίζεις θύρα-θύρα.",
    tasks: [
      { text: "Ενεργοποίησε PortFast σε όλες τις access θύρες με μία global εντολή.", check: (t) => need(t.dev("SW1").stp.portfastDefault, "Χρειάζεται spanning-tree portfast default.") },
      { text: "Ενεργοποίησε BPDU Guard σε όλες τις PortFast θύρες με μία global εντολή.", check: (t) => need(t.dev("SW1").stp.bpduguardDefault, "Χρειάζεται spanning-tree portfast bpduguard default.") },
    ],
    solution: { SW1: [...EN, "spanning-tree portfast default", "spanning-tree portfast bpduguard default"] },
    teach: "Το portfast default επηρεάζει μόνο access θύρες, όχι trunks. Η global bpduguard default ισχύει μόνο για θύρες που είναι σε PortFast.",
  }),
  lab({
    id: "errdisable-recovery", module: M, title: "errdisable recovery",
    cmds: ["errdisable recovery cause", "errdisable recovery interval"],
    devices: [S("SW1", 50, 30)],
    intro: "Οι θύρες που κλείνει το BPDU Guard μένουν κλειστές μέχρι να τις ανοίξει κάποιος με το χέρι.",
    tasks: [
      { text: "Κάνε τις θύρες που έπεσαν λόγω bpduguard να επανέρχονται αυτόματα.", check: (t) => need(t.dev("SW1").errdisable.causes.includes("bpduguard"), "Χρειάζεται errdisable recovery cause bpduguard.") },
      { text: "Η επαναφορά να γίνεται μετά από 60 δευτερόλεπτα.", check: (t) => need(t.dev("SW1").errdisable.interval === 60, "Χρειάζεται errdisable recovery interval 60.") },
    ],
    solution: { SW1: [...EN, "errdisable recovery cause bpduguard", "errdisable recovery interval 60"] },
    teach: "Το default interval είναι 300 δευτερόλεπτα. Το ίδιο ισχύει για το psecure-violation (port security).",
  }),
  lab({
    id: "root-guard", module: M, title: "spanning-tree guard root",
    cmds: ["spanning-tree guard root"],
    devices: [S("SW1", 30, 30, cfg("spanning-tree vlan 1 root primary", "interface g0/2", "switchport mode trunk")), S("SW9", 75, 30, cfg("interface g0/1", "switchport mode trunk"))],
    links: [["SW1", "g0/2", "SW9", "g0/1"]],
    intro: "Ο SW1 είναι ο root. Ο SW9 ανήκει σε άλλη ομάδα, και δεν θέλεις ποτέ να γίνει root μέσα από τη G0/2.",
    tasks: [{ text: "Προστάτευσε τη G0/2 του SW1 ώστε, αν από εκεί έρθει καλύτερο BPDU, η θύρα να μπαίνει σε root-inconsistent.", check: (t) => need(t.f("SW1", "g0/2").stp.guard === "root", "Χρειάζεται spanning-tree guard root στη G0/2.") }],
    solution: { SW1: [...EN, "interface g0/2", "spanning-tree guard root"] },
    teach: "Το Root Guard μπαίνει σε designated θύρες προς switches που δεν πρέπει ποτέ να γίνουν root. Η θύρα επανέρχεται μόνη της όταν σταματήσουν τα superior BPDUs.",
  }),
  lab({
    id: "stp-cost", module: M, title: "spanning-tree cost (επιλογή root port)",
    cmds: ["spanning-tree vlan cost", "spanning-tree cost"],
    devices: tri([...trunks.slice(0, -1), "spanning-tree vlan 1 root primary", "end"], trunks, trunks), links: triLinks,
    intro: "Ο SW1 είναι root. Ο SW3 φτάνει στον SW1 μέσω της G0/1. Θέλεις, για τη VLAN 1, η G0/1 του SW3 να φαίνεται ακριβότερη.",
    tasks: [{ text: "Στον SW3, βάλε στη G0/1 cost 100 για τη VLAN 1.", check: (t) => need(t.f("SW3", "g0/1").stp.vlan[1]?.cost === 100 || t.f("SW3", "g0/1").stp.cost === 100, "Χρειάζεται spanning-tree vlan 1 cost 100 (ή spanning-tree cost 100) στη G0/1.") }],
    solution: { SW3: [...EN, "interface g0/1", "spanning-tree vlan 1 cost 100"] },
    teach: "Root port = η θύρα με το μικρότερο συνολικό κόστος προς τον root. Default costs (short): 10 Mbps = 100, 100 Mbps = 19, 1 Gbps = 4, 10 Gbps = 2.",
  }),
  lab({
    id: "sim-stp", module: M, title: "Sim: Spanning Tree σε τρία switches", kind: "sim",
    cmds: ["spanning-tree mode rapid-pvst", "spanning-tree vlan root primary", "spanning-tree vlan root secondary", "spanning-tree portfast", "spanning-tree bpduguard enable"],
    devices: [S("SW1", 50, 12, [...trunks.slice(0, -1), "vlan 10", "end"]), S("SW2", 22, 42, [...trunks.slice(0, -1), "vlan 10", "end"]), S("SW3", 78, 42, [...trunks.slice(0, -1), "vlan 10", "end"]), PC("PC1", 22, 56, "10.10.10.31/24")],
    links: [...triLinks, ["SW2", "fa0/1", "PC1", "fa0"]],
    intro: "Τρεις switches σε τρίγωνο, με τη VLAN 10 σε όλους. Ρύθμισε το STP όπως ζητάει το σχέδιο.",
    tasks: [
      { text: "Και οι τρεις switches να τρέχουν Rapid PVST+.", check: (t) => need(["SW1", "SW2", "SW3"].every((s) => t.dev(s).stp.mode === "rapid-pvst"), "Δεν τρέχουν όλοι rapid-pvst.") },
      { text: "Ο SW1 root για τις VLANs 1 και 10.", check: (t) => need(t.root("SW1", 1) && t.root("SW1", 10), "Ο SW1 δεν είναι root και για τις δύο VLANs.") },
      { text: "Ο SW2 backup root (secondary) για τις VLANs 1 και 10.", check: (t) => need([1, 10].every((v) => t.dev("SW2").stp.vlans[v]?.priority === 28672), "Ο SW2 χρειάζεται root secondary για τις VLANs 1 και 10.") },
      { text: "Στον SW2, η Fa0/1 (PC1) να είναι access στη VLAN 10, με PortFast και BPDU Guard.", check: (t) => { const f = t.f("SW2", "fa0/1"); return need(f.mode === "access" && f.accessVlan === 10 && f.stp.portfast === "edge" && f.stp.bpduguard === true, "Η Fa0/1 του SW2 θέλει access vlan 10, spanning-tree portfast και spanning-tree bpduguard enable."); } },
    ],
    solution: {
      SW1: [...EN, "spanning-tree mode rapid-pvst", "spanning-tree vlan 1,10 root primary"],
      SW2: [...EN, "spanning-tree mode rapid-pvst", "spanning-tree vlan 1,10 root secondary", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "spanning-tree portfast", "spanning-tree bpduguard enable"],
      SW3: [...EN, "spanning-tree mode rapid-pvst"],
    },
    teach: "Ένα spanning-tree vlan 1,10 root primary ρυθμίζει πολλές VLANs μαζί. Με show spanning-tree vlan 10 βλέπεις ποιες θύρες είναι Root, Desg και Altn.",
  }),
];
