import { lab, R, PC, ISP, cfg, EN, need } from "./kit.js";

const M = "ospf";
const two = (a = [], b = []) => [R("R1", 25, 28, cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", ...a)), R("R2", 75, 28, cfg("interface g0/0", "ip address 10.2.2.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", ...b)), PC("PC1", 25, 52, "10.1.1.10/24", "10.1.1.1"), PC("PC2", 75, 52, "10.2.2.10/24", "10.2.2.1")];
const links = [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"], ["R2", "g0/0", "PC2", "fa0"]];
const learned = { R1: [{ net: "10.2.2.0", bits: 24, via: "10.0.12.2", out: "GigabitEthernet0/1" }], R2: [{ net: "10.1.1.0", bits: 24, via: "10.0.12.1", out: "GigabitEthernet0/1" }] };
const area = (t, r, i) => t.ospfOf(r, i)?.area;
const r2ospf = ["router ospf 1", "network 10.2.2.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0"];

export default [
  lab({
    id: "ospf-network", module: M, title: "OSPF με network statements",
    cmds: ["router ospf", "network <net> <wildcard> area"],
    devices: two([], r2ospf), links, learned,
    intro: "Ο R2 τρέχει ήδη OSPF. Ενεργοποίησε το OSPF στον R1 για τα δύο δίκτυά του.",
    tasks: [
      { text: "Ξεκίνα το OSPF process 1 στον R1.", check: (t) => need(t.dev("R1").ospf[1], "Χρειάζεται router ospf 1.") },
      { text: "Βάλε το 10.1.1.0/24 στην area 0.", check: (t) => need(area(t, "R1", "g0/0") === 0, "Το G0/0 (10.1.1.0/24) δεν είναι στο OSPF area 0. Θέλει network 10.1.1.0 0.0.0.255 area 0 (wildcard, όχι μάσκα!).") },
      { text: "Βάλε το link προς τον R2 (10.0.12.0/30) στην area 0, ώστε να σχηματιστεί γειτονία.", check: (t) => need(t.ospfAdj("R1", "R2"), area(t, "R1", "g0/1") === undefined ? "Το G0/1 δεν είναι στο OSPF: network 10.0.12.0 0.0.0.3 area 0." : "Δεν σχηματίστηκε γειτονία με τον R2.") },
    ],
    solution: { R1: [...EN, "router ospf 1", "network 10.1.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0"] },
    teach: "network <διεύθυνση> <wildcard> area <n>: ενεργοποιεί το OSPF σε κάθε interface του οποίου η IP ταιριάζει. Wildcard = 255.255.255.255 μείον τη μάσκα (/24 -> 0.0.0.255, /30 -> 0.0.0.3). Το process ID είναι τοπικό και δεν χρειάζεται να ταιριάζει με τον γείτονα.",
  }),
  lab({
    id: "ospf-interface", module: M, title: "OSPF ανά interface: ip ospf area",
    cmds: ["ip ospf <pid> area"],
    devices: two([], r2ospf), links, learned,
    intro: "Αντί για network statements, ενεργοποίησε το OSPF απευθείας στα interfaces του R1.",
    tasks: [
      { text: "Φτιάξε το process 1 στον R1 (router ospf 1).", check: (t) => need(t.dev("R1").ospf[1], "Χρειάζεται router ospf 1 (το process πρέπει να υπάρχει).") },
      { text: "Βάλε τα G0/0 και G0/1 στην area 0 με εντολή interface.", check: (t) => need(["g0/0", "g0/1"].every((i) => t.f("R1", i).ospf.pid === 1 && t.f("R1", i).ospf.area === 0), "Στα G0/0 και G0/1 χρειάζεται ip ospf 1 area 0.") },
      { text: "Η γειτονία με τον R2 να είναι FULL.", check: (t) => need(t.ospfAdj("R1", "R2"), "Δεν σχηματίστηκε γειτονία με τον R2.") },
    ],
    solution: { R1: [...EN, "router ospf 1", "interface g0/0", "ip ospf 1 area 0", "interface g0/1", "ip ospf 1 area 0"] },
    teach: "Το ip ospf <pid> area <n> στο interface είναι πιο καθαρό από τα network statements, γιατί ελέγχεις ακριβώς ποια interfaces μπαίνουν.",
  }),
  lab({
    id: "ospf-router-id", module: M, title: "OSPF router-id",
    cmds: ["router-id", "clear ip ospf process", "show ip ospf"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], [...r2ospf]), links, learned,
    intro: "Ο R1 διάλεξε router-id από τις IP του. Το σχέδιο ορίζει router-id 1.1.1.1.",
    tasks: [
      { text: "Όρισε στον R1 router-id 1.1.1.1.", check: (t) => need(t.dev("R1").ospf[1]?.routerId === "1.1.1.1", "Στο router ospf 1 χρειάζεται router-id 1.1.1.1.") },
      { text: "Κάνε το router-id να ισχύσει (το OSPF τρέχει ήδη).", check: (t) => need(t.ran("R1", /^clear ip ospf process$/) || t.ran("R1", /^reload$/), "Όσο το OSPF τρέχει, το νέο router-id ισχύει μετά από clear ip ospf process (απάντησε yes).") },
    ],
    solution: { R1: [...EN, "router ospf 1", "router-id 1.1.1.1", "end", "clear ip ospf process", "yes", "show ip ospf"] },
    teach: "Η σειρά επιλογής του router-id είναι: 1) η εντολή router-id, 2) η μεγαλύτερη IP σε loopback που είναι up, 3) η μεγαλύτερη IP σε φυσικό interface που είναι up. Δύο routers με το ίδιο router-id δεν γίνονται γείτονες.",
  }),
  lab({
    id: "ospf-passive", module: M, title: "passive-interface",
    cmds: ["passive-interface"],
    devices: two(["router ospf 1", "network 10.1.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0"], r2ospf), links, learned,
    intro: "Ο R1 στέλνει OSPF hellos και στο LAN των χρηστών (G0/0), όπου δεν υπάρχει κανένας router.",
    tasks: [{ text: "Σταμάτα τα hellos στο G0/0 του R1, χωρίς να βγάλεις το δίκτυό του από το OSPF.", check: (t) => need(t.passive("R1", 1, "g0/0") && area(t, "R1", "g0/0") === 0 && t.ospfAdj("R1", "R2"), "Χρειάζεται passive-interface g0/0 στο router ospf 1 (η γειτονία μέσω G0/1 πρέπει να μείνει).") }],
    solution: { R1: [...EN, "router ospf 1", "passive-interface g0/0"] },
    teach: "Ένα passive interface διαφημίζεται κανονικά στο OSPF αλλά δεν στέλνει hellos, οπότε κανείς δεν μπορεί να γίνει γείτονας από εκεί. Αυτό είναι ταυτόχρονα και μέτρο ασφαλείας.",
  }),
  lab({
    id: "ospf-passive-default", module: M, title: "passive-interface default",
    cmds: ["passive-interface default", "no passive-interface"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "Ο R1 θα αποκτήσει πολλά LAN interfaces. Ασφαλέστερα: όλα passive, εκτός από τα links προς routers.",
    tasks: [
      { text: "Κάνε όλα τα interfaces του R1 passive από προεπιλογή.", check: (t) => need(t.dev("R1").ospf[1]?.passiveDefault, "Χρειάζεται passive-interface default.") },
      { text: "Άφησε ενεργό (όχι passive) μόνο το G0/1 προς τον R2.", check: (t) => need(!t.passive("R1", 1, "g0/1") && t.passive("R1", 1, "g0/0") && t.ospfAdj("R1", "R2"), "Χρειάζεται no passive-interface g0/1.") },
    ],
    solution: { R1: [...EN, "router ospf 1", "passive-interface default", "no passive-interface g0/1"] },
    teach: "Αν ξεχάσεις το no passive-interface, χάνεις όλες τις γειτονίες, γιατί και τα links προς τους routers γίνονται passive.",
  }),
  lab({
    id: "ospf-cost", module: M, title: "OSPF cost και reference bandwidth",
    cmds: ["auto-cost reference-bandwidth", "ip ospf cost"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "Με το default reference bandwidth (100 Mbps), ένα link 1 Gbps και ένα 100 Mbps έχουν και τα δύο cost 1.",
    tasks: [
      { text: "Στον R1, άλλαξε το reference bandwidth σε 100000 Mbps (100 Gbps).", check: (t) => need(t.dev("R1").ospf[1]?.refBw === 100000, "Χρειάζεται auto-cost reference-bandwidth 100000.") },
      { text: "Στο G0/1 του R1, βάλε cost 50 απευθείας.", check: (t) => need(t.cost("R1", "g0/1") === 50, `Το cost του G0/1 είναι ${t.cost("R1", "g0/1")}. Θέλει ip ospf cost 50.`) },
    ],
    solution: { R1: [...EN, "router ospf 1", "auto-cost reference-bandwidth 100000", "interface g0/1", "ip ospf cost 50"] },
    teach: "cost = reference bandwidth / bandwidth του interface (ελάχιστο 1). Το reference bandwidth πρέπει να είναι ίδιο σε όλους τους routers. Το ip ospf cost υπερισχύει.",
  }),
  lab({
    id: "ospf-dr-priority", module: M, title: "DR/BDR με ip ospf priority",
    cmds: ["ip ospf priority", "show ip ospf neighbor"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "Στο segment ανάμεσα στους R1 και R2, θέλεις ο R1 να είναι πάντα ο DR.",
    tasks: [
      { text: "Βάλε στο G0/1 του R1 OSPF priority 100.", check: (t) => need(t.f("R1", "g0/1").ospf.priority === 100, "Χρειάζεται ip ospf priority 100 στο G0/1.") },
      { text: "Επιβεβαίωσε από τον R2 ότι ο R1 φαίνεται ως DR.", check: (t) => need(t.ran("R2", /^show ip ospf neighbor/), "Τρέξε show ip ospf neighbor στον R2.") },
    ],
    solution: { R1: [...EN, "interface g0/1", "ip ospf priority 100"], R2: ["enable", "show ip ospf neighbor"] },
    teach: "DR = μεγαλύτερη priority (default 1, 0 = ποτέ DR), και σε ισοπαλία το μεγαλύτερο router-id. Η εκλογή δεν είναι preemptive: για να αλλάξει ο DR χρειάζεται clear ip ospf process.",
  }),
  lab({
    id: "ospf-p2p", module: M, title: "ip ospf network point-to-point",
    cmds: ["ip ospf network point-to-point"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "Το link R1-R2 έχει μόνο δύο routers, οπότε δεν χρειάζεται εκλογή DR/BDR.",
    tasks: [{ text: "Κάνε το G0/1 point-to-point για το OSPF και στους δύο routers.", check: (t) => need(t.f("R1", "g0/1").ospf.network === "point-to-point" && t.f("R2", "g0/1").ospf.network === "point-to-point", "Χρειάζεται ip ospf network point-to-point στο G0/1 και των δύο.") }],
    solution: { R1: [...EN, "interface g0/1", "ip ospf network point-to-point"], R2: [...EN, "interface g0/1", "ip ospf network point-to-point"] },
    teach: "Σε point-to-point network type δεν γίνεται εκλογή DR/BDR και η γειτονία ανεβαίνει πιο γρήγορα. Στο show ip ospf neighbor φαίνεται ως FULL/ -.",
  }),
  lab({
    id: "ospf-timers", module: M, title: "Hello και dead timers",
    cmds: ["ip ospf hello-interval", "ip ospf dead-interval"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0", "interface g0/1", "ip ospf hello-interval 5", "ip ospf dead-interval 20"], r2ospf), links, learned,
    intro: "Η γειτονία R1-R2 έπεσε μετά από μια αλλαγή στον R1. Ο R2 έχει τους default timers.",
    tasks: [
      { text: "Βρες τι δεν ταιριάζει, κοιτάζοντας τα OSPF στοιχεία του G0/1 στους δύο routers.", check: (t) => need(t.ran("R1", /^show ip ospf interface/) || t.ran("R2", /^show ip ospf interface/), "Τρέξε show ip ospf interface g0/1.") },
      { text: "Κάνε τη γειτονία να ξανασχηματιστεί, αλλάζοντας τους timers στον R2 ώστε να ταιριάζουν με τον R1 (5/20).", check: (t) => need(t.ospfAdj("R1", "R2") && t.f("R2", "g0/1").ospf.hello === 5, "Οι hello/dead timers πρέπει να είναι ίδιοι στις δύο άκρες (5 και 20 στον R2).") },
    ],
    solution: { R1: ["enable", "show ip ospf interface g0/1"], R2: [...EN, "interface g0/1", "ip ospf hello-interval 5", "ip ospf dead-interval 20"] },
    teach: "Για να γίνουν γείτονες πρέπει να ταιριάζουν: area, subnet και μάσκα, hello και dead timers, authentication, MTU και stub flags. Το router-id πρέπει να είναι μοναδικό.",
  }),
  lab({
    id: "ospf-default-originate", module: M, title: "default-information originate",
    cmds: ["default-information originate"],
    devices: [R("R1", 25, 28, cfg("interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "interface g0/2", "ip address 203.0.113.2 255.255.255.252", "no shutdown", "ip route 0.0.0.0 0.0.0.0 203.0.113.1", "router ospf 1", "network 10.0.12.0 0.0.0.3 area 0")), R("R2", 60, 28, cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "router ospf 1", "network 10.0.12.0 0.0.0.3 area 0")), ISP("ISP", 25, 52)],
    links: [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/2", "ISP", "g0/0"]],
    intro: "Ο R1 έχει default route προς τον ISP, αλλά οι εσωτερικοί routers δεν τη μαθαίνουν.",
    tasks: [{ text: "Κάνε τον R1 να διαφημίζει τη default route του μέσα στο OSPF.", check: (t) => need(t.dev("R1").ospf[1]?.defaultOriginate, "Στο router ospf 1 χρειάζεται default-information originate.") }],
    solution: { R1: [...EN, "router ospf 1", "default-information originate"] },
    teach: "Διαφημίζει 0.0.0.0/0 (O*E2 στους άλλους) μόνο αν ο R1 έχει ο ίδιος default route. Με always τη διαφημίζει πάντα.",
  }),
  lab({
    id: "ospf-verify", module: M, title: "Έλεγχος OSPF: neighbor, interface brief, route",
    cmds: ["show ip ospf neighbor", "show ip ospf interface brief", "show ip route ospf", "show ip protocols"],
    devices: two(["router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"], r2ospf), links, learned,
    intro: "Το OSPF τρέχει. Μάθε τις εντολές ελέγχου που ζητάει συνέχεια η εξέταση.",
    tasks: [
      { text: "Στον R1, δες τους OSPF γείτονες.", check: (t) => need(t.ran("R1", /^show ip ospf neighbor/), "show ip ospf neighbor") },
      { text: "Δες σε ποια interfaces τρέχει το OSPF, με area και cost.", check: (t) => need(t.ran("R1", /^show ip ospf interface brief$/), "show ip ospf interface brief") },
      { text: "Δες μόνο τις routes που μαθεύτηκαν από OSPF.", check: (t) => need(t.ran("R1", /^show ip route ospf$/), "show ip route ospf") },
      { text: "Δες router-id, networks και passive interfaces σε μία εντολή.", check: (t) => need(t.ran("R1", /^show ip protocols$/), "show ip protocols") },
    ],
    solution: { R1: ["enable", "show ip ospf neighbor", "show ip ospf interface brief", "show ip route ospf", "show ip protocols"] },
    teach: "O = intra-area, O IA = inter-area, O E2 = external (π.χ. default-information originate). Το AD του OSPF είναι 110 και το metric είναι cost.",
  }),
  lab({
    id: "sim-ospf", module: M, title: "Sim: OSPF single area σε τρεις routers", kind: "sim",
    cmds: ["router ospf", "router-id", "network", "passive-interface", "ip ospf"],
    devices: [R("R1", 18, 25, cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "interface lo0", "ip address 1.1.1.1 255.255.255.255")), R("R2", 50, 25, cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface g0/2", "ip address 10.0.23.1 255.255.255.252", "no shutdown")), R("R3", 82, 25, cfg("interface g0/0", "ip address 10.3.3.1 255.255.255.0", "no shutdown", "interface g0/2", "ip address 10.0.23.2 255.255.255.252", "no shutdown")), PC("PC1", 18, 52, "10.1.1.10/24", "10.1.1.1"), PC("PC3", 82, 52, "10.3.3.10/24", "10.3.3.1")],
    links: [["R1", "g0/1", "R2", "g0/1"], ["R2", "g0/2", "R3", "g0/2"], ["R1", "g0/0", "PC1", "fa0"], ["R3", "g0/0", "PC3", "fa0"]],
    learned: { R1: [{ net: "10.0.23.0", bits: 30, via: "10.0.12.2", out: "GigabitEthernet0/1" }, { net: "10.3.3.0", bits: 24, via: "10.0.12.2", out: "GigabitEthernet0/1", metric: 3 }] },
    intro: "Τρεις routers σε σειρά. Όλα τα δίκτυα στην area 0, process 10.",
    tasks: [
      { text: "R1, R2, R3: OSPF process 10, όλα τα interfaces τους (και το Lo0 του R1) στην area 0.", check: (t) => need([["R1", ["g0/0", "g0/1", "lo0"]], ["R2", ["g0/1", "g0/2"]], ["R3", ["g0/0", "g0/2"]]].every(([r, ifs]) => ifs.every((i) => t.ospfOf(r, i)?.pid === 10 && t.ospfOf(r, i)?.area === 0)), "Κάποιο interface δεν είναι στο OSPF 10 area 0.") },
      { text: "Router-ids: R1 1.1.1.1, R2 2.2.2.2, R3 3.3.3.3.", check: (t) => need(t.routerId("R1", 10) === "1.1.1.1" && t.routerId("R2", 10) === "2.2.2.2" && t.routerId("R3", 10) === "3.3.3.3", "Τα router-ids δεν είναι σωστά (το R1 μπορεί να πάρει το 1.1.1.1 και από το Lo0).") },
      { text: "Τα LAN interfaces (G0/0 στους R1 και R3) να μη στέλνουν hellos.", check: (t) => need(t.passive("R1", 10, "g0/0") && t.passive("R3", 10, "g0/0"), "Χρειάζεται passive-interface g0/0 στους R1 και R3.") },
      { text: "Γειτονίες FULL: R1-R2 και R2-R3.", check: (t) => need(t.ospfAdj("R1", "R2") && t.ospfAdj("R2", "R3"), "Δεν είναι όλες οι γειτονίες up.") },
    ],
    solution: {
      R1: [...EN, "router ospf 10", "router-id 1.1.1.1", "network 10.1.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0", "network 1.1.1.1 0.0.0.0 area 0", "passive-interface g0/0"],
      R2: [...EN, "router ospf 10", "router-id 2.2.2.2", "network 10.0.12.0 0.0.0.3 area 0", "network 10.0.23.0 0.0.0.3 area 0"],
      R3: [...EN, "router ospf 10", "router-id 3.3.3.3", "network 10.3.3.0 0.0.0.255 area 0", "network 10.0.23.0 0.0.0.3 area 0", "passive-interface g0/0"],
    },
    teach: "Network statement με wildcard 0.0.0.0 ταιριάζει σε μία μόνο IP. Βάλε το router-id πριν τα network statements, για να μη χρειαστεί clear ip ospf process.",
  }),
];
