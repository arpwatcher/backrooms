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
import troubleshooting from "./troubleshooting.js";

export const MODULES = [
  { id: "basics", title: "IOS basics", blurb: "modes, hostname, passwords, interfaces, saving" },
  { id: "switching", title: "VLANs and trunks", blurb: "VLANs, access, voice, trunk, native, DTP" },
  { id: "stp", title: "Spanning Tree", blurb: "Rapid PVST+, root bridge, PortFast, BPDU Guard" },
  { id: "etherchannel", title: "EtherChannel", blurb: "LACP, PAgP, static, L3 EtherChannel" },
  { id: "intervlan", title: "Inter-VLAN routing", blurb: "router on a stick, SVIs, routed ports" },
  { id: "routing", title: "Static routing", blurb: "next hop, default, floating, host, summary" },
  { id: "ospf", title: "OSPFv2", blurb: "network, router-id, passive, cost, DR/BDR, timers" },
  { id: "troubleshooting", title: "Connectivity troubleshooting", blurb: "ping, extended ping, traceroute, debug" },
  { id: "hsrp", title: "HSRP (FHRP)", blurb: "virtual gateway, priority, preempt, version 2" },
  { id: "services", title: "IP services", blurb: "DHCP, relay, NTP, syslog, SNMP, CDP, LLDP" },
  { id: "nat", title: "NAT / PAT", blurb: "static, dynamic, overload, port forwarding" },
  { id: "acl", title: "ACLs", blurb: "standard, extended, named, wildcards, vty, sequence" },
  { id: "security", title: "Security", blurb: "SSH, local users, port security, DHCP snooping, DAI" },
  { id: "ipv6", title: "IPv6", blurb: "addressing, EUI-64, link-local, SLAAC, static routes" },
  { id: "management", title: "Device management", blurb: "IOS image, boot system, config-register, TFTP" },
  { id: "legacy", title: "Legacy (not on 200-301)", blurb: "RIP, EIGRP, VTP" },
];

export const LABS = [...basics, ...switching, ...stp, ...etherchannel, ...intervlan, ...routing, ...ospf, ...troubleshooting, ...hsrp, ...services, ...nat, ...acl, ...security, ...ipv6, ...management, ...legacy];
