// Every lab, in the order the menu shows them, and the modules they sit in.
import basics from "./basics.js";
import switching from "./switching.js";
import stp from "./stp.js";
import etherchannel from "./etherchannel.js";

export const MODULES = [
  { id: "basics", title: "IOS βασικά", blurb: "modes, hostname, κωδικοί, interfaces, αποθήκευση" },
  { id: "switching", title: "VLANs και trunks", blurb: "VLANs, access, voice, trunk, native, DTP" },
  { id: "stp", title: "Spanning Tree", blurb: "Rapid PVST+, root bridge, PortFast, BPDU Guard" },
  { id: "etherchannel", title: "EtherChannel", blurb: "LACP, PAgP, static, L3 EtherChannel" },
];

export const LABS = [...basics, ...switching, ...stp, ...etherchannel];
