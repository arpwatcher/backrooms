import { lab, S, L3, cfg, EN, need } from "./kit.js";

const M = "etherchannel";
const pair = (a = [], b = []) => [S("SW1", 25, 30, a), S("SW2", 75, 30, b)];
const links = [["SW1", "g0/1", "SW2", "g0/1"], ["SW1", "g0/2", "SW2", "g0/2"]];
const both = (t, sw, ok) => ["g0/1", "g0/2"].every((p) => ok(t.f(sw, p)));

export default [
  lab({
    id: "lacp", module: M, title: "EtherChannel with LACP",
    cmds: ["channel-group mode active", "show etherchannel summary"],
    devices: pair(), links,
    intro: "The two links between the switches must become one 2 Gbps logical link, using the open standard.",
    tasks: [
      { text: "SW1: put G0/1 and G0/2 in channel-group 1 with LACP active.", check: (t) => need(both(t, "SW1", (f) => f.channel?.group === 1 && f.channel.mode === "active"), "G0/1-2 on SW1 need channel-group 1 mode active.") },
      { text: "SW2: put G0/1 and G0/2 in channel-group 1 with LACP (active or passive).", check: (t) => need(both(t, "SW2", (f) => f.channel?.group === 1 && ["active", "passive"].includes(f.channel.mode)), "SW2 needs channel-group 1 mode active or passive.") },
      { text: "Verify that the ports are bundled (P) in Po1.", check: (t) => need(t.bundled("SW1", "g0/1") && t.bundled("SW1", "g0/2") && t.ran("SW1", /^show etherchannel summary$/), "Check show etherchannel summary on SW1. The ports must show (P).") },
    ],
    solution: { SW1: [...EN, "interface range g0/1 - 2", "channel-group 1 mode active", "end", "show etherchannel summary"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 1 mode passive"] },
    teach: "LACP (802.3ad): active + active or active + passive bundles; passive + passive does not. Member ports need the same speed, duplex, mode and VLANs. Port-channel1 is created automatically.",
  }),
  lab({
    id: "pagp", module: M, title: "EtherChannel with PAgP",
    cmds: ["channel-group mode desirable", "channel-group mode auto"],
    devices: pair(), links,
    intro: "The network is all Cisco, and the team wants PAgP.",
    tasks: [
      { text: "SW1: G0/1-2 in channel-group 2 with PAgP desirable.", check: (t) => need(both(t, "SW1", (f) => f.channel?.group === 2 && f.channel.mode === "desirable"), "SW1 needs channel-group 2 mode desirable.") },
      { text: "SW2: G0/1-2 in channel-group 2 with PAgP auto.", check: (t) => need(both(t, "SW2", (f) => f.channel?.group === 2 && f.channel.mode === "auto"), "SW2 needs channel-group 2 mode auto.") },
      { text: "The EtherChannel must form.", check: (t) => need(t.bundled("SW1", "g0/1"), "The channel does not form: auto + auto never bundles, at least one side must be desirable.") },
    ],
    solution: { SW1: [...EN, "interface range g0/1 - 2", "channel-group 2 mode desirable"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 2 mode auto"] },
    teach: "PAgP (Cisco): desirable + desirable or desirable + auto bundles; auto + auto does not. PAgP and LACP do not mix.",
  }),
  lab({
    id: "static-on", module: M, title: "Static EtherChannel (mode on)",
    cmds: ["channel-group mode on"],
    devices: pair(), links,
    intro: "SW2 supports no negotiation protocol.",
    tasks: [{ text: "Create channel-group 3 with no protocol (on) on G0/1-2 of both switches.", check: (t) => need(["SW1", "SW2"].every((s) => both(t, s, (f) => f.channel?.group === 3 && f.channel.mode === "on")) && t.bundled("SW1", "g0/1"), "Use channel-group 3 mode on at both ends. on works only with on.") }],
    solution: { SW1: [...EN, "interface range g0/1 - 2", "channel-group 3 mode on"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 3 mode on"] },
    teach: "Mode on sends nothing to check the other end. If the other side is not on as well, a loop can form, which is why LACP is preferred.",
  }),
  lab({
    id: "po-trunk", module: M, title: "Trunk on a port-channel",
    cmds: ["interface port-channel", "switchport mode trunk"],
    devices: pair(cfg("interface range g0/1 - 2", "channel-group 1 mode active")), links: links,
    intro: "Po1 already exists on SW1. It must carry every VLAN, and SW2 still needs its side.",
    tasks: [
      { text: "On SW1, make Port-channel1 a trunk by configuring the port-channel itself.", check: (t) => need(t.f("SW1", "po1")?.mode === "trunk" && t.ran("SW1", /^interface Port-channel1$/), "Enter interface port-channel 1 and configure switchport mode trunk.") },
      { text: "On SW2, build the same bundle (LACP, group 1) and make Port-channel1 a trunk.", check: (t) => need(both(t, "SW2", (f) => f.channel?.group === 1) && t.f("SW2", "po1")?.mode === "trunk", "On SW2: channel-group 1 mode active/passive on G0/1-2 and switchport mode trunk on Po1.") },
    ],
    solution: { SW1: [...EN, "interface port-channel 1", "switchport mode trunk"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 1 mode passive", "interface port-channel 1", "switchport mode trunk"] },
    teach: "Once bundled, configure the Port-channel interface, not the member ports. Its settings are passed down to the members.",
  }),
  lab({
    id: "l3-etherchannel", module: M, title: "Layer 3 EtherChannel",
    cmds: ["no switchport", "channel-group", "interface port-channel", "ip address"],
    devices: [L3("CORE1", 25, 30), L3("CORE2", 75, 30, cfg("interface range g0/1 - 2", "no switchport", "channel-group 1 mode active", "interface port-channel 1", "no switchport", "ip address 10.0.0.2 255.255.255.252"))],
    links: [["CORE1", "g0/1", "CORE2", "g0/1"], ["CORE1", "g0/2", "CORE2", "g0/2"]],
    intro: "The two core switches need a routed EtherChannel between them. CORE2 is already done.",
    tasks: [
      { text: "On CORE1, make G0/1-2 routed ports (no switchport) in channel-group 1 with LACP.", check: (t) => need(both(t, "CORE1", (f) => !f.switchport && f.channel?.group === 1 && ["active", "passive"].includes(f.channel.mode)), "Expected no switchport and channel-group 1 mode active on G0/1-2.") },
      { text: "Give Port-channel1 on CORE1 the address 10.0.0.1/30.", check: (t) => need(t.ip("CORE1", "po1") === "10.0.0.1/30", `Po1 has ${t.ip("CORE1", "po1") ?? "nothing"}. Po1 needs no switchport first.`) },
    ],
    solution: { CORE1: [...EN, "interface range g0/1 - 2", "no switchport", "channel-group 1 mode active", "interface port-channel 1", "no switchport", "ip address 10.0.0.1 255.255.255.252"] },
    teach: "For a Layer 3 EtherChannel, configure no switchport before channel-group so the port-channel is routed. The IP address goes on the port-channel.",
  }),
  lab({
    id: "sim-etherchannel", module: M, title: "Sim: fix the EtherChannel", kind: "sim",
    cmds: ["channel-group", "show etherchannel summary", "switchport mode trunk"],
    devices: pair(cfg("interface range g0/1 - 2", "switchport mode trunk", "channel-group 1 mode passive"), cfg("interface range g0/1 - 2", "switchport mode trunk", "channel-group 1 mode passive")), links,
    intro: "Someone configured LACP on both switches, but Po1 never comes up. Find out why and fix it.",
    tasks: [
      { text: "Check the EtherChannel status on SW1.", check: (t) => need(t.ran("SW1", /^show etherchannel summary$/), "Start with show etherchannel summary.") },
      { text: "Fix it so that G0/1 and G0/2 are bundled (P) on both sides with LACP.", check: (t) => need(["SW1", "SW2"].every((s) => both(t, s, (f) => ["active", "passive"].includes(f.channel?.mode))) && t.bundled("SW1", "g0/1") && t.bundled("SW1", "g0/2"), "passive + passive never forms an LACP channel: one side must be active.") },
      { text: "Port-channel1 is a trunk on both sides.", check: (t) => need(t.f("SW1", "po1")?.mode === "trunk" && t.f("SW2", "po1")?.mode === "trunk", "Po1 is not a trunk on one side.") },
    ],
    solution: { SW1: ["enable", "show etherchannel summary", "configure terminal", "interface range g0/1 - 2", "channel-group 1 mode active", "interface port-channel 1", "switchport mode trunk"], SW2: [...EN, "interface port-channel 1", "switchport mode trunk"] },
    teach: "Troubleshooting sims on the exam start with show commands. In show etherchannel summary, (I) means stand-alone (not bundled) and (P) means bundled.",
  }),
];
