import { lab, R, PC, SRV, cfg, EN, need } from "./kit.js";

const M = "acl";
const same = (a, b) => (b.any ? a?.any : b.host ? a?.host === b.host : a?.net === b.net && a?.wild === b.wild);
// does this ACL contain an entry like `want` (only the given fields are compared)
const has = (acl, want) => Boolean(acl?.entries.some((e) =>
  e.action === want.action && (!want.src || same(e.src, want.src)) && (!want.dst || same(e.dst, want.dst)) &&
  (!want.proto || e.proto === want.proto) && (!want.port || (e.dstPort?.op === "eq" && e.dstPort.port === want.port)) &&
  (!want.established || e.established)));
const index = (acl, want) => acl?.entries.findIndex((e) => has({ entries: [e] }, want)) ?? -1;

// R1 between two LANs and a server LAN
const three = (extra = []) => [
  R("R1", 50, 22, cfg("interface g0/0", "ip address 192.168.10.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.1 255.255.255.0", "no shutdown", "interface g0/2", "ip address 172.16.1.1 255.255.255.0", "no shutdown", ...extra)),
  PC("PC10", 18, 52, "192.168.10.10/24", "192.168.10.1"), PC("PC20", 50, 55, "192.168.20.10/24", "192.168.20.1"), SRV("SRV", 82, 52, "172.16.1.100/24", "172.16.1.1"),
];
const threeLinks = [["R1", "g0/0", "PC10", "fa0"], ["R1", "g0/1", "PC20", "fa0"], ["R1", "g0/2", "SRV", "fa0"]];

export default [
  lab({
    id: "acl-standard", module: M, title: "Standard numbered ACL",
    cmds: ["access-list", "ip access-group"],
    devices: three(), links: threeLinks,
    intro: "Το LAN 192.168.20.0/24 δεν πρέπει να φτάνει στο δίκτυο των servers (172.16.1.0/24). Όλα τα άλλα επιτρέπονται.",
    tasks: [
      { text: "ACL 10: deny 192.168.20.0/24 και μετά permit any.", check: (t) => { const a = t.acl("R1", 10); const d = index(a, { action: "deny", src: { net: "192.168.20.0", wild: "0.0.0.255" } }); const p = index(a, { action: "permit", src: { any: true } }); return need(d >= 0 && p > d, d < 0 ? "Λείπει το access-list 10 deny 192.168.20.0 0.0.0.255." : p < 0 ? "Χωρίς permit any, το implicit deny κόβει όλα τα άλλα." : "Το permit any είναι πριν το deny, οπότε το deny δεν θα ταιριάξει ποτέ."); } },
      { text: "Εφάρμοσε την ACL εκεί που πρέπει για standard ACL.", check: (t) => need(t.f("R1", "g0/2").aclOut === "10", t.f("R1", "g0/1").aclIn === "10" ? "Standard ACL κοντά στην πηγή (G0/1 in) κόβει το LAN 20 από παντού. Βάλ' τη κοντά στον προορισμό: G0/2 out." : "Χρειάζεται ip access-group 10 out στο G0/2.") },
    ],
    solution: { R1: [...EN, "access-list 10 deny 192.168.20.0 0.0.0.255", "access-list 10 permit any", "interface g0/2", "ip access-group 10 out"] },
    teach: "Η standard ACL ελέγχει μόνο τη source IP, γι' αυτό μπαίνει όσο πιο κοντά στον προορισμό γίνεται. Στο τέλος κάθε ACL υπάρχει ένα αόρατο deny any.",
  }),
  lab({
    id: "acl-host", module: M, title: "Standard ACL: host και wildcard",
    cmds: ["access-list host", "access-list wildcard"],
    devices: three(), links: threeLinks,
    intro: "Μόνο ο διαχειριστής 192.168.10.10 και το subnet 192.168.20.0/25 να φτάνουν στους servers.",
    tasks: [
      { text: "ACL 20: permit μόνο τον host 192.168.10.10.", check: (t) => need(has(t.acl("R1", 20), { action: "permit", src: { host: "192.168.10.10" } }), "Χρειάζεται access-list 20 permit host 192.168.10.10 (ή 192.168.10.10 0.0.0.0).") },
      { text: "ACL 20: permit το 192.168.20.0/25.", check: (t) => need(has(t.acl("R1", 20), { action: "permit", src: { net: "192.168.20.0", wild: "0.0.0.127" } }), "Για /25 η wildcard είναι 0.0.0.127.") },
      { text: "Εφάρμοσέ την outbound στο G0/2.", check: (t) => need(t.f("R1", "g0/2").aclOut === "20", "Χρειάζεται ip access-group 20 out στο G0/2.") },
    ],
    solution: { R1: [...EN, "access-list 20 permit host 192.168.10.10", "access-list 20 permit 192.168.20.0 0.0.0.127", "interface g0/2", "ip access-group 20 out"] },
    teach: "Wildcard = 255.255.255.255 μείον τη μάσκα: /25 δίνει 0.0.0.127, /30 δίνει 0.0.0.3. Το host X είναι το ίδιο με X 0.0.0.0, και το any με 0.0.0.0 255.255.255.255.",
  }),
  lab({
    id: "acl-extended", module: M, title: "Extended ACL: μόνο web προς τον server",
    cmds: ["access-list 100", "eq www"],
    devices: three(), links: threeLinks,
    intro: "Το LAN 192.168.10.0/24 να βλέπει μόνο HTTP και HTTPS στον server 172.16.1.100. Όλη η υπόλοιπη κίνηση του LAN προς οπουδήποτε επιτρέπεται.",
    tasks: [
      { text: "ACL 100: permit tcp από 192.168.10.0/24 προς host 172.16.1.100 eq 80.", check: (t) => need(has(t.acl("R1", 100), { action: "permit", proto: "tcp", src: { net: "192.168.10.0", wild: "0.0.0.255" }, dst: { host: "172.16.1.100" }, port: 80 }), "Λείπει το permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq www.") },
      { text: "Το ίδιο για port 443.", check: (t) => need(has(t.acl("R1", 100), { action: "permit", proto: "tcp", src: { net: "192.168.10.0", wild: "0.0.0.255" }, dst: { host: "172.16.1.100" }, port: 443 }), "Λείπει το ... eq 443.") },
      { text: "Κόψε όλα τα υπόλοιπα από το LAN προς τον server, και επέτρεψε κάθε άλλη κίνηση.", check: (t) => { const a = t.acl("R1", 100); const d = index(a, { action: "deny", proto: "ip", dst: { host: "172.16.1.100" } }); const p = index(a, { action: "permit", proto: "ip", src: { any: true }, dst: { any: true } }); return need(d >= 0 && p > d, d < 0 ? "Λείπει deny ip ... host 172.16.1.100." : "Λείπει (ή είναι σε λάθος σειρά) το permit ip any any στο τέλος."); } },
      { text: "Εφάρμοσέ την κοντά στην πηγή.", check: (t) => need(t.f("R1", "g0/0").aclIn === "100", "Η extended ACL μπαίνει κοντά στην πηγή: ip access-group 100 in στο G0/0.") },
    ],
    solution: { R1: [...EN, "access-list 100 permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq www", "access-list 100 permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq 443", "access-list 100 deny ip 192.168.10.0 0.0.0.255 host 172.16.1.100", "access-list 100 permit ip any any", "interface g0/0", "ip access-group 100 in"] },
    teach: "Η σύνταξη είναι access-list 100-199 permit|deny πρωτόκολλο, μετά source με wildcard και [port], μετά destination με wildcard και [port]. Η extended ACL μπαίνει κοντά στην πηγή, ώστε η κίνηση να μην ταξιδεύει άσκοπα στο δίκτυο.",
  }),
  lab({
    id: "acl-named-std", module: M, title: "Named standard ACL",
    cmds: ["ip access-list standard"],
    devices: three(), links: threeLinks,
    intro: "Η εταιρεία θέλει ονόματα στις ACLs για να διαβάζονται εύκολα.",
    tasks: [
      { text: "Named standard ACL BLOCK-LAN20: deny 192.168.20.0/24, permit any.", check: (t) => { const a = t.acl("R1", "BLOCK-LAN20"); return need(a?.type === "standard" && has(a, { action: "deny", src: { net: "192.168.20.0", wild: "0.0.0.255" } }) && has(a, { action: "permit", src: { any: true } }), "Χρειάζεται ip access-list standard BLOCK-LAN20 με deny 192.168.20.0 0.0.0.255 και permit any."); } },
      { text: "Εφάρμοσέ την outbound στο G0/2.", check: (t) => need(t.f("R1", "g0/2").aclOut === "BLOCK-LAN20", "Χρειάζεται ip access-group BLOCK-LAN20 out στο G0/2.") },
    ],
    solution: { R1: [...EN, "ip access-list standard BLOCK-LAN20", "deny 192.168.20.0 0.0.0.255", "permit any", "exit", "interface g0/2", "ip access-group BLOCK-LAN20 out"] },
    teach: "Το ip access-list standard|extended <όνομα> σε βάζει στο (config-std-nacl)#. Εκεί γράφεις τις εντολές χωρίς το «access-list <n>» μπροστά.",
  }),
  lab({
    id: "acl-named-ext", module: M, title: "Named extended ACL",
    cmds: ["ip access-list extended"],
    devices: three(), links: threeLinks,
    intro: "Το LAN 192.168.20.0/24 να μη μπορεί να κάνει telnet πουθενά. Όλα τα άλλα επιτρέπονται.",
    tasks: [
      { text: "Named extended ACL NO-TELNET: deny tcp από 192.168.20.0/24 προς any eq 23, και permit ip any any.", check: (t) => { const a = t.acl("R1", "NO-TELNET"); const d = index(a, { action: "deny", proto: "tcp", src: { net: "192.168.20.0", wild: "0.0.0.255" }, dst: { any: true }, port: 23 }); return need(a?.type === "extended" && d >= 0 && index(a, { action: "permit", proto: "ip", src: { any: true }, dst: { any: true } }) > d, "Χρειάζεται deny tcp 192.168.20.0 0.0.0.255 any eq telnet και μετά permit ip any any."); } },
      { text: "Εφάρμοσέ την inbound στο G0/1.", check: (t) => need(t.f("R1", "g0/1").aclIn === "NO-TELNET", "Χρειάζεται ip access-group NO-TELNET in στο G0/1.") },
    ],
    solution: { R1: [...EN, "ip access-list extended NO-TELNET", "deny tcp 192.168.20.0 0.0.0.255 any eq telnet", "permit ip any any", "interface g0/1", "ip access-group NO-TELNET in"] },
    teach: "Θυμήσου τα ports: telnet 23, ssh 22, http 80, https 443, dns 53 (udp/tcp), dhcp 67/68 (udp), tftp 69 (udp), snmp 161 (udp), syslog 514 (udp), ntp 123 (udp).",
  }),
  lab({
    id: "acl-seq-edit", module: M, title: "Επεξεργασία ACL με sequence numbers",
    cmds: ["ip access-list", "no <seq>", "<seq> deny"],
    devices: three(["ip access-list standard SERVERS", "permit 192.168.10.0 0.0.0.255", "permit 192.168.20.0 0.0.0.255", "exit", "interface g0/2", "ip access-group SERVERS out"]), links: threeLinks,
    intro: "Η ACL SERVERS έχει τα 10 permit 192.168.10.0/24 και 20 permit 192.168.20.0/24. Πρέπει να μπλοκαριστεί ο host 192.168.10.66 χωρίς να ξαναγραφτεί όλη η ACL.",
    tasks: [
      { text: "Πρόσθεσε deny host 192.168.10.66 με sequence 5, ώστε να ελέγχεται πρώτο.", check: (t) => { const a = t.acl("R1", "SERVERS"); return need(a?.entries[0]?.seq === 5 && has({ entries: [a.entries[0]] }, { action: "deny", src: { host: "192.168.10.66" } }), "Μέσα στο ip access-list standard SERVERS: 5 deny host 192.168.10.66."); } },
      { text: "Σβήσε την εγγραφή 20.", check: (t) => need(t.acl("R1", "SERVERS") && !t.acl("R1", "SERVERS").entries.some((e) => e.seq === 20), "Μέσα στην ACL: no 20.") },
      { text: "Επιβεβαίωσε με show access-lists.", check: (t) => need(t.ran("R1", /^show (ip )?access-lists/), "show access-lists") },
    ],
    solution: { R1: [...EN, "ip access-list standard SERVERS", "5 deny host 192.168.10.66", "no 20", "end", "show access-lists"] },
    teach: "Οι ACLs ελέγχονται από πάνω προς τα κάτω και σταματούν στο πρώτο ταίριασμα. Μια νέα γραμμή χωρίς αριθμό μπαίνει στο τέλος (+10). Αν θες να μπει νωρίτερα, δώσε της μικρότερο sequence.",
  }),
  lab({
    id: "acl-vty", module: M, title: "access-class: ποιος κάνει SSH",
    cmds: ["access-list", "line vty", "access-class"],
    devices: three(), links: threeLinks,
    intro: "Μόνο ο διαχειριστής 192.168.10.10 να μπορεί να κάνει remote login στον R1.",
    tasks: [
      { text: "ACL 5 που επιτρέπει μόνο τον host 192.168.10.10.", check: (t) => need(has(t.acl("R1", 5), { action: "permit", src: { host: "192.168.10.10" } }), "Χρειάζεται access-list 5 permit host 192.168.10.10.") },
      { text: "Εφάρμοσέ την στις γραμμές vty 0 έως 15.", check: (t) => need(t.dev("R1").lines.vty.accessClass === "5", "Στο line vty 0 15 χρειάζεται access-class 5 in (όχι access-group).") },
    ],
    solution: { R1: [...EN, "access-list 5 permit host 192.168.10.10", "line vty 0 15", "access-class 5 in"] },
    teach: "Στις γραμμές vty η ACL μπαίνει με access-class και όχι με ip access-group, και φιλτράρει μόνο συνδέσεις προς τον ίδιο τον router (telnet/ssh).",
  }),
  lab({
    id: "acl-established", module: M, title: "Extended ACL: established",
    cmds: ["established", "eq"],
    devices: [R("R1", 50, 25, cfg("interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 203.0.113.2 255.255.255.252", "no shutdown")), PC("PC1", 18, 50, "192.168.1.10/24", "192.168.1.1"), PC("Internet", 82, 50, "203.0.113.1/30")],
    links: [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "Internet", "fa0"]],
    intro: "Από το Internet προς το LAN να μπαίνουν μόνο απαντήσεις σε TCP συνδέσεις που άνοιξαν οι χρήστες.",
    tasks: [
      { text: "ACL 110: permit tcp any 192.168.1.0/24 established.", check: (t) => need(has(t.acl("R1", 110), { action: "permit", proto: "tcp", src: { any: true }, dst: { net: "192.168.1.0", wild: "0.0.0.255" }, established: true }), "Χρειάζεται access-list 110 permit tcp any 192.168.1.0 0.0.0.255 established.") },
      { text: "Εφάρμοσέ την inbound στο G0/1.", check: (t) => need(t.f("R1", "g0/1").aclIn === "110", "Χρειάζεται ip access-group 110 in στο G0/1.") },
    ],
    solution: { R1: [...EN, "access-list 110 permit tcp any 192.168.1.0 0.0.0.255 established", "interface g0/1", "ip access-group 110 in"] },
    teach: "Το established ταιριάζει σε πακέτα με ACK ή RST, δηλαδή σε απαντήσεις και όχι σε νέες συνδέσεις. Δεν είναι stateful firewall, αλλά ένα απλό φίλτρο στα flags.",
  }),
  lab({
    id: "sim-acl", module: M, title: "Sim: ACLs σε δύο routers", kind: "sim",
    cmds: ["access-list", "ip access-list extended", "ip access-group", "access-class"],
    devices: [
      R("R1", 25, 22, cfg("interface g0/0", "ip address 192.168.10.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "ip route 172.16.1.0 255.255.255.0 10.0.0.2")),
      R("R2", 75, 22, cfg("interface g0/0", "ip address 172.16.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.0.2 255.255.255.252", "no shutdown", "ip route 192.168.10.0 255.255.255.0 10.0.0.1")),
      PC("PC1", 25, 52, "192.168.10.10/24", "192.168.10.1"), SRV("SRV", 75, 52, "172.16.1.100/24", "172.16.1.1"),
    ],
    links: [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"], ["R2", "g0/0", "SRV", "fa0"]],
    intro: "Το LAN του R1 να βλέπει μόνο DNS (udp 53) και HTTPS στον SRV. Μόνο ο PC1 να κάνει SSH στον R2.",
    tasks: [
      { text: "R1: named extended ACL TO-SRV με permit udp 53 και tcp 443 από 192.168.10.0/24 προς host 172.16.1.100.", check: (t) => { const a = t.acl("R1", "TO-SRV"); const src = { net: "192.168.10.0", wild: "0.0.0.255" }, dst = { host: "172.16.1.100" }; return need(has(a, { action: "permit", proto: "udp", src, dst, port: 53 }) && has(a, { action: "permit", proto: "tcp", src, dst, port: 443 }), "Λείπει το permit udp ... eq domain ή το permit tcp ... eq 443."); } },
      { text: "R1: η TO-SRV να κόβει την υπόλοιπη κίνηση προς τον SRV, αλλά όχι τα άλλα δίκτυα.", check: (t) => { const a = t.acl("R1", "TO-SRV"); const d = index(a, { action: "deny", proto: "ip", dst: { host: "172.16.1.100" } }); return need(d >= 0 && index(a, { action: "permit", proto: "ip", src: { any: true }, dst: { any: true } }) > d, "Χρειάζεται deny ip ... host 172.16.1.100 και μετά permit ip any any."); } },
      { text: "R1: εφάρμοσε την TO-SRV στο σωστό interface και στη σωστή κατεύθυνση.", check: (t) => need(t.f("R1", "g0/0").aclIn === "TO-SRV", "Extended ACL κοντά στην πηγή: G0/0 in στον R1.") },
      { text: "R2: μόνο ο 192.168.10.10 να κάνει remote login (ACL 1 και vty).", check: (t) => need(has(t.acl("R2", 1), { action: "permit", src: { host: "192.168.10.10" } }) && t.dev("R2").lines.vty.accessClass === "1", "Χρειάζεται access-list 1 permit host 192.168.10.10 και access-class 1 in στο line vty 0 15 του R2.") },
    ],
    solution: {
      R1: [...EN, "ip access-list extended TO-SRV", "permit udp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq domain", "permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq 443", "deny ip 192.168.10.0 0.0.0.255 host 172.16.1.100", "permit ip any any", "exit", "interface g0/0", "ip access-group TO-SRV in"],
      R2: [...EN, "access-list 1 permit host 192.168.10.10", "line vty 0 15", "access-class 1 in"],
    },
    teach: "Κάθε interface μπορεί να έχει μία ACL ανά κατεύθυνση και ανά πρωτόκολλο (IPv4/IPv6). Με δεύτερο ip access-group η πρώτη ACL αντικαθίσταται.",
  }),
];
