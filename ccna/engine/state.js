// A device's configuration as plain data: everything IOS would keep in the
// running-config, and nothing else. The commands change it, the show
// commands and the labs' checks read it.

import { compare } from "./iface.js";

export class IosError extends Error {}

const PORTS = {
  router: () => ["GigabitEthernet0/0", "GigabitEthernet0/1", "GigabitEthernet0/2", "Serial0/0/0", "Serial0/0/1"],
  switch: () => [...Array.from({ length: 24 }, (_, i) => `FastEthernet0/${i + 1}`), "GigabitEthernet0/1", "GigabitEthernet0/2"],
  l3switch: () => [...Array.from({ length: 24 }, (_, i) => `FastEthernet0/${i + 1}`), "GigabitEthernet0/1", "GigabitEthernet0/2"],
  pc: () => ["FastEthernet0"],
  server: () => ["FastEthernet0"],
  cloud: () => ["GigabitEthernet0/0", "GigabitEthernet0/1"],
};

export const DEFAULT_NAME = { router: "Router", switch: "Switch", l3switch: "Switch", pc: "PC", server: "Server", cloud: "ISP" };

export function newInterface(dev, name) {
  const switching = dev.type !== "router" && /^(FastEthernet|GigabitEthernet)/.test(name);
  return {
    name,
    description: null,
    ip: null, mask: null, secondaries: [], dhcp: false,
    // router ports and SVIs start shut; switch ports start up
    shutdown: !switching && !/^(Loopback|Port-channel)/.test(name),
    speed: "auto", duplex: "auto", bandwidth: null, clockRate: null,
    switchport: switching,
    mode: switching ? "dynamic auto" : null,
    accessVlan: 1, voiceVlan: null, trunkEncap: dev.type === "l3switch" ? "negotiate" : "dot1q",
    nativeVlan: 1, allowed: null, nonegotiate: false,
    ps: { enabled: false, max: 1, violation: "shutdown", macs: [], sticky: false },
    channel: null, channelProtocol: null,
    stp: { portfast: null, bpduguard: null, bpdufilter: null, guard: null, cost: null, priority: null, vlan: {}, linkType: null },
    ospf: { pid: null, area: null, cost: null, priority: null, network: null, hello: null, dead: null },
    helpers: [], nat: null, aclIn: null, aclOut: null,
    hsrp: { version: 1, groups: {} },
    ipv6: [], ipv6LinkLocal: null, ipv6Enabled: false, ipv6Auto: false, ipv6Dhcp: false,
    encap: null, snoopTrust: false, snoopRate: null, daiTrust: false, cdp: true, lldpTx: true, lldpRx: true,
  };
}

export function createDevice({ name, type = "router", hostname, ports, mac } = {}) {
  const dev = {
    name: name ?? hostname ?? DEFAULT_NAME[type],
    type,
    hostname: hostname ?? DEFAULT_NAME[type],
    mac: mac ?? "0001.42a3." + ((name ?? type).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7)).toString(16).padStart(4, "0"),
    enableSecret: null, enablePassword: null, passwordEncryption: false,
    banner: null, motdDelimiter: "#",
    domainName: null, nameServers: [], domainLookup: true, hosts: {},
    users: {},
    lines: {
      con: { password: null, login: false, loginLocal: false, execTimeout: null, logSync: false },
      vty: { first: 0, last: 15, password: null, login: false, loginLocal: false, transport: ["telnet", "ssh"], transportSet: false, execTimeout: null, accessClass: null, logSync: false },
    },
    rsa: null, sshVersion: null, sshTimeout: null, sshRetries: null,
    interfaces: {},
    vlans: type === "router" ? {} : { 1: { name: "default" } },
    routes: [], ipRouting: type === "router", ipv6Routing: false, ipv6Routes: [],
    ospf: {}, rip: null, eigrp: {},
    dhcp: { excluded: [], pools: {} },
    snooping: { enabled: false, vlans: [], option82: true }, dai: { vlans: [] },
    acls: {},
    nat: { pools: {}, statics: [], dynamic: [] },
    ntp: { servers: [], master: null, updateCalendar: false }, clock: { timezone: null, set: null },
    logging: { hosts: [], trap: null, buffered: null, console: null, timestamps: false },
    snmp: { communities: {}, location: null, contact: null, hosts: [] },
    stp: { mode: "pvst", vlans: {}, portfastDefault: false, bpduguardDefault: false, bpdufilterDefault: false, loopguardDefault: false, pathcost: "short" },
    errdisable: { causes: [], interval: null },
    cdp: true, lldp: false, defaultGateway: null,
    vtp: { mode: "server", domain: null, version: 1, password: null },
    configRegister: "0x2102", boot: [],
    loadBalance: null,
    saved: null,
    // what was typed, and what it was understood as
    history: [], ran: [],
    // run-time
    mode: "user", ctx: {}, pending: null, debugs: [],
    // the lab fills this: interface -> { device, iface } on the far end
    links: {},
  };
  for (const port of ports ?? PORTS[type]()) dev.interfaces[port] = newInterface(dev, port);
  // end hosts and the provider cloud are always plugged in and on
  if (["pc", "server", "cloud"].includes(type)) for (const f of Object.values(dev.interfaces)) f.shutdown = false;
  return dev;
}

// --- helpers for commands and checks ------------------------------------------------

export function iface(dev, name) {
  return dev.interfaces[name] ?? null;
}

export function sortedInterfaces(dev) {
  return Object.values(dev.interfaces).sort((a, b) => compare(a.name, b.name));
}

