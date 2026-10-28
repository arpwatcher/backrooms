// Every lab, in the order the menu shows them, and the modules they sit in.
import basics from "./basics.js";
import switching from "./switching.js";
import stp from "./stp.js";
import etherchannel from "./etherchannel.js";
import routing from "./routing.js";
import ospf from "./ospf.js";
import intervlan from "./intervlan.js";

export const MODULES = [
  { id: "basics", title: "IOS βασικά", blurb: "modes, hostname, κωδικοί, interfaces, αποθήκευση" },
  { id: "switching", title: "VLANs και trunks", blurb: "VLANs, access, voice, trunk, native, DTP" },
  { id: "stp", title: "Spanning Tree", blurb: "Rapid PVST+, root bridge, PortFast, BPDU Guard" },
  { id: "etherchannel", title: "EtherChannel", blurb: "LACP, PAgP, static, L3 EtherChannel" },
  { id: "intervlan", title: "Inter-VLAN routing", blurb: "router on a stick, SVIs, routed ports" },
  { id: "routing", title: "Static routing", blurb: "next hop, default, floating, host, summary" },
  { id: "ospf", title: "OSPFv2", blurb: "network, router-id, passive, cost, DR/BDR, timers" },
];

export const LABS = [...basics, ...switching, ...stp, ...etherchannel, ...intervlan, ...routing, ...ospf];
