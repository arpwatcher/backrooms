import { lab, R, S, L3, PC, cfg, EN, need } from "./kit.js";

const M = "intervlan";
const swVlans = cfg("vlan 10", "name SALES", "vlan 20", "name ENG", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20");

export default [
  lab({
    id: "roas", module: M, title: "Router on a stick", kind: "micro",
    cmds: ["interface g0/0.10", "encapsulation dot1q", "ip address"],
    devices: [R("R1", 50, 12), S("SW1", 50, 36, [...swVlans.slice(0, -1), "interface g0/1", "switchport mode trunk", "end"]), PC("PC1", 25, 55, "10.10.10.10/24", "10.10.10.1"), PC("PC2", 75, 55, "10.10.20.10/24", "10.10.20.1")],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["SW1", "fa0/1", "PC1", "fa0"], ["SW1", "fa0/2", "PC2", "fa0"]],
    intro: "Ο SW1 έχει trunk προς τον R1. Ο R1 πρέπει να γίνει gateway για τις VLANs 10 και 20 μέσα από ένα interface.",
    tasks: [
      { text: "Ενεργοποίησε το φυσικό G0/0 του R1.", check: (t) => need(t.enabled("R1", "g0/0"), "Το G0/0 είναι shutdown και μαζί του πέφτουν όλα τα subinterfaces.") },
      { text: "Subinterface G0/0.10: VLAN 10 (dot1q), IP 10.10.10.1/24.", check: (t) => need(t.f("R1", "g0/0.10")?.encap?.vlan === 10 && t.ip("R1", "g0/0.10") === "10.10.10.1/24", "Το G0/0.10 θέλει encapsulation dot1q 10 και ip address 10.10.10.1 255.255.255.0.") },
      { text: "Subinterface G0/0.20: VLAN 20 (dot1q), IP 10.10.20.1/24.", check: (t) => need(t.f("R1", "g0/0.20")?.encap?.vlan === 20 && t.ip("R1", "g0/0.20") === "10.10.20.1/24", "Το G0/0.20 θέλει encapsulation dot1q 20 και ip address 10.10.20.1 255.255.255.0.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 10.10.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 10.10.20.1 255.255.255.0"] },
    teach: "Το encapsulation μπαίνει πριν την IP, αλλιώς το IOS την απορρίπτει. Ο αριθμός του subinterface (.10) δεν χρειάζεται να είναι ίδιος με τη VLAN, αλλά έτσι είναι πιο καθαρό.",
  }),
  lab({
    id: "roas-native", module: M, title: "Native VLAN σε router on a stick",
    cmds: ["encapsulation dot1q <vlan> native"],
    devices: [R("R1", 50, 15, cfg("interface g0/0", "no shutdown")), S("SW1", 50, 42, cfg("vlan 99", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99"))],
    links: [["R1", "g0/0", "SW1", "g0/1"]],
    intro: "Το trunk του SW1 έχει native VLAN 99. Ο R1 πρέπει να δέχεται untagged frames σε αυτήν.",
    tasks: [{ text: "Φτιάξε το G0/0.99 για τη native VLAN 99 με IP 192.168.99.1/24.", check: (t) => need(t.f("R1", "g0/0.99")?.encap?.vlan === 99 && t.f("R1", "g0/0.99").encap.native && t.ip("R1", "g0/0.99") === "192.168.99.1/24", "Χρειάζεται encapsulation dot1q 99 native και ip address 192.168.99.1 255.255.255.0.") }],
    solution: { R1: [...EN, "interface g0/0.99", "encapsulation dot1q 99 native", "ip address 192.168.99.1 255.255.255.0"] },
    teach: "Η native VLAN περνάει untagged, οπότε το subinterface της θέλει τη λέξη native. Εναλλακτικά, η IP μπαίνει στο ίδιο το φυσικό interface.",
  }),
  lab({
    id: "l3-svi", module: M, title: "Inter-VLAN routing σε L3 switch (SVIs)",
    cmds: ["ip routing", "interface vlan", "ip address"],
    devices: [L3("DSW1", 50, 18, swVlans), PC("PC1", 25, 50, "10.10.10.10/24", "10.10.10.1"), PC("PC2", 75, 50, "10.10.20.10/24", "10.10.20.1")],
    links: [["DSW1", "fa0/1", "PC1", "fa0"], ["DSW1", "fa0/2", "PC2", "fa0"]],
    intro: "Ο DSW1 είναι multilayer switch. Πρέπει να κάνει routing ανάμεσα στις VLANs 10 και 20, χωρίς router.",
    tasks: [
      { text: "Ενεργοποίησε το IP routing στον switch.", check: (t) => need(t.dev("DSW1").ipRouting, "Οι L3 switches δεν κάνουν routing από προεπιλογή. Θέλει ip routing.") },
      { text: "SVI VLAN 10: 10.10.10.1/24, up.", check: (t) => need(t.ip("DSW1", "vlan10") === "10.10.10.1/24" && t.enabled("DSW1", "vlan10"), "Το interface vlan 10 θέλει IP 10.10.10.1/24 και no shutdown.") },
      { text: "SVI VLAN 20: 10.10.20.1/24, up.", check: (t) => need(t.ip("DSW1", "vlan20") === "10.10.20.1/24" && t.enabled("DSW1", "vlan20"), "Το interface vlan 20 θέλει IP 10.10.20.1/24 και no shutdown.") },
    ],
    solution: { DSW1: [...EN, "ip routing", "interface vlan 10", "ip address 10.10.10.1 255.255.255.0", "no shutdown", "interface vlan 20", "ip address 10.10.20.1 255.255.255.0", "no shutdown"] },
    teach: "Το SVI είναι up/up μόνο όταν υπάρχει η VLAN και τουλάχιστον μία θύρα της (access ή trunk) είναι up. Χωρίς ip routing ο switch φέρεται σαν host και δεν προωθεί πακέτα ανάμεσα στις VLANs.",
  }),
  lab({
    id: "routed-port", module: M, title: "Routed port σε L3 switch (no switchport)",
    cmds: ["no switchport", "ip address"],
    devices: [L3("DSW1", 30, 30, cfg("ip routing")), R("R1", 75, 30, cfg("interface g0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown"))],
    links: [["DSW1", "g0/1", "R1", "g0/0"]],
    intro: "Ο DSW1 συνδέεται με τον R1 μέσω point-to-point routed link, όχι μέσω VLAN.",
    tasks: [{ text: "Κάνε τη G0/1 του DSW1 routed port με IP 10.0.0.2/30.", check: (t) => need(!t.f("DSW1", "g0/1").switchport && t.ip("DSW1", "g0/1") === "10.0.0.2/30", t.f("DSW1", "g0/1").switchport ? "Πρώτα no switchport, μετά η IP." : "Η IP στη G0/1 δεν είναι 10.0.0.2/30.") }],
    solution: { DSW1: [...EN, "interface g0/1", "no switchport", "ip address 10.0.0.2 255.255.255.252"] },
    teach: "Με το no switchport η θύρα γίνεται σαν θύρα router: δεν ανήκει σε VLAN και δεν τρέχει STP. Αν δοκιμάσεις IP σε switchport, βγαίνει % IP addresses may not be configured on L2 links.",
  }),
  lab({
    id: "sim-roas", module: M, title: "Sim: inter-VLAN routing από την αρχή", kind: "sim",
    cmds: ["vlan", "switchport mode trunk", "encapsulation dot1q", "ip address"],
    devices: [R("R1", 50, 12), S("SW1", 50, 36), PC("PC1", 25, 55, "192.168.10.10/24", "192.168.10.1"), PC("PC2", 75, 55, "192.168.20.10/24", "192.168.20.1")],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["SW1", "fa0/1", "PC1", "fa0"], ["SW1", "fa0/2", "PC2", "fa0"]],
    intro: "Κανένα από τα δύο δεν είναι ρυθμισμένο. Τα PC1 (VLAN 10) και PC2 (VLAN 20) πρέπει να μιλάνε μεταξύ τους μέσω του R1.",
    tasks: [
      { text: "SW1: VLANs 10 και 20, Fa0/1 access στη 10, Fa0/2 access στη 20.", check: (t) => need(t.dev("SW1").vlans[10] && t.dev("SW1").vlans[20] && t.f("SW1", "fa0/1").accessVlan === 10 && t.f("SW1", "fa0/1").mode === "access" && t.f("SW1", "fa0/2").accessVlan === 20 && t.f("SW1", "fa0/2").mode === "access", "Οι VLANs ή οι access θύρες του SW1 δεν είναι σωστές.") },
      { text: "SW1: G0/1 trunk προς τον R1.", check: (t) => need(t.f("SW1", "g0/1").mode === "trunk", "Η G0/1 δεν είναι trunk.") },
      { text: "R1: subinterfaces με gateway .1 για 192.168.10.0/24 (VLAN 10) και 192.168.20.0/24 (VLAN 20), και φυσικό interface up.", check: (t) => need(t.enabled("R1", "g0/0") && t.f("R1", "g0/0.10")?.encap?.vlan === 10 && t.ip("R1", "g0/0.10") === "192.168.10.1/24" && t.f("R1", "g0/0.20")?.encap?.vlan === 20 && t.ip("R1", "g0/0.20") === "192.168.20.1/24", "Τα subinterfaces ή το no shutdown στο G0/0 του R1 δεν είναι σωστά.") },
      { text: "Επιβεβαίωσε στον R1 ότι τα subinterfaces είναι up/up.", check: (t) => need(t.up("R1", "g0/0.10") && t.up("R1", "g0/0.20") && t.ran("R1", /^show ip interface brief$/), "Δες show ip interface brief: τα G0/0.10 και G0/0.20 πρέπει να είναι up/up.") },
    ],
    solution: {
      SW1: [...EN, "vlan 10", "vlan 20", "exit", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk"],
      R1: [...EN, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 192.168.20.1 255.255.255.0", "end", "show ip interface brief"],
    },
    teach: "Τα συνηθισμένα λάθη είναι: G0/0 ξεχασμένο shutdown, λάθος αριθμός VLAN στο encapsulation, θύρα προς τον router που δεν είναι trunk, και PC με λάθος gateway.",
  }),
  lab({
    id: "sim-l3switch", module: M, title: "Sim: L3 switch με uplink προς router", kind: "sim",
    cmds: ["ip routing", "interface vlan", "no switchport", "ip route"],
    devices: [R("R1", 80, 18, cfg("interface g0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "ip route 10.20.0.0 255.255.0.0 10.0.0.2")), L3("DSW1", 40, 18, cfg("vlan 10", "vlan 20", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20")), PC("PC1", 20, 50, "10.20.10.10/24", "10.20.10.1"), PC("PC2", 60, 50, "10.20.20.10/24", "10.20.20.1")],
    links: [["DSW1", "g0/1", "R1", "g0/0"], ["DSW1", "fa0/1", "PC1", "fa0"], ["DSW1", "fa0/2", "PC2", "fa0"]],
    intro: "Ο DSW1 κάνει routing για τις VLANs 10 και 20 και βγαίνει προς τον R1 μέσω routed link.",
    tasks: [
      { text: "Ενεργοποίησε το routing στον DSW1.", check: (t) => need(t.dev("DSW1").ipRouting, "Χρειάζεται ip routing.") },
      { text: "SVIs: VLAN 10 με 10.20.10.1/24 και VLAN 20 με 10.20.20.1/24, και τα δύο up.", check: (t) => need(t.ip("DSW1", "vlan10") === "10.20.10.1/24" && t.ip("DSW1", "vlan20") === "10.20.20.1/24" && t.enabled("DSW1", "vlan10") && t.enabled("DSW1", "vlan20"), "Τα SVIs δεν είναι σωστά.") },
      { text: "G0/1 routed port με 10.0.0.2/30.", check: (t) => need(!t.f("DSW1", "g0/1").switchport && t.ip("DSW1", "g0/1") === "10.0.0.2/30", "Η G0/1 θέλει no switchport και 10.0.0.2/30.") },
      { text: "Default route στον DSW1 προς τον R1.", check: (t) => need(t.statics("DSW1").some((r) => r.net === "0.0.0.0" && r.mask === "0.0.0.0" && r.via === "10.0.0.1"), "Χρειάζεται ip route 0.0.0.0 0.0.0.0 10.0.0.1.") },
    ],
    solution: { DSW1: [...EN, "ip routing", "interface vlan 10", "ip address 10.20.10.1 255.255.255.0", "no shutdown", "interface vlan 20", "ip address 10.20.20.1 255.255.255.0", "no shutdown", "interface g0/1", "no switchport", "ip address 10.0.0.2 255.255.255.252", "exit", "ip route 0.0.0.0 0.0.0.0 10.0.0.1"] },
    teach: "Σε L3 switch, το ip route δουλεύει μόνο μετά το ip routing. Χωρίς αυτό, ο switch χρησιμοποιεί μόνο το ip default-gateway.",
  }),
];
