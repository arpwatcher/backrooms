// Every lab, in the order the menu shows them, and the modules they sit in.
import basics from "./basics.js";
import switching from "./switching.js";
import stp from "./stp.js";
import etherchannel from "./etherchannel.js";
import routing from "./routing.js";
import ospf from "./ospf.js";
import intervlan from "./intervlan.js";
import services from "./services.js";
import hsrp from "./hsrp.js";
import nat from "./nat.js";
import acl from "./acl.js";
import security from "./security.js";
import ipv6 from "./ipv6.js";
import management from "./management.js";
import legacy from "./legacy.js";

export const MODULES = [
  { id: "basics", title: "IOS βασικά", blurb: "modes, hostname, κωδικοί, interfaces, αποθήκευση" },
  { id: "switching", title: "VLANs και trunks", blurb: "VLANs, access, voice, trunk, native, DTP" },
  { id: "stp", title: "Spanning Tree", blurb: "Rapid PVST+, root bridge, PortFast, BPDU Guard" },
  { id: "etherchannel", title: "EtherChannel", blurb: "LACP, PAgP, static, L3 EtherChannel" },
  { id: "intervlan", title: "Inter-VLAN routing", blurb: "router on a stick, SVIs, routed ports" },
  { id: "routing", title: "Static routing", blurb: "next hop, default, floating, host, summary" },
  { id: "ospf", title: "OSPFv2", blurb: "network, router-id, passive, cost, DR/BDR, timers" },
  { id: "hsrp", title: "HSRP (FHRP)", blurb: "virtual gateway, priority, preempt, version 2" },
  { id: "services", title: "IP services", blurb: "DHCP, relay, NTP, syslog, SNMP, CDP, LLDP" },
  { id: "nat", title: "NAT / PAT", blurb: "static, dynamic, overload, port forwarding" },
  { id: "acl", title: "ACLs", blurb: "standard, extended, named, wildcards, vty, sequence" },
  { id: "security", title: "Security", blurb: "SSH, local users, port security, DHCP snooping, DAI" },
  { id: "ipv6", title: "IPv6", blurb: "addressing, EUI-64, link-local, SLAAC, static routes" },
  { id: "management", title: "Device management", blurb: "IOS image, boot system, config-register, TFTP" },
  { id: "legacy", title: "Εκτός ύλης (legacy)", blurb: "RIP, EIGRP, VTP: δεν είναι στο 200-301" },
];

export const LABS = [...basics, ...switching, ...stp, ...etherchannel, ...intervlan, ...routing, ...ospf, ...hsrp, ...services, ...nat, ...acl, ...security, ...ipv6, ...management, ...legacy];
