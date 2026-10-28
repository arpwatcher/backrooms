import { lab, R, PC, SRV, ISP, cfg, EN, need } from "./kit.js";

const M = "nat";
const edge = (extra = []) => R("R1", 50, 25, cfg("interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 203.0.113.2 255.255.255.248", "no shutdown", "ip route 0.0.0.0 0.0.0.0 203.0.113.1", ...extra));
const topo = (extra) => [edge(extra), PC("PC1", 18, 52, "192.168.1.10/24", "192.168.1.1"), SRV("WEB", 50, 55, "192.168.1.100/24", "192.168.1.1"), ISP("Internet", 85, 25)];
const links = [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "Internet", "g0/0"]];
const sides = (t) => t.f("R1", "g0/0").nat === "inside" && t.f("R1", "g0/1").nat === "outside";
const sidesMsg = "Το G0/0 θέλει ip nat inside και το G0/1 ip nat outside.";

export default [
  lab({
    id: "nat-inside-outside", module: M, title: "ip nat inside / outside",
    cmds: ["ip nat inside", "ip nat outside"],
    devices: topo(), links,
    intro: "Πριν από κάθε NAT, ο router πρέπει να ξέρει ποια interfaces είναι μέσα και ποια έξω.",
    tasks: [
      { text: "Όρισε το G0/0 (LAN) ως inside.", check: (t) => need(t.f("R1", "g0/0").nat === "inside", "Χρειάζεται ip nat inside στο G0/0.") },
      { text: "Όρισε το G0/1 (Internet) ως outside.", check: (t) => need(t.f("R1", "g0/1").nat === "outside", "Χρειάζεται ip nat outside στο G0/1.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"] },
    teach: "Inside local = η ιδιωτική IP του host. Inside global = η δημόσια IP που τον αντιπροσωπεύει. Outside local/global = ο απομακρυσμένος host (συνήθως ίδιες).",
  }),
  lab({
    id: "static-nat", module: M, title: "Static NAT για server",
    cmds: ["ip nat inside source static"],
    devices: topo(["interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"]), links: [...links, ["R1", "g0/2", "WEB", "fa0"]],
    intro: "Ο web server 192.168.1.100 πρέπει να είναι προσβάσιμος από το Internet ως 203.0.113.5.",
    tasks: [{ text: "Αντιστοίχισε μόνιμα το 192.168.1.100 στο 203.0.113.5.", check: (t) => need(t.dev("R1").nat.statics.some((s) => s.local === "192.168.1.100" && s.global === "203.0.113.5" && !s.proto), "Χρειάζεται ip nat inside source static 192.168.1.100 203.0.113.5.") }],
    solution: { R1: [...EN, "ip nat inside source static 192.168.1.100 203.0.113.5", "end", "show ip nat translations"] },
    teach: "Το static NAT είναι μόνιμη αντιστοίχιση ένα προς ένα και δουλεύει και για συνδέσεις που ξεκινούν απ' έξω. Φαίνεται αμέσως στο show ip nat translations.",
  }),
  lab({
    id: "dynamic-nat", module: M, title: "Dynamic NAT με pool",
    cmds: ["ip nat pool", "access-list", "ip nat inside source list pool"],
    devices: topo(["interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"]), links,
    intro: "Ο ISP έδωσε τις δημόσιες 203.0.113.3 έως 203.0.113.6. Οι χρήστες του 192.168.1.0/24 να τις χρησιμοποιούν δυναμικά.",
    tasks: [
      { text: "ACL 1 που ταιριάζει στο 192.168.1.0/24.", check: (t) => { const a = t.acl("R1", 1); return need(a?.entries.some((e) => e.action === "permit" && e.src.net === "192.168.1.0" && e.src.wild === "0.0.0.255"), "Χρειάζεται access-list 1 permit 192.168.1.0 0.0.0.255."); } },
      { text: "Pool PUBLIC με τις 203.0.113.3 - 203.0.113.6, μάσκα /29.", check: (t) => { const p = t.dev("R1").nat.pools.PUBLIC; return need(p?.start === "203.0.113.3" && p.end === "203.0.113.6" && p.mask === "255.255.255.248", "Χρειάζεται ip nat pool PUBLIC 203.0.113.3 203.0.113.6 netmask 255.255.255.248."); } },
      { text: "Σύνδεσε την ACL 1 με το pool (χωρίς overload).", check: (t) => need(t.dev("R1").nat.dynamic.some((d) => d.acl === "1" && d.pool === "PUBLIC" && !d.overload), "Χρειάζεται ip nat inside source list 1 pool PUBLIC.") },
    ],
    solution: { R1: [...EN, "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat pool PUBLIC 203.0.113.3 203.0.113.6 netmask 255.255.255.248", "ip nat inside source list 1 pool PUBLIC"] },
    teach: "Χωρίς overload κάθε εσωτερικός host παίρνει μία δημόσια IP όσο είναι ενεργός. Με 4 διευθύνσεις, ο πέμπτος χρήστης περιμένει μέχρι να ελευθερωθεί κάποια.",
  }),
  lab({
    id: "pat", module: M, title: "PAT (NAT overload) στο outside interface",
    cmds: ["ip nat inside source list interface overload"],
    devices: topo(), links,
    intro: "Όλο το LAN βγαίνει στο Internet με τη μία δημόσια IP του G0/1.",
    tasks: [
      { text: "Inside και outside interfaces.", check: (t) => need(sides(t), sidesMsg) },
      { text: "ACL 1 για το 192.168.1.0/24.", check: (t) => need(t.acl("R1", 1)?.entries.some((e) => e.action === "permit" && e.src.net === "192.168.1.0" && e.src.wild === "0.0.0.255"), "Χρειάζεται access-list 1 permit 192.168.1.0 0.0.0.255.") },
      { text: "PAT με τη διεύθυνση του G0/1.", check: (t) => need(t.dev("R1").nat.dynamic.some((d) => d.acl === "1" && d.out === "GigabitEthernet0/1" && d.overload), "Χρειάζεται ip nat inside source list 1 interface g0/1 overload.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "exit", "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat inside source list 1 interface g0/1 overload"] },
    teach: "Το PAT ξεχωρίζει τις συνδέσεις με βάση την πόρτα, οπότε χιλιάδες hosts χωράνε σε μία IP. Είναι το NAT που έχει κάθε οικιακός router.",
  }),
  lab({
    id: "port-forward", module: M, title: "Static PAT (port forwarding)",
    cmds: ["ip nat inside source static tcp"],
    devices: topo(["interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside"]), links,
    intro: "Μόνο το HTTP (TCP 80) της δημόσιας 203.0.113.2 πρέπει να φτάνει στον server 192.168.1.100.",
    tasks: [{ text: "Προώθησε το TCP 80 της 203.0.113.2 στο 192.168.1.100 port 80.", check: (t) => need(t.dev("R1").nat.statics.some((s) => s.proto === "tcp" && s.local === "192.168.1.100" && s.lport === 80 && s.global === "203.0.113.2" && s.gport === 80), "Χρειάζεται ip nat inside source static tcp 192.168.1.100 80 203.0.113.2 80.") }],
    solution: { R1: [...EN, "ip nat inside source static tcp 192.168.1.100 80 203.0.113.2 80"] },
    teach: "Η σειρά στην εντολή είναι: πρωτόκολλο, inside local IP και port, μετά inside global IP και port.",
  }),
  lab({
    id: "sim-nat", module: M, title: "Sim: PAT και static NAT μαζί", kind: "sim",
    cmds: ["ip nat inside", "ip nat outside", "access-list", "ip nat inside source list", "ip nat inside source static", "show ip nat translations"],
    devices: [edge(), PC("PC1", 18, 52, "192.168.1.10/24", "192.168.1.1"), SRV("WEB", 50, 55, "192.168.1.100/24", "192.168.1.1"), ISP("Internet", 85, 25)],
    links: [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "Internet", "g0/0"]],
    intro: "Οι χρήστες βγαίνουν με PAT στη διεύθυνση του G0/1. Ο server WEB φαίνεται ως 203.0.113.4.",
    tasks: [
      { text: "Inside: G0/0. Outside: G0/1.", check: (t) => need(sides(t), sidesMsg) },
      { text: "Static NAT: 192.168.1.100 ως 203.0.113.4.", check: (t) => need(t.dev("R1").nat.statics.some((s) => s.local === "192.168.1.100" && s.global === "203.0.113.4"), "Λείπει το static NAT του server.") },
      { text: "Named ACL NAT-USERS (standard) που επιτρέπει το 192.168.1.0/24.", check: (t) => { const a = t.acl("R1", "NAT-USERS"); return need(a?.type === "standard" && a.entries.some((e) => e.action === "permit" && e.src.net === "192.168.1.0" && e.src.wild === "0.0.0.255"), "Χρειάζεται ip access-list standard NAT-USERS με permit 192.168.1.0 0.0.0.255."); } },
      { text: "PAT για την NAT-USERS στη διεύθυνση του G0/1.", check: (t) => need(t.dev("R1").nat.dynamic.some((d) => d.acl === "NAT-USERS" && d.out === "GigabitEthernet0/1" && d.overload), "Χρειάζεται ip nat inside source list NAT-USERS interface g0/1 overload.") },
      { text: "Δες τον πίνακα των NAT translations.", check: (t) => need(t.ran("R1", /^show ip nat translations/), "show ip nat translations") },
    ],
    solution: { R1: [...EN, "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "exit", "ip nat inside source static 192.168.1.100 203.0.113.4", "ip access-list standard NAT-USERS", "permit 192.168.1.0 0.0.0.255", "exit", "ip nat inside source list NAT-USERS interface g0/1 overload", "end", "show ip nat translations"] },
    teach: "Στην εξέταση έρχεται συχνά: «PCs can't reach the Internet». Οι πιθανές αιτίες είναι inside/outside ανάποδα, ACL με λάθος wildcard ή ξεχασμένο overload.",
  }),
];
