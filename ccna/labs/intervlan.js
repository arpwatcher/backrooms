import { lab, R, S, L3, PC, cfg, EN, need } from "./kit.js";

const M = "intervlan";
const swVlans = cfg("vlan 10", "name SALES", "vlan 20", "name ENG", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20");

export default [
  lab({
    id: "roas", module: M, title: "Router on a stick", kind: "micro",
    cmds: ["interface g0/0.10", "encapsulation dot1q", "ip address"],
    devices: [R("R1", 50, 12), S("SW1", 50, 36, [...swVlans.slice(0, -1), "interface g0/1", "switchport mode trunk", "end"]), PC("PC1", 25, 55, "10.10.10.10/24", "10.10.10.1"), PC("PC2", 75, 55, "10.10.20.10/24", "10.10.20.1")],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["SW1", "fa0/1", "PC1", "fa0"], ["SW1", "fa0/2", "PC2", "fa0"]],
    intro: "SW1 has a trunk to R1. R1 must be the gateway for VLANs 10 and 20 through one interface.",
    tasks: [
      { text: "Enable the physical interface G0/0 on R1.", check: (t) => need(t.enabled("R1", "g0/0"), "G0/0 is shut down, and every subinterface goes down with it.") },
      { text: "Subinterface G0/0.10: VLAN 10 (dot1q), IP 10.10.10.1/24.", check: (t) => need(t.f("R1", "g0/0.10")?.encap?.vlan === 10 && t.ip("R1", "g0/0.10") === "10.10.10.1/24", "G0/0.10 needs encapsulation dot1q 10 and ip address 10.10.10.1 255.255.255.0.") },
      { text: "Subinterface G0/0.20: VLAN 20 (dot1q), IP 10.10.20.1/24.", check: (t) => need(t.f("R1", "g0/0.20")?.encap?.vlan === 20 && t.ip("R1", "g0/0.20") === "10.10.20.1/24", "G0/0.20 needs encapsulation dot1q 20 and ip address 10.10.20.1 255.255.255.0.") },
    ],
    solution: { R1: [...EN, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 10.10.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 10.10.20.1 255.255.255.0"] },
    teach: "The encapsulation must come before the IP address, or IOS rejects the address. The subinterface number (.10) need not match the VLAN, but matching keeps it clear.",
  }),
  lab({
    id: "roas-native", module: M, title: "Native VLAN on a router on a stick",
    cmds: ["encapsulation dot1q <vlan> native"],
    devices: [R("R1", 50, 15, cfg("interface g0/0", "no shutdown")), S("SW1", 50, 42, cfg("vlan 99", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99"))],
    links: [["R1", "g0/0", "SW1", "g0/1"]],
    intro: "SW1's trunk uses native VLAN 99. R1 must accept untagged frames in that VLAN.",
    tasks: [{ text: "Create G0/0.99 for native VLAN 99 with IP 192.168.99.1/24.", check: (t) => need(t.f("R1", "g0/0.99")?.encap?.vlan === 99 && t.f("R1", "g0/0.99").encap.native && t.ip("R1", "g0/0.99") === "192.168.99.1/24", "Expected encapsulation dot1q 99 native and ip address 192.168.99.1 255.255.255.0.") }],
    solution: { R1: [...EN, "interface g0/0.99", "encapsulation dot1q 99 native", "ip address 192.168.99.1 255.255.255.0"] },
    teach: "The native VLAN is untagged, so its subinterface needs the native keyword. Alternatively, the address goes on the physical interface itself.",
  }),
  lab({
    id: "l3-svi", module: M, title: "Inter-VLAN routing on a Layer 3 switch (SVIs)",
    cmds: ["ip routing", "interface vlan", "ip address"],
    devices: [L3("DSW1", 50, 18, swVlans), PC("PC1", 25, 50, "10.10.10.10/24", "10.10.10.1"), PC("PC2", 75, 50, "10.10.20.10/24", "10.10.20.1")],
    links: [["DSW1", "fa0/1", "PC1", "fa0"], ["DSW1", "fa0/2", "PC2", "fa0"]],
    intro: "DSW1 is a multilayer switch. It must route between VLANs 10 and 20 without a router.",
    tasks: [
      { text: "Enable IP routing on the switch.", check: (t) => need(t.dev("DSW1").ipRouting, "Layer 3 switches do not route by default. Use ip routing.") },
      { text: "VLAN 10 SVI: 10.10.10.1/24, up.", check: (t) => need(t.ip("DSW1", "vlan10") === "10.10.10.1/24" && t.enabled("DSW1", "vlan10"), "interface vlan 10 needs 10.10.10.1/24 and no shutdown.") },
      { text: "VLAN 20 SVI: 10.10.20.1/24, up.", check: (t) => need(t.ip("DSW1", "vlan20") === "10.10.20.1/24" && t.enabled("DSW1", "vlan20"), "interface vlan 20 needs 10.10.20.1/24 and no shutdown.") },
    ],
    solution: { DSW1: [...EN, "ip routing", "interface vlan 10", "ip address 10.10.10.1 255.255.255.0", "no shutdown", "interface vlan 20", "ip address 10.10.20.1 255.255.255.0", "no shutdown"] },
    teach: "An SVI is up/up only when its VLAN exists and at least one of its ports (access or trunk) is up. Without ip routing the switch acts as a host and does not forward between VLANs.",
  }),
  lab({
    id: "routed-port", module: M, title: "Routed port on a Layer 3 switch (no switchport)",
    cmds: ["no switchport", "ip address"],
    devices: [L3("DSW1", 30, 30, cfg("ip routing")), R("R1", 75, 30, cfg("interface g0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown"))],
    links: [["DSW1", "g0/1", "R1", "g0/0"]],
    intro: "DSW1 connects to R1 over a point-to-point routed link, not through a VLAN.",
    tasks: [{ text: "Make G0/1 on DSW1 a routed port with IP 10.0.0.2/30.", check: (t) => need(!t.f("DSW1", "g0/1").switchport && t.ip("DSW1", "g0/1") === "10.0.0.2/30", t.f("DSW1", "g0/1").switchport ? "First no switchport, then the IP address." : "The address on G0/1 is not 10.0.0.2/30.") }],
    solution: { DSW1: [...EN, "interface g0/1", "no switchport", "ip address 10.0.0.2 255.255.255.252"] },
    teach: "no switchport turns the port into a router port: it belongs to no VLAN and runs no STP. An address on a switchport is rejected with % IP addresses may not be configured on L2 links.",
  }),
  lab({
    id: "sim-roas", module: M, title: "Sim: inter-VLAN routing from scratch", kind: "sim",
    cmds: ["vlan", "switchport mode trunk", "encapsulation dot1q", "ip address"],
    devices: [R("R1", 50, 12), S("SW1", 50, 36), PC("PC1", 25, 55, "192.168.10.10/24", "192.168.10.1"), PC("PC2", 75, 55, "192.168.20.10/24", "192.168.20.1")],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["SW1", "fa0/1", "PC1", "fa0"], ["SW1", "fa0/2", "PC2", "fa0"]],
    intro: "Neither device is configured. PC1 (VLAN 10) and PC2 (VLAN 20) must talk to each other through R1.",
    tasks: [
      { text: "SW1: VLANs 10 and 20, Fa0/1 access in 10, Fa0/2 access in 20.", check: (t) => need(t.dev("SW1").vlans[10] && t.dev("SW1").vlans[20] && t.f("SW1", "fa0/1").accessVlan === 10 && t.f("SW1", "fa0/1").mode === "access" && t.f("SW1", "fa0/2").accessVlan === 20 && t.f("SW1", "fa0/2").mode === "access", "SW1's VLANs or access ports are not correct.") },
      { text: "SW1: G0/1 trunk toward R1.", check: (t) => need(t.f("SW1", "g0/1").mode === "trunk", "G0/1 is not a trunk.") },
      { text: "R1: subinterfaces with gateway .1 for 192.168.10.0/24 (VLAN 10) and 192.168.20.0/24 (VLAN 20), and the physical interface up.", check: (t) => need(t.enabled("R1", "g0/0") && t.f("R1", "g0/0.10")?.encap?.vlan === 10 && t.ip("R1", "g0/0.10") === "192.168.10.1/24" && t.f("R1", "g0/0.20")?.encap?.vlan === 20 && t.ip("R1", "g0/0.20") === "192.168.20.1/24", "The subinterfaces, or no shutdown on G0/0 of R1, are not correct.") },
      { text: "Verify on R1 that the subinterfaces are up/up.", check: (t) => need(t.up("R1", "g0/0.10") && t.up("R1", "g0/0.20") && t.ran("R1", /^show ip interface brief$/), "Check show ip interface brief: G0/0.10 and G0/0.20 must be up/up.") },
    ],
    solution: {
      SW1: [...EN, "vlan 10", "vlan 20", "exit", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk"],
      R1: [...EN, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 192.168.20.1 255.255.255.0", "end", "show ip interface brief"],
    },
    teach: "The usual mistakes: G0/0 left shut down, the wrong VLAN number in the encapsulation, the port toward the router not trunking, and a PC with the wrong gateway.",
  }),
  lab({
    id: "sim-l3switch", module: M, title: "Sim: Layer 3 switch with an uplink to a router", kind: "sim",
    cmds: ["ip routing", "interface vlan", "no switchport", "ip route"],
    devices: [R("R1", 80, 18, cfg("interface g0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "ip route 10.20.0.0 255.255.0.0 10.0.0.2")), L3("DSW1", 40, 18, cfg("vlan 10", "vlan 20", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20")), PC("PC1", 20, 50, "10.20.10.10/24", "10.20.10.1"), PC("PC2", 60, 50, "10.20.20.10/24", "10.20.20.1")],
    links: [["DSW1", "g0/1", "R1", "g0/0"], ["DSW1", "fa0/1", "PC1", "fa0"], ["DSW1", "fa0/2", "PC2", "fa0"]],
    intro: "DSW1 routes for VLANs 10 and 20, and reaches R1 over a routed link.",
    tasks: [
      { text: "Enable routing on DSW1.", check: (t) => need(t.dev("DSW1").ipRouting, "Expected ip routing.") },
      { text: "SVIs: VLAN 10 with 10.20.10.1/24 and VLAN 20 with 10.20.20.1/24, both up.", check: (t) => need(t.ip("DSW1", "vlan10") === "10.20.10.1/24" && t.ip("DSW1", "vlan20") === "10.20.20.1/24" && t.enabled("DSW1", "vlan10") && t.enabled("DSW1", "vlan20"), "The SVIs are not correct.") },
      { text: "G0/1 is a routed port with 10.0.0.2/30.", check: (t) => need(!t.f("DSW1", "g0/1").switchport && t.ip("DSW1", "g0/1") === "10.0.0.2/30", "G0/1 needs no switchport and 10.0.0.2/30.") },
      { text: "Default route on DSW1 toward R1.", check: (t) => need(t.statics("DSW1").some((r) => r.net === "0.0.0.0" && r.mask === "0.0.0.0" && r.via === "10.0.0.1"), "Expected ip route 0.0.0.0 0.0.0.0 10.0.0.1.") },
    ],
    solution: { DSW1: [...EN, "ip routing", "interface vlan 10", "ip address 10.20.10.1 255.255.255.0", "no shutdown", "interface vlan 20", "ip address 10.20.20.1 255.255.255.0", "no shutdown", "interface g0/1", "no switchport", "ip address 10.0.0.2 255.255.255.252", "exit", "ip route 0.0.0.0 0.0.0.0 10.0.0.1"] },
    teach: "On a Layer 3 switch, ip route works only after ip routing. Without it the switch uses only ip default-gateway.",
  }),
];
