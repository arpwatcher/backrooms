import { lab, R, PC, cfg, EN, need } from "./kit.js";
import { expandIpv6 } from "../engine/ip.js";

const M = "ipv6";
const has6 = (t, d, i, addr, bits) => t.f(d, i).ipv6.some((a) => a.addr === expandIpv6(addr) && a.bits === bits);
const r6 = (t, d, pfx, bits) => t.dev(d).ipv6Routes.find((r) => r.addr === expandIpv6(pfx) && r.bits === bits);
const pair = (a = [], b = []) => [
  R("R1", 25, 28, cfg("interface g0/0", "no shutdown", "interface g0/1", "no shutdown", ...a)),
  R("R2", 75, 28, cfg("interface g0/0", "no shutdown", "interface g0/1", "no shutdown", ...b)),
  PC("PC1", 10, 58), PC("PC2", 90, 58),
];
const pairLinks = [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"], ["R2", "g0/0", "PC2", "fa0"]];
const addressed = [
  ["ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:1::1/64", "interface g0/1", "ipv6 address 2001:db8:12::1/64"],
  ["ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:2::1/64", "interface g0/1", "ipv6 address 2001:db8:12::2/64"],
];

export default [
  lab({
    id: "ipv6-address", module: M, title: "IPv6 global unicast address",
    cmds: ["ipv6 address", "show ipv6 interface brief"],
    devices: pair(), links: pairLinks,
    intro: "Το δίκτυο περνάει σε dual stack. Ξεκίνα από τον R1.",
    tasks: [
      { text: "G0/0 του R1: 2001:db8:1::1/64.", check: (t) => need(has6(t, "R1", "g0/0", "2001:db8:1::1", 64), "Χρειάζεται ipv6 address 2001:db8:1::1/64 στο G0/0.") },
      { text: "G0/1 του R1: 2001:db8:12::1/64.", check: (t) => need(has6(t, "R1", "g0/1", "2001:db8:12::1", 64), "Χρειάζεται ipv6 address 2001:db8:12::1/64 στο G0/1.") },
      { text: "Δες τις διευθύνσεις με show ipv6 interface brief.", check: (t) => need(t.ran("R1", /^show ipv6 interface brief$/), "show ipv6 interface brief") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ipv6 address 2001:db8:1::1/64", "interface g0/1", "ipv6 address 2001:db8:12::1/64", "end", "show ipv6 interface brief"] },
    teach: "Στο IPv6 το prefix γράφεται με /, χωρίς μάσκα. Μόλις μπει μια global διεύθυνση, το interface φτιάχνει αυτόματα και link-local (FE80::/10) με EUI-64.",
  }),
  lab({
    id: "ipv6-unicast-routing", module: M, title: "ipv6 unicast-routing",
    cmds: ["ipv6 unicast-routing"],
    devices: pair(["interface g0/0", "ipv6 address 2001:db8:1::1/64"]), links: pairLinks,
    intro: "Τα PCs του LAN δεν παίρνουν διεύθυνση με SLAAC και ο R1 δεν προωθεί IPv6 πακέτα.",
    tasks: [{ text: "Ενεργοποίησε την IPv6 δρομολόγηση στον R1.", check: (t) => need(t.dev("R1").ipv6Routing, "Χρειάζεται ipv6 unicast-routing (global config).") }],
    solution: { R1: [...EN, "ipv6 unicast-routing"] },
    teach: "Χωρίς ipv6 unicast-routing ο router δεν προωθεί IPv6 και δεν στέλνει Router Advertisements, άρα δεν δουλεύει ούτε το SLAAC. Το IPv4 routing είναι ενεργό από προεπιλογή, το IPv6 όχι.",
  }),
  lab({
    id: "ipv6-eui64", module: M, title: "EUI-64",
    cmds: ["ipv6 address eui-64", "show ipv6 interface brief"],
    devices: pair(), links: pairLinks,
    intro: "Το interface ID να βγαίνει αυτόματα από την MAC.",
    tasks: [
      { text: "G0/0 του R1: prefix 2001:db8:1::/64 με EUI-64.", check: (t) => need(t.f("R1", "g0/0").ipv6.some((a) => a.eui && a.bits === 64 && a.addr.startsWith("2001:0db8:0001:0000:")), "Χρειάζεται ipv6 address 2001:db8:1::/64 eui-64.") },
      { text: "Δες ποια διεύθυνση προέκυψε.", check: (t) => need(t.ran("R1", /^show ipv6 interface/), "show ipv6 interface brief") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ipv6 address 2001:db8:1::/64 eui-64", "end", "show ipv6 interface brief"] },
    teach: "Το EUI-64 κόβει την MAC (48 bits) στη μέση, βάζει FFFE ανάμεσα και αντιστρέφει το 7ο bit. Π.χ. η MAC 0050.7966.6800 δίνει το interface ID 0250:79FF:FE66:6800.",
  }),
  lab({
    id: "ipv6-link-local", module: M, title: "Χειροκίνητη link-local",
    cmds: ["ipv6 address link-local"],
    devices: pair(), links: pairLinks,
    intro: "Για να διαβάζεις εύκολα τα next hops, όρισε μια απλή link-local.",
    tasks: [{ text: "Όρισε FE80::1 ως link-local στα G0/0 και G0/1 του R1.", check: (t) => need(["g0/0", "g0/1"].every((i) => t.f("R1", i).ipv6LinkLocal === expandIpv6("fe80::1")), "Χρειάζεται ipv6 address fe80::1 link-local και στα δύο interfaces.") }],
    solution: { R1: [...EN, "interface g0/0", "ipv6 address fe80::1 link-local", "interface g0/1", "ipv6 address fe80::1 link-local"] },
    teach: "Η link-local χρειάζεται να είναι μοναδική μόνο μέσα στο ίδιο link, οπότε το FE80::1 μπορεί να υπάρχει σε κάθε interface. Δεν δρομολογείται ποτέ.",
  }),
  lab({
    id: "ipv6-slaac-client", module: M, title: "Router ως SLAAC client",
    cmds: ["ipv6 address autoconfig", "ipv6 enable"],
    devices: [R("R1", 30, 30, cfg("interface g0/1", "no shutdown")), PC("ISP", 75, 30)],
    links: [["R1", "g0/1", "ISP", "fa0"]],
    intro: "Ο ISP δίνει IPv6 prefix με Router Advertisements.",
    tasks: [{ text: "Κάνε το G0/1 να φτιάχνει μόνο του διεύθυνση με SLAAC.", check: (t) => need(t.f("R1", "g0/1").ipv6Auto, "Χρειάζεται ipv6 address autoconfig.") }],
    solution: { R1: [...EN, "interface g0/1", "ipv6 address autoconfig"] },
    teach: "SLAAC: ο host στέλνει RS, ο router απαντά με RA που περιέχει το prefix, και ο host φτιάχνει το interface ID μόνος του (EUI-64 ή τυχαίο). Το ipv6 enable φτιάχνει μόνο link-local.",
  }),
  lab({
    id: "ipv6-static", module: M, title: "IPv6 static route",
    cmds: ["ipv6 route", "show ipv6 route"],
    devices: pair(addressed[0], addressed[1]), links: pairLinks,
    intro: "Ο R1 πρέπει να φτάνει στο LAN του R2 (2001:db8:2::/64).",
    tasks: [
      { text: "Static route προς 2001:db8:2::/64 μέσω 2001:db8:12::2.", check: (t) => { const r = r6(t, "R1", "2001:db8:2::", 64); return need(r && r.via === expandIpv6("2001:db8:12::2"), "Χρειάζεται ipv6 route 2001:db8:2::/64 2001:db8:12::2."); } },
      { text: "Δες τον IPv6 πίνακα δρομολόγησης.", check: (t) => need(t.ran("R1", /^show ipv6 route/), "show ipv6 route") },
    ],
    solution: { R1: [...EN, "ipv6 route 2001:db8:2::/64 2001:db8:12::2", "end", "show ipv6 route"] },
    teach: "Αν το next hop είναι link-local (FE80::...), πρέπει να δώσεις και το exit interface: ipv6 route 2001:db8:2::/64 g0/1 fe80::2.",
  }),
  lab({
    id: "ipv6-default", module: M, title: "IPv6 default route",
    cmds: ["ipv6 route ::/0"],
    devices: pair(addressed[0], addressed[1]), links: pairLinks,
    intro: "Ο R2 είναι stub router: όλα τα άγνωστα δίκτυα πάνε στον R1.",
    tasks: [{ text: "Default route στον R2 με exit interface G0/1 και next hop τη link-local FE80::1.", check: (t) => { const r = r6(t, "R2", "::", 0); return need(r && r.out === "GigabitEthernet0/1" && r.via === expandIpv6("fe80::1"), r ? "Η default υπάρχει, αλλά χωρίς g0/1 και fe80::1." : "Χρειάζεται ipv6 route ::/0 g0/1 fe80::1."); } }],
    solution: { R2: [...EN, "ipv6 route ::/0 g0/1 fe80::1"], R1: [...EN, "interface g0/1", "ipv6 address fe80::1 link-local"] },
    teach: "Το ::/0 είναι η IPv6 default route, το αντίστοιχο του 0.0.0.0/0.",
  }),
  lab({
    id: "sim-ipv6", module: M, title: "Sim: IPv6 end to end", kind: "sim",
    cmds: ["ipv6 unicast-routing", "ipv6 address", "ipv6 route"],
    devices: pair(), links: pairLinks,
    intro: "Στήσε IPv6 ανάμεσα στα δύο LANs με static routes.",
    tasks: [
      { text: "IPv6 routing και στους δύο routers.", check: (t) => need(t.dev("R1").ipv6Routing && t.dev("R2").ipv6Routing, "Λείπει ipv6 unicast-routing κάπου.") },
      { text: "R1: G0/0 2001:db8:1::1/64, G0/1 2001:db8:12::1/64.", check: (t) => need(has6(t, "R1", "g0/0", "2001:db8:1::1", 64) && has6(t, "R1", "g0/1", "2001:db8:12::1", 64), "Οι διευθύνσεις του R1 δεν είναι σωστές.") },
      { text: "R2: G0/0 2001:db8:2::1/64, G0/1 2001:db8:12::2/64.", check: (t) => need(has6(t, "R2", "g0/0", "2001:db8:2::1", 64) && has6(t, "R2", "g0/1", "2001:db8:12::2", 64), "Οι διευθύνσεις του R2 δεν είναι σωστές.") },
      { text: "R1: route προς 2001:db8:2::/64. R2: default route προς τον R1 (2001:db8:12::1).", check: (t) => need(r6(t, "R1", "2001:db8:2::", 64)?.via === expandIpv6("2001:db8:12::2") && r6(t, "R2", "::", 0)?.via === expandIpv6("2001:db8:12::1"), "Λείπει ή είναι λάθος κάποιο ipv6 route.") },
    ],
    solution: {
      R1: [...EN, "ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:1::1/64", "interface g0/1", "ipv6 address 2001:db8:12::1/64", "exit", "ipv6 route 2001:db8:2::/64 2001:db8:12::2"],
      R2: [...EN, "ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:2::1/64", "interface g0/1", "ipv6 address 2001:db8:12::2/64", "exit", "ipv6 route ::/0 2001:db8:12::1"],
    },
    teach: "Τύποι διευθύνσεων: global unicast 2000::/3, unique local FC00::/7, link-local FE80::/10, multicast FF00::/8 (FF02::1 όλοι οι κόμβοι, FF02::2 όλοι οι routers).",
  }),
];
