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
    id: "static-next-hop", module: M, title: "Static route με next hop",
    cmds: ["ip route", "show ip route"],
    devices: line(), links: lineLinks,
    intro: "Ο R1 δεν ξέρει πώς να φτάσει στο LAN του R3 (10.3.3.0/24).",
    tasks: [
      { text: "Στον R1, πρόσθεσε static route για το 10.3.3.0/24 μέσω του R2 (10.0.12.2).", check: (t) => need(has(t, "R1", "10.3.3.0", "255.255.255.0", "10.0.12.2"), "Χρειάζεται ip route 10.3.3.0 255.255.255.0 10.0.12.2.") },
      { text: "Επιβεβαίωσε ότι η route μπήκε στον πίνακα δρομολόγησης (S).", check: (t) => need(t.route("R1", "10.3.3.0", 24, "S") && t.ran("R1", /^show ip route/), "Δες show ip route: πρέπει να φαίνεται S 10.3.3.0/24 [1/0] via 10.0.12.2.") },
    ],
    solution: { R1: [...EN, "ip route 10.3.3.0 255.255.255.0 10.0.12.2", "end", "show ip route"] },
    teach: "ip route <δίκτυο> <μάσκα> <next-hop IP | exit interface> [AD]. Το next hop πρέπει να βρίσκεται σε connected δίκτυο. Ο πίνακας γράφει [AD/metric]: για static [1/0].",
  }),
  lab({
    id: "static-exit-if", module: M, title: "Static route με exit interface",
    cmds: ["ip route <net> <mask> <interface>"],
    devices: [R("R1", 25, 28, cfg("interface s0/0/0", "ip address 172.16.0.1 255.255.255.252", "clock rate 64000", "no shutdown")), R("R2", 75, 28, cfg("interface s0/0/0", "ip address 172.16.0.2 255.255.255.252", "no shutdown", "interface g0/0", "ip address 192.168.2.1 255.255.255.0", "no shutdown"))],
    links: [["R1", "s0/0/0", "R2", "s0/0/0"]],
    intro: "Σε point-to-point serial σύνδεσμο αρκεί να πεις από ποιο interface βγαίνει η κίνηση.",
    tasks: [{ text: "Στον R1, route για το 192.168.2.0/24 με exit interface το Serial0/0/0.", check: (t) => need(t.statics("R1").some((r) => r.net === "192.168.2.0" && r.mask === "255.255.255.0" && r.out === "Serial0/0/0"), "Χρειάζεται ip route 192.168.2.0 255.255.255.0 s0/0/0.") }],
    solution: { R1: [...EN, "ip route 192.168.2.0 255.255.255.0 s0/0/0"] },
    teach: "Με exit interface η route εμφανίζεται ως directly connected. Σε Ethernet (multi-access) θέλει και next hop, αλλιώς ο router κάνει ARP για κάθε προορισμό.",
  }),
  lab({
    id: "default-route", module: M, title: "Default route προς τον ISP",
    cmds: ["ip route 0.0.0.0 0.0.0.0"],
    devices: [R("R1", 30, 30, cfg("interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 203.0.113.2 255.255.255.252", "no shutdown")), ISP("ISP", 75, 30)],
    links: [["R1", "g0/1", "ISP", "g0/0"]],
    intro: "Ό,τι δεν είναι τοπικό πάει στο Internet μέσω του ISP (203.0.113.1).",
    tasks: [
      { text: "Πρόσθεσε default route μέσω 203.0.113.1.", check: (t) => need(has(t, "R1", "0.0.0.0", "0.0.0.0", "203.0.113.1"), "Χρειάζεται ip route 0.0.0.0 0.0.0.0 203.0.113.1.") },
      { text: "Βεβαιώσου ότι ο R1 έχει πλέον Gateway of last resort.", check: (t) => need(t.route("R1", "0.0.0.0", 0) && t.ran("R1", /^show ip route/), "Δες show ip route: Gateway of last resort is 203.0.113.1 και S* 0.0.0.0/0.") },
    ],
    solution: { R1: [...EN, "ip route 0.0.0.0 0.0.0.0 203.0.113.1", "end", "show ip route"] },
    teach: "Το 0.0.0.0/0 ταιριάζει σε όλα αλλά είναι το λιγότερο συγκεκριμένο, οπότε χρησιμοποιείται μόνο αν δεν υπάρχει καλύτερο match (longest prefix match).",
  }),
  lab({
    id: "floating-static", module: M, title: "Floating static route (backup)",
    cmds: ["ip route <net> <mask> <nh> <AD>"],
    devices: [R("R1", 30, 30, cfg("interface g0/1", "ip address 203.0.113.2 255.255.255.252", "no shutdown", "interface g0/2", "ip address 198.51.100.2 255.255.255.252", "no shutdown", "ip route 0.0.0.0 0.0.0.0 203.0.113.1")), ISP("ISP1", 75, 15), ISP("ISP2", 75, 45)],
    links: [["R1", "g0/1", "ISP1", "g0/0"], ["R1", "g0/2", "ISP2", "g0/0"]],
    intro: "Ο R1 βγαίνει στο Internet από τον ISP1. Αν πέσει, πρέπει να χρησιμοποιηθεί ο ISP2 (198.51.100.1).",
    tasks: [{ text: "Πρόσθεσε backup default route μέσω 198.51.100.1, που μπαίνει στον πίνακα μόνο αν χαθεί η κύρια (AD 5).", check: (t) => need(has(t, "R1", "0.0.0.0", "0.0.0.0", "198.51.100.1", 5) && has(t, "R1", "0.0.0.0", "0.0.0.0", "203.0.113.1", 1), "Χρειάζεται ip route 0.0.0.0 0.0.0.0 198.51.100.1 5, και η κύρια να μείνει.") }],
    solution: { R1: [...EN, "ip route 0.0.0.0 0.0.0.0 198.51.100.1 5", "do show ip route"] },
    teach: "Floating static: ίδιος προορισμός με μεγαλύτερο AD από την κύρια, οπότε «επιπλέει» έξω από τον πίνακα μέχρι να χαθεί η κύρια. Για backup σε OSPF (AD 110) θέλει AD πάνω από 110.",
  }),
  lab({
    id: "host-route", module: M, title: "Host route (/32)",
    cmds: ["ip route <ip> 255.255.255.255"],
    devices: line(), links: lineLinks,
    intro: "Μόνο ο server 10.3.3.100 πρέπει να είναι προσβάσιμος από τον R1, όχι όλο το LAN.",
    tasks: [{ text: "Στον R1, route μόνο για τον host 10.3.3.100 μέσω 10.0.12.2.", check: (t) => need(has(t, "R1", "10.3.3.100", "255.255.255.255", "10.0.12.2"), "Χρειάζεται ip route 10.3.3.100 255.255.255.255 10.0.12.2.") }],
    solution: { R1: [...EN, "ip route 10.3.3.100 255.255.255.255 10.0.12.2"] },
    teach: "Η /32 είναι το πιο συγκεκριμένο match που υπάρχει και κερδίζει οποιαδήποτε άλλη route που καλύπτει την ίδια διεύθυνση.",
  }),
  lab({
    id: "summary-route", module: M, title: "Summary static route",
    cmds: ["ip route"],
    devices: [R("R1", 30, 30, cfg("interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown")), R("R2", 70, 30, cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface lo0", "ip address 172.16.0.1 255.255.255.0", "interface lo1", "ip address 172.16.1.1 255.255.255.0", "interface lo2", "ip address 172.16.2.1 255.255.255.0", "interface lo3", "ip address 172.16.3.1 255.255.255.0"))],
    links: [["R1", "g0/1", "R2", "g0/1"]],
    intro: "Πίσω από τον R2 βρίσκονται τα 172.16.0.0/24 έως 172.16.3.0/24. Θέλουμε μία μόνο route στον R1.",
    tasks: [{ text: "Στον R1, μία summary route που καλύπτει ακριβώς τα τέσσερα δίκτυα, μέσω 10.0.12.2.", check: (t) => need(has(t, "R1", "172.16.0.0", "255.255.252.0", "10.0.12.2"), "Τα 172.16.0-3.0 χωράνε σε 172.16.0.0/22: ip route 172.16.0.0 255.255.252.0 10.0.12.2.") }],
    solution: { R1: [...EN, "ip route 172.16.0.0 255.255.252.0 10.0.12.2"] },
    teach: "Για summarization βρίσκεις τα κοινά bits: 0-3 στο τρίτο octet = 000000xx, άρα 6 bits + 16 = /22 = 255.255.252.0.",
  }),
  lab({
    id: "sim-static", module: M, title: "Sim: πλήρης δρομολόγηση με static routes", kind: "sim",
    cmds: ["ip route", "ping", "show ip route"],
    devices: line(), links: lineLinks,
    intro: "Το PC1 (10.1.1.10) και το PC3 (10.3.3.10) πρέπει να επικοινωνούν. Δεν υπάρχει routing protocol, οπότε μόνο static.",
    tasks: [
      { text: "R1: route για το 10.3.3.0/24.", check: (t) => need(has(t, "R1", "10.3.3.0", "255.255.255.0", "10.0.12.2") || has(t, "R1", "0.0.0.0", "0.0.0.0", "10.0.12.2"), "Ο R1 δεν ξέρει το 10.3.3.0/24 (ούτε default μέσω R2).") },
      { text: "R3: route για το 10.1.1.0/24.", check: (t) => need(has(t, "R3", "10.1.1.0", "255.255.255.0", "10.0.23.1") || has(t, "R3", "0.0.0.0", "0.0.0.0", "10.0.23.1"), "Ο R3 δεν ξέρει το 10.1.1.0/24.") },
      { text: "R2: routes για τα δύο LANs (10.1.1.0/24 και 10.3.3.0/24).", check: (t) => need(has(t, "R2", "10.1.1.0", "255.255.255.0", "10.0.12.1") && has(t, "R2", "10.3.3.0", "255.255.255.0", "10.0.23.2"), "Ο R2 χρειάζεται και τις δύο routes. Η επιστροφή της κίνησης θέλει route προς τα πίσω!") },
      { text: "Από τον R1, κάνε ping το 10.3.3.1 για επιβεβαίωση.", check: (t) => need(t.ran("R1", /^ping 10\.3\.3\.1/), "Τρέξε ping 10.3.3.1 από τον R1.") },
    ],
    solution: {
      R1: [...EN, "ip route 10.3.3.0 255.255.255.0 10.0.12.2", "end", "ping 10.3.3.1"],
      R2: [...EN, "ip route 10.1.1.0 255.255.255.0 10.0.12.1", "ip route 10.3.3.0 255.255.255.0 10.0.23.2"],
      R3: [...EN, "ip route 10.1.1.0 255.255.255.0 10.0.23.1"],
    },
    teach: "Η πιο συχνή παγίδα: η κίνηση πηγαίνει αλλά δεν επιστρέφει. Κάθε router στη διαδρομή πρέπει να ξέρει και τα δύο άκρα.",
  }),
];
