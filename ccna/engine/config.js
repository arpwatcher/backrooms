// show running-config, generated from the device's state in the order IOS
// prints it.

import { sortedInterfaces } from "./state.js";
import { compressIpv6 } from "./ip.js";

// Cisco type 7: the real (and famously weak) reversible scheme
const XLAT = "dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87";
export function type7(text, seed = 2) {
  let out = String(seed).padStart(2, "0");
  for (let i = 0; i < text.length; i++) out += (text.charCodeAt(i) ^ XLAT.charCodeAt((seed + i) % XLAT.length)).toString(16).toUpperCase().padStart(2, "0");
  return out;
}

// type 5 looks like an md5-crypt string; this is a stable stand-in
export function type5(text) {
  const abc = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let h = 2166136261;
  let out = "";
  for (let i = 0; i < 22; i++) {
    for (const ch of text + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += abc[h % 64];
  }
  return `$1$${out.slice(0, 4)}$${out.slice(4)}`;
}

const LEVELS = ["emergencies", "alerts", "critical", "errors", "warnings", "notifications", "informational", "debugging"];

function aclAddr(a) {
  if (a.any) return "any";
  if (a.host) return `host ${a.host}`;
  return `${a.net} ${a.wild}`;
}
// IOS prints the well-known ports by name (80 is www), the rest as numbers
const NAMES = {
  tcp: { 20: "ftp-data", 21: "ftp", 23: "telnet", 25: "smtp", 53: "domain", 80: "www", 110: "pop3", 514: "cmd" },
  udp: { 53: "domain", 67: "bootps", 68: "bootpc", 69: "tftp", 123: "ntp", 161: "snmp", 514: "syslog" },
};
function aclPort(p, proto) {
  if (!p) return "";
  const n = (x) => NAMES[proto]?.[x] ?? x;
  return p.op === "range" ? ` range ${n(p.port)} ${n(p.to)}` : ` ${p.op} ${n(p.port)}`;
}
export function aceText(e, standard) {
  if (standard) return `${e.action} ${e.src.any ? "any" : e.src.host ? (e.src.host) : `${e.src.net} ${e.src.wild}`}${e.log ? " log" : ""}`;
  return `${e.action} ${e.proto} ${aclAddr(e.src)}${aclPort(e.srcPort, e.proto)} ${aclAddr(e.dst)}${aclPort(e.dstPort, e.proto)}${e.icmp ? " " + e.icmp : ""}${e.established ? " established" : ""}${e.log ? " log" : ""}`;
}

function interfaceBlock(dev, f) {
  const lines = [`interface ${f.name}`];
  const add = (l) => lines.push(" " + l);
  if (f.description) add(`description ${f.description}`);
  if (f.encap) add(`encapsulation dot1Q ${f.encap.vlan}${f.encap.native ? " native" : ""}`);
  if (dev.type !== "router" && f.switchport && /^(Fast|Gigabit)Ethernet|^Port-channel/.test(f.name)) {
    if (dev.type === "l3switch" && f.trunkEncap !== "negotiate") add(`switchport trunk encapsulation ${f.trunkEncap}`);
    if (f.accessVlan !== 1) add(`switchport access vlan ${f.accessVlan}`);
    if (f.nativeVlan !== 1) add(`switchport trunk native vlan ${f.nativeVlan}`);
    if (f.allowed) add(`switchport trunk allowed vlan ${rangeText(f.allowed) || "none"}`);
    if (f.mode && f.mode !== "dynamic auto") add(`switchport mode ${f.mode}`);
    if (f.nonegotiate) add("switchport nonegotiate");
    if (f.voiceVlan) add(`switchport voice vlan ${f.voiceVlan}`);
    if (f.ps.enabled || f.ps.max !== 1 || f.ps.violation !== "shutdown" || f.ps.sticky || f.ps.macs.length) {
      if (f.ps.enabled) add("switchport port-security");
      if (f.ps.max !== 1) add(`switchport port-security maximum ${f.ps.max}`);
      if (f.ps.violation !== "shutdown") add(`switchport port-security violation ${f.ps.violation}`);
      if (f.ps.sticky) add("switchport port-security mac-address sticky");
      for (const m of f.ps.macs) add(`switchport port-security mac-address ${m}`);
    }
  } else if (dev.type === "l3switch" && /^(Fast|Gigabit)Ethernet/.test(f.name)) add("no switchport");
  if (f.channel) {
    if (f.channelProtocol) add(`channel-protocol ${f.channelProtocol}`);
    add(`channel-group ${f.channel.group} mode ${f.channel.mode}`);
  }
  if (f.ip) add(`ip address ${f.ip} ${f.mask}`);
  for (const s of f.secondaries) add(`ip address ${s.ip} ${s.mask} secondary`);
  if (f.dhcp) add("ip address dhcp");
  if (!f.ip && !f.dhcp && dev.type === "router" && !f.switchport && !f.encap && !f.channel) add("no ip address");
  for (const h of f.helpers) add(`ip helper-address ${h}`);
  if (f.aclIn) add(`ip access-group ${f.aclIn} in`);
  if (f.aclOut) add(`ip access-group ${f.aclOut} out`);
  if (f.nat) add(`ip nat ${f.nat}`);
  if (f.ospf.pid) add(`ip ospf ${f.ospf.pid} area ${f.ospf.area}`);
  if (f.ospf.network) add(`ip ospf network ${f.ospf.network}`);
  if (f.ospf.cost) add(`ip ospf cost ${f.ospf.cost}`);
  if (f.ospf.priority !== null) add(`ip ospf priority ${f.ospf.priority}`);
  if (f.ospf.hello) add(`ip ospf hello-interval ${f.ospf.hello}`);
  if (f.ospf.dead) add(`ip ospf dead-interval ${f.ospf.dead}`);
  if (f.hsrp.version === 2) add("standby version 2");
  for (const [g, grp] of Object.entries(f.hsrp.groups)) {
    const n = g === "0" ? "" : `${g} `;
    if (grp.ip) add(`standby ${n}ip ${grp.ip}`);
    if (grp.priority !== 100) add(`standby ${n}priority ${grp.priority}`);
    if (grp.preempt) add(`standby ${n}preempt`);
  }
  if (f.ipv6LinkLocal) add(`ipv6 address ${compressIpv6(f.ipv6LinkLocal)} link-local`);
  for (const a of f.ipv6) add(`ipv6 address ${compressIpv6(a.eui ? a.addr.split(":").slice(0, 4).join(":") + "::" : a.addr)}/${a.bits}${a.eui ? " eui-64" : ""}`);
  if (f.ipv6Auto) add("ipv6 address autoconfig");
  if (f.ipv6Dhcp) add("ipv6 address dhcp");
  if (f.ipv6Enabled && !f.ipv6.length && !f.ipv6LinkLocal && !f.ipv6Auto && !f.ipv6Dhcp) add("ipv6 enable");
  if (f.snoopTrust) add("ip dhcp snooping trust");
  if (f.snoopRate) add(`ip dhcp snooping limit rate ${f.snoopRate}`);
  if (f.daiTrust) add("ip arp inspection trust");
  if (f.stp.portfast === "edge") add("spanning-tree portfast");
  if (f.stp.portfast === "trunk") add("spanning-tree portfast trunk");
  if (f.stp.portfast === "disable") add("spanning-tree portfast disable");
  if (f.stp.bpduguard === true) add("spanning-tree bpduguard enable");
  if (f.stp.bpduguard === false) add("spanning-tree bpduguard disable");
  if (f.stp.bpdufilter) add("spanning-tree bpdufilter enable");
  if (f.stp.guard) add(`spanning-tree guard ${f.stp.guard}`);
  if (f.stp.cost) add(`spanning-tree cost ${f.stp.cost}`);
  if (f.stp.priority !== null) add(`spanning-tree port-priority ${f.stp.priority}`);
  for (const [v, s] of Object.entries(f.stp.vlan)) {
    if (s.cost) add(`spanning-tree vlan ${v} cost ${s.cost}`);
    if (s.priority !== undefined) add(`spanning-tree vlan ${v} port-priority ${s.priority}`);
  }
  if (f.bandwidth) add(`bandwidth ${f.bandwidth}`);
  if (f.clockRate) add(`clock rate ${f.clockRate}`);
  if (f.speed !== "auto") add(`speed ${f.speed}`);
  if (f.duplex !== "auto") add(`duplex ${f.duplex}`);
  if (!f.cdp) add("no cdp enable");
  if (f.shutdown) add("shutdown");
  return lines.join("\n");
}

export function rangeText(list) {
  if (!list || !list.length) return "";
  const out = [];
  let start = list[0], prev = list[0];
  for (const v of [...list.slice(1), null]) {
    if (v === prev + 1) {
      prev = v;
      continue;
    }
    out.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = v;
  }
  return out.join(",");
}

export function runningConfig(dev, onlyIface) {
  if (onlyIface) {
    const f = dev.interfaces[onlyIface];
    if (!f) return "                        ^\n% Invalid input detected at '^' marker.";
    const body = interfaceBlock(dev, f);
    return `Building configuration...\n\nCurrent configuration : ${body.length + 2} bytes\n!\n${body}\nend`;
  }
  const L = [];
  const bang = () => L.push("!");
  L.push("version 15.1");
  L.push(dev.logging.timestamps ? "service timestamps log datetime msec" : "no service timestamps log datetime msec");
  L.push(dev.passwordEncryption ? "service password-encryption" : "no service password-encryption");
  bang();
  L.push(`hostname ${dev.hostname}`);
  bang();
  if (dev.boot.length) for (const b of dev.boot) L.push(`boot system flash:${b}`);
  if (dev.enableSecret) L.push(`enable secret 5 ${type5(dev.enableSecret)}`);
  if (dev.enablePassword) L.push(`enable password ${dev.passwordEncryption ? "7 " + type7(dev.enablePassword) : dev.enablePassword}`);
  if (dev.enableSecret || dev.enablePassword) bang();
  for (const e of dev.dhcp.excluded) L.push(`ip dhcp excluded-address ${e.from}${e.to !== e.from ? " " + e.to : ""}`);
  if (dev.dhcp.excluded.length) bang();
  for (const [name, p] of Object.entries(dev.dhcp.pools)) {
    L.push(`ip dhcp pool ${name}`);
    if (p.network) L.push(` network ${p.network} ${p.mask}`);
    if (p.router.length) L.push(` default-router ${p.router.join(" ")}`);
    if (p.dns.length) L.push(` dns-server ${p.dns.join(" ")}`);
    if (p.domain) L.push(` domain-name ${p.domain}`);
    if (p.lease) L.push(` lease ${p.lease === "infinite" ? "infinite" : p.lease.join(" ")}`);
    bang();
  }
  if (dev.snooping.enabled) L.push("ip dhcp snooping");
  if (dev.snooping.vlans.length) L.push(`ip dhcp snooping vlan ${rangeText(dev.snooping.vlans)}`);
  if (!dev.snooping.option82) L.push("no ip dhcp snooping information option");
  if (dev.dai.vlans.length) L.push(`ip arp inspection vlan ${rangeText(dev.dai.vlans)}`);
  if (dev.type === "l3switch" && dev.ipRouting) L.push("ip routing");
  if (!dev.domainLookup) L.push("no ip domain-lookup");
  if (dev.domainName) L.push(`ip domain-name ${dev.domainName}`);
  if (dev.nameServers.length) L.push(`ip name-server ${dev.nameServers.join(" ")}`);
  for (const [h, ip] of Object.entries(dev.hosts)) L.push(`ip host ${h} ${ip}`);
  if (dev.ipv6Routing) L.push("ipv6 unicast-routing");
  bang();
  for (const [u, info] of Object.entries(dev.users)) {
    const pw = info.secret ? `secret 5 ${type5(info.pw)}` : dev.passwordEncryption ? `password 7 ${type7(info.pw)}` : `password 0 ${info.pw}`;
    L.push(`username ${u}${info.privilege !== 1 ? ` privilege ${info.privilege}` : ""} ${pw}`);
  }
  if (Object.keys(dev.users).length) bang();
  if (dev.sshVersion) L.push(`ip ssh version ${dev.sshVersion}`);
  if (dev.sshTimeout) L.push(`ip ssh time-out ${dev.sshTimeout}`);
  if (dev.sshRetries !== null && dev.sshRetries !== undefined) L.push(`ip ssh authentication-retries ${dev.sshRetries}`);
  if (dev.type !== "router") {
    L.push(`spanning-tree mode ${dev.stp.mode}`);
    if (dev.stp.portfastDefault) L.push("spanning-tree portfast default");
    if (dev.stp.bpduguardDefault) L.push("spanning-tree portfast bpduguard default");
    if (dev.stp.bpdufilterDefault) L.push("spanning-tree portfast bpdufilter default");
    if (dev.stp.loopguardDefault) L.push("spanning-tree loopguard default");
    if (dev.stp.pathcost === "long") L.push("spanning-tree pathcost method long");
    for (const [v, s] of Object.entries(dev.stp.vlans)) L.push(`spanning-tree vlan ${v} priority ${s.priority}`);
    L.push("spanning-tree extend system-id");
    if (dev.vtp.mode !== "server") L.push(`vtp mode ${dev.vtp.mode}`);
    if (dev.vtp.domain) L.push(`vtp domain ${dev.vtp.domain}`);
    bang();
  }
  for (const c of dev.errdisable.causes) L.push(`errdisable recovery cause ${c}`);
  if (dev.errdisable.interval) L.push(`errdisable recovery interval ${dev.errdisable.interval}`);
  for (const f of sortedInterfaces(dev)) {
    L.push(interfaceBlock(dev, f));
    bang();
  }
  for (const [pid, p] of Object.entries(dev.ospf)) {
    L.push(`router ospf ${pid}`);
    if (p.routerId) L.push(` router-id ${p.routerId}`);
    if (p.refBw) L.push(` auto-cost reference-bandwidth ${p.refBw}`);
    for (const r of p.ranges) L.push(` area ${r.area} range ${r.net} ${r.mask}`);
    if (p.passiveDefault) L.push(" passive-interface default");
    for (const n of p.passive) if (!p.passiveDefault) L.push(` passive-interface ${n}`);
    for (const n of p.notPassive ?? []) if (p.passiveDefault) L.push(` no passive-interface ${n}`);
    for (const n of p.networks) L.push(` network ${n.net} ${n.wild} area ${n.area}`);
    if (p.defaultOriginate) L.push(` default-information originate${p.defaultOriginate === "always" ? " always" : ""}`);
    if (p.maxPaths) L.push(` maximum-paths ${p.maxPaths}`);
    bang();
  }
  if (dev.rip) {
    L.push("router rip");
    if (dev.rip.version === 2) L.push(" version 2");
    for (const n of dev.rip.passive) L.push(` passive-interface ${n}`);
    for (const n of dev.rip.networks) L.push(` network ${n.net}`);
    if (dev.rip.defaultOriginate) L.push(" default-information originate");
    if (!dev.rip.autoSummary) L.push(" no auto-summary");
    bang();
  }
  for (const [as, e] of Object.entries(dev.eigrp)) {
    L.push(`router eigrp ${as}`);
    if (e.routerId) L.push(` eigrp router-id ${e.routerId}`);
    for (const n of e.passive) L.push(` passive-interface ${n}`);
    for (const n of e.networks) L.push(` network ${n.net}${n.wild ? " " + n.wild : ""}`);
    if (e.autoSummary) L.push(" auto-summary");
    bang();
  }
  for (const [name, p] of Object.entries(dev.nat.pools)) L.push(`ip nat pool ${name} ${p.start} ${p.end} netmask ${p.mask}`);
  for (const d of dev.nat.dynamic) L.push(`ip nat inside source list ${d.acl} ${d.pool ? "pool " + d.pool : "interface " + d.out}${d.overload ? " overload" : ""}`);
  for (const s of dev.nat.statics) L.push(s.proto ? `ip nat inside source static ${s.proto} ${s.local} ${s.lport} ${s.global} ${s.gport}` : `ip nat inside source static ${s.local} ${s.global}`);
  if (dev.http) L.push("ip http server");
  L.push("ip classless");
  for (const r of dev.routes) L.push(`ip route ${r.net} ${r.mask} ${r.out ?? ""}${r.out && r.via ? " " : ""}${r.via ?? ""}${r.ad !== 1 ? " " + r.ad : ""}`);
  for (const r of dev.ipv6Routes) L.push(`ipv6 route ${compressIpv6(r.addr)}/${r.bits} ${r.out ?? ""}${r.out && r.via ? " " : ""}${r.via ? compressIpv6(r.via) : ""}${r.ad !== 1 ? " " + r.ad : ""}`);
  if (dev.type !== "router" && dev.defaultGateway) L.push(`ip default-gateway ${dev.defaultGateway}`);
  bang();
  for (const [name, acl] of Object.entries(dev.acls)) {
    if (acl.named) {
      L.push(`ip access-list ${acl.type} ${name}`);
      for (const r of acl.remarks ?? []) L.push(` remark ${r}`);
      for (const e of acl.entries) L.push(` ${aceText(e, acl.type === "standard")}`);
    } else {
      for (const r of acl.remarks ?? []) L.push(`access-list ${name} remark ${r}`);
      for (const e of acl.entries) L.push(`access-list ${name} ${aceText(e, acl.type === "standard")}`);
    }
  }
  if (Object.keys(dev.acls).length) bang();
  if (!dev.cdp) L.push("no cdp run");
  if (dev.lldp) L.push("lldp run");
  for (const h of dev.logging.hosts) L.push(`logging host ${h}`);
  if (dev.logging.trap !== null) L.push(`logging trap ${LEVELS[dev.logging.trap]}`);
  if (dev.logging.buffered) L.push(`logging buffered ${dev.logging.buffered.size}${dev.logging.buffered.level !== 7 ? " " + LEVELS[dev.logging.buffered.level] : ""}`);
  if (dev.logging.console !== null) L.push(dev.logging.console === "off" ? "no logging console" : `logging console ${LEVELS[dev.logging.console]}`);
  for (const [name, c] of Object.entries(dev.snmp.communities)) L.push(`snmp-server community ${name} ${c.access.toUpperCase()}${c.acl ? " " + c.acl : ""}`);
  if (dev.snmp.location) L.push(`snmp-server location ${dev.snmp.location}`);
  if (dev.snmp.contact) L.push(`snmp-server contact ${dev.snmp.contact}`);
  for (const h of dev.snmp.hosts) L.push(`snmp-server host ${h.ip} ${h.community}`);
  bang();
  const d = dev.motdDelimiter === "#" ? "^C" : "^C";
  if (dev.banner !== null) L.push(`banner motd ${d}${dev.banner}${d}`);
  if (dev.bannerLogin) L.push(`banner login ${d}${dev.bannerLogin}${d}`);
  bang();
  const line = (name, l, extra = []) => {
    L.push(name);
    if (l.execTimeout) L.push(` exec-timeout ${l.execTimeout.min} ${l.execTimeout.sec}`);
    if (l.password) L.push(` password ${dev.passwordEncryption ? "7 " + type7(l.password) : l.password}`);
    if (l.logSync) L.push(" logging synchronous");
    if (l.loginLocal) L.push(" login local");
    else if (l.login) L.push(" login");
    for (const e of extra) L.push(e);
  };
  line("line con 0", dev.lines.con);
  if (dev.type === "router") line("line aux 0", dev.lines.aux ?? {});
  const v = dev.lines.vty;
  line(`line vty ${v.first} ${v.last}`, v, [
    ...(v.accessClass ? [` access-class ${v.accessClass} in`] : []),
    ...(v.transportSet ? [` transport input ${v.transport.length === 2 ? "all" : v.transport.length ? v.transport[0] : "none"}`] : []),
  ]);
  bang();
  for (const s of dev.ntp.servers) L.push(`ntp server ${s.ip}${s.prefer ? " prefer" : ""}`);
  if (dev.ntp.master) L.push(`ntp master${dev.ntp.master !== 8 ? " " + dev.ntp.master : ""}`);
  if (dev.ntp.updateCalendar) L.push("ntp update-calendar");
  if (dev.clock.timezone) L.push(`clock timezone ${dev.clock.timezone.zone} ${dev.clock.timezone.hours}${dev.clock.timezone.minutes ? " " + dev.clock.timezone.minutes : ""}`);
  bang();
  L.push("end");
  const body = L.join("\n");
  return `Building configuration...\n\nCurrent configuration : ${body.length} bytes\n!\n${body}`;
}
