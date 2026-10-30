import test from "node:test";
import assert from "node:assert/strict";
import { createDevice, exec, prompt } from "../ccna/engine/device.js";
import { type7, runningConfig } from "../ccna/engine/config.js";
import { wildcardBits, network, expandIpv6, compressIpv6, eui64 } from "../ccna/engine/ip.js";
import { normalize, expandRange } from "../ccna/engine/iface.js";

const router = () => {
  const d = createDevice({ name: "R1", type: "router", hostname: "R1" });
  exec(d, "enable");
  return d;
};

test("abbreviations are accepted the way IOS accepts them", () => {
  const d = router();
  exec(d, "conf t");
  assert.equal(prompt(d), "R1(config)#");
  exec(d, "int g0/0");
  assert.equal(prompt(d), "R1(config-if)#");
  exec(d, "ip add 10.0.0.1 255.255.255.0");
  exec(d, "no shut");
  assert.equal(d.interfaces["GigabitEthernet0/0"].ip, "10.0.0.1");
  assert.equal(d.interfaces["GigabitEthernet0/0"].shutdown, false);
});

test("an ambiguous prefix, a bad keyword and a short command get IOS's errors", () => {
  const d = router();
  assert.match(exec(d, "s"), /% Ambiguous command/);
  assert.match(exec(d, "show ip intx brief"), /\^\n% Invalid input detected at '\^' marker\./);
  exec(d, "configure terminal");
  assert.match(exec(d, "hostname"), /% Incomplete command\./);
});

test("config modes, do, and leaving them", () => {
  const d = router();
  exec(d, "configure terminal");
  exec(d, "router ospf 1");
  assert.equal(prompt(d), "R1(config-router)#");
  // a global command from a sub-mode drops back to config, as IOS does
  exec(d, "hostname EDGE");
  assert.equal(prompt(d), "EDGE(config)#");
  assert.match(exec(d, "do show running-config | include hostname"), /hostname EDGE/);
  exec(d, "end");
  assert.equal(prompt(d), "EDGE#");
});

test("the running config is written back in IOS form", () => {
  const d = router();
  exec(d, "configure terminal");
  exec(d, "interface g0/1");
  exec(d, "description to ISP");
  exec(d, "ip address 203.0.113.2 255.255.255.252");
  const run = runningConfig(d);
  assert.match(run, /interface GigabitEthernet0\/1\n description to ISP\n ip address 203\.0\.113\.2 255\.255\.255\.252\n shutdown/);
});

test("type 7 is the real reversible cipher", () => {
  assert.equal(type7("cisco"), "02050D480809");
});

test("address helpers", () => {
  assert.equal(wildcardBits("0.0.0.255"), 24);
  assert.equal(network("192.168.1.77", 26), "192.168.1.64");
  assert.equal(compressIpv6(expandIpv6("2001:0db8:0000:0000:0000:0000:0000:0001")), "2001:DB8::1");
  assert.equal(eui64("2001:db8:1::", "0050.7966.6800"), expandIpv6("2001:db8:1:0:250:79ff:fe66:6800"));
});

test("interface names and ranges", () => {
  assert.equal(normalize("fa0/1"), "FastEthernet0/1");
  assert.equal(normalize("Gi0/0.10"), "GigabitEthernet0/0.10");
  assert.deepEqual(expandRange("fa0/1 - 3, g0/1"), ["FastEthernet0/1", "FastEthernet0/2", "FastEthernet0/3", "GigabitEthernet0/1"]);
});

test("a PC's terminal answers like its operating system", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const lab = (id) => buildLab(LABS.find((l) => l.id === id));
  const win = lab("win-ipconfig").devices.PC1;
  assert.equal(prompt(win), "C:\\Users\\student>");
  assert.match(exec(win, "IPCONFIG"), /IPv4 Address\. \. \. \. \. \. \. \. \. \. \. : 10\.10\.10\.21/);
  assert.match(exec(win, "traceroute 10.10.10.1"), /'traceroute' is not recognized as an internal or external command/);
  const lnx = lab("linux-ip-route").devices.PC1;
  assert.match(exec(lnx, "ip r"), /^default via 10\.10\.10\.1 dev eth0/);
  assert.equal(exec(lnx, "ipconfig"), "ipconfig: command not found");
  const mac = lab("mac-ifconfig").devices.PC1;
  assert.match(exec(mac, "ifconfig en0"), /netmask 0xffffff00/);
});

test("a DHCP client gets APIPA with no server, and a lease once a pool exists", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const l = buildLab(LABS.find((x) => x.id === "win-apipa"));
  const pc = l.devices.PC1, r1 = l.devices.R1;
  assert.match(exec(pc, "ipconfig"), /Autoconfiguration IPv4 Address\. \. : 169\.254\./);
  assert.match(exec(pc, "ipconfig /renew"), /unable to contact your DHCP server/);
  for (const line of ["enable", "configure terminal", "ip dhcp pool LAN", "network 10.10.10.0 255.255.255.0", "default-router 10.10.10.1"]) exec(r1, line);
  assert.match(exec(pc, "ipconfig /renew"), /IPv4 Address[ .]+: 10\.10\.10\.\d+\n[^\n]*\n\s+Default Gateway[ .]+: 10\.10\.10\.1/);
});

test("with no route off the subnet, a PC says so instead of timing out", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const win = buildLab(LABS.find((x) => x.id === "win-apipa")).devices.PC1;
  assert.match(exec(win, "ping 10.10.20.80"), /PING: transmit failed\. General failure\./);
  assert.equal(exec(win, "tracert 10.10.20.80"), "Unable to contact IP driver. General failure.");
  const lnx = buildLab(LABS.find((x) => x.id === "linux-ip-route")).devices.PC1;
  lnx.host.gw = null;
  assert.equal(exec(lnx, "ping -c 4 10.10.20.80"), "ping: connect: Network is unreachable");
  assert.match(exec(lnx, "ping -c 1 10.10.10.1"), /1 received/);
});

test("root primary goes under a lower root, or says it cannot", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const l = buildLab(LABS.find((x) => x.id === "stp-priority"));
  for (const [name, p] of [["SW3", 8192], ["SW1", null]]) {
    const d = l.devices[name];
    exec(d, "enable");
    exec(d, "configure terminal");
    if (p) exec(d, `spanning-tree vlan 1 priority ${p}`);
  }
  exec(l.devices.SW1, "spanning-tree vlan 1 root primary");
  assert.equal(l.devices.SW1.stp.vlans[1].priority, 4096);
  exec(l.devices.SW3, "spanning-tree vlan 1 priority 0");
  assert.match(exec(l.devices.SW1, "spanning-tree vlan 1 root primary"), /% Failed to make the bridge root for vlan 1/);
});

test("spanning tree blocks one port of a triangle, on the switch with the higher bridge ID", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const { stpPorts } = await import("../ccna/engine/net.js");
  const l = buildLab(LABS.find((x) => x.id === "stp-read"));
  const roles = (s) => Object.fromEntries(stpPorts(l.devices[s], 1).ports.map((p) => [p.f.name, `${p.role} ${p.state}`]));
  assert.deepEqual(roles("SW1"), { "GigabitEthernet0/1": "Desg FWD", "GigabitEthernet0/2": "Desg FWD" });
  assert.deepEqual(roles("SW2"), { "GigabitEthernet0/1": "Root FWD", "GigabitEthernet0/2": "Desg FWD" });
  assert.deepEqual(roles("SW3"), { "GigabitEthernet0/1": "Root FWD", "GigabitEthernet0/2": "Altn BLK" });
  exec(l.devices.SW3, "enable");
  assert.match(exec(l.devices.SW3, "show spanning-tree vlan 1"), /Cost {8}4\n {13}Port {8}25 \(GigabitEthernet0\/1\)/);
});

test("a PC reaches its gateway only through the right VLAN, trunk and subinterface", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { cfg, R, S, HOST } = await import("../ccna/labs/kit.js");
  const def = (pcVlan, allowed) => ({
    id: "t", tasks: [], solution: {},
    devices: [
      R("R1", 50, 10, cfg("interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 10.1.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 10.1.20.1 255.255.255.0")),
      S("SW1", 50, 30, cfg("vlan 10", "vlan 20", "interface fa0/1", "switchport mode access", `switchport access vlan ${pcVlan}`, "interface g0/1", "switchport mode trunk", ...(allowed ? [`switchport trunk allowed vlan ${allowed}`] : []))),
      HOST("PC1", 50, 50, "windows", { ip: "10.1.10.11/24", gateway: "10.1.10.1" }),
      HOST("PC2", 70, 50, "linux", { ip: "10.1.20.11/24", gateway: "10.1.20.1" }),
    ],
    links: [["R1", "g0/0", "SW1", "g0/1"], ["SW1", "fa0/1", "PC1", "fa0"], ["SW1", "fa0/2", "PC2", "fa0"]],
  });
  const ok = (l) => /Received = 4/.test(exec(l.devices.PC1, "ping 10.1.10.1"));
  assert.equal(ok(buildLab(def(10))), true);
  assert.equal(ok(buildLab(def(20))), false, "wrong access VLAN");
  assert.equal(ok(buildLab(def(10, "20"))), false, "VLAN not allowed on the trunk");
  // PC2 sits on an access port left in VLAN 1, so it reaches nothing
  const l = buildLab(def(10));
  assert.match(exec(l.devices.PC2, "ping -c 1 10.1.20.1"), /0 received/);
  // inter-VLAN: PC1 to the other subinterface's address works through the router
  assert.equal(/Received = 4/.test(exec(l.devices.PC1, "ping 10.1.20.1")), true);
});

test("an HSRP virtual IP answers as a gateway, with the virtual MAC", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const { cfg, HOST } = await import("../ccna/labs/kit.js");
  const base = LABS.find((x) => x.id === "hsrp-priority");
  const def = { ...base, devices: base.devices.map((d) => (d.name === "PC1" ? HOST("PC1", d.x, d.y, "windows", { ip: "10.10.10.50/24", gateway: "10.10.10.1" }) : d)) };
  const l = buildLab(def);
  const pc = l.devices.PC1;
  assert.match(exec(pc, "ping 10.10.10.1"), /Received = 4/);
  assert.match(exec(pc, "arp -a"), /10\.10\.10\.1\s+00-00-0c-07-ac-01\s+dynamic/);
});

test("a ping off the subnet needs a route there and a route back", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { cfg, R, HOST } = await import("../ccna/labs/kit.js");
  const def = (backRoute) => ({
    id: "t", tasks: [], solution: {},
    devices: [
      R("R1", 20, 20, cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "ip route 10.2.2.0 255.255.255.0 10.0.12.2")),
      R("R2", 70, 20, cfg("interface g0/0", "ip address 10.2.2.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", ...(backRoute ? ["ip route 10.1.1.0 255.255.255.0 10.0.12.1"] : []))),
      HOST("PC1", 20, 50, "linux", { ip: "10.1.1.10/24", gateway: "10.1.1.1" }),
      HOST("PC2", 70, 50, "windows", { ip: "10.2.2.10/24", gateway: "10.2.2.1" }),
    ],
    links: [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"], ["R2", "g0/0", "PC2", "fa0"]],
  });
  assert.match(exec(buildLab(def(false)).devices.PC1, "ping -c 2 10.2.2.10"), /0 received/);
  const l = buildLab(def(true));
  assert.match(exec(l.devices.PC1, "ping -c 2 10.2.2.10"), /2 received/);
  assert.match(exec(l.devices.PC1, "traceroute 10.2.2.10"), / 1  10\.1\.1\.1 .*\n 2  10\.0\.12\.2 .*\n 3  10\.2\.2\.10 /);
});

test("ospf routes come from the adjacencies that are up, and beat a floating static", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { cfg, R, PC } = await import("../ccna/labs/kit.js");
  const { routeTable } = await import("../ccna/engine/show.js");
  const def = (area2) => ({
    id: "t", tasks: [], solution: {},
    devices: [
      R("R1", 20, 20, cfg("interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "ip route 10.2.2.0 255.255.255.0 10.0.12.2 200", "router ospf 1", "network 10.0.12.0 0.0.0.3 area 0")),
      R("R2", 70, 20, cfg("interface g0/0", "ip address 10.2.2.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface lo0", "ip address 2.2.2.2 255.255.255.255", "router ospf 1", `network 10.0.12.0 0.0.0.3 area ${area2}`, "network 10.2.2.0 0.0.0.255 area 0", "network 2.2.2.2 0.0.0.0 area 0")),
      PC("PC2", 70, 50, "10.2.2.10/24", "10.2.2.1"),
    ],
    // (a LAN interface with nothing plugged in is down, and ospf leaves it out)
    links: [["R1", "g0/1", "R2", "g0/1"], ["R2", "g0/0", "PC2", "fa0"]],
  });
  const up = routeTable(buildLab(def(0)).devices.R1);
  assert.deepEqual(up.filter((r) => r.code === "O").map((r) => `${r.net}/${r.bits} [${r.ad}/${r.metric}] via ${r.via}`).sort(), ["10.2.2.0/24 [110/2] via 10.0.12.2", "2.2.2.2/32 [110/2] via 10.0.12.2"]);
  assert.ok(!up.some((r) => r.code === "S"), "the floating static stays out");
  // an area mismatch: no adjacency, no ospf routes, the floating static comes in
  const down = routeTable(buildLab(def(1)).devices.R1);
  assert.ok(!down.some((r) => r.code.startsWith("O")));
  assert.ok(down.some((r) => r.code === "S" && r.net === "10.2.2.0" && r.ad === 200));
});

test("a private address gets no answer from the Internet without NAT", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const l = buildLab(LABS.find((x) => x.id === "ch-edge-policy"));
  const r1 = l.devices.R1;
  for (const c of ["enable", "configure terminal", "ip route 0.0.0.0 0.0.0.0 203.0.113.1"]) exec(r1, c);
  assert.match(exec(l.devices.PC1, "ping 8.8.8.8"), /Received = 0/);
  for (const c of ["interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "exit", "access-list 1 permit 192.168.10.0 0.0.0.255", "ip nat inside source list 1 interface g0/1 overload"]) exec(r1, c);
  assert.match(exec(l.devices.PC1, "ping 8.8.8.8"), /Received = 4/);
  // the ping left its translation behind, and clearing removes it
  exec(r1, "end");
  assert.match(exec(r1, "show ip nat translations"), /icmp 203\.0\.113\.\d+:1\s+192\.168\.10\.11:1\s+8\.8\.8\.8:1\s+8\.8\.8\.8:1/);
  assert.match(exec(r1, "show ip nat statistics"), /Total active translations: 1 \(0 static, 1 dynamic; 1 extended\)/);
  exec(r1, "clear ip nat translation *");
  assert.doesNotMatch(exec(r1, "show ip nat translations"), /icmp/);
});

test("a port-channel of two gig links costs 3 in spanning tree and is port 65", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { S, cfg } = await import("../ccna/labs/kit.js");
  const po = ["interface range g0/1 - 2", "channel-group 1 mode active", "interface port-channel 1", "switchport mode trunk"];
  const l = buildLab({ id: "t", tasks: [], solution: {}, devices: [S("SW1", 20, 20, cfg(...po, "exit", "spanning-tree vlan 1 root primary")), S("SW2", 70, 20, cfg(...po))], links: [["SW1", "g0/1", "SW2", "g0/1"], ["SW1", "g0/2", "SW2", "g0/2"]] });
  const out = exec(l.devices.SW2, "show spanning-tree vlan 1");
  assert.match(out, /Po1\s+Root FWD 3\s+128\.65/);
  assert.match(out, /Cost\s+3\n\s+Port\s+65 \(Port-channel1\)/);
  assert.match(exec(l.devices.SW2, "show spanning-tree interface g0/1"), /no spanning tree info available for GigabitEthernet0\/1/);
});

test("a DHCP lease shows on the server until the PC releases it", async () => {
  const { buildLab, runSolution } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const l = buildLab(LABS.find((x) => x.id === "ch-dhcp-sites"));
  runSolution(l);
  const r1 = l.devices.R1;
  exec(r1, "end");
  assert.match(exec(r1, "show ip dhcp binding"), /10\.20\.20\.21\s+0100\.5079\.6668\.42/);
  assert.match(exec(r1, "show ip dhcp pool BRANCH"), /10\.20\.20\.22\s+10\.20\.20\.1\s+- 10\.20\.20\.254\s+1 \/ 20 \/ 254/);
  assert.doesNotMatch(exec(r1, "show ip dhcp pool BRANCH"), /Pool HQ/);
  exec(l.devices.PC2, "ipconfig /release");
  assert.doesNotMatch(exec(r1, "show ip dhcp binding"), /10\.20\.20\.21/);
});

test("a member that differs from its port-channel is suspended, and po settings reach the members", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { S, cfg } = await import("../ccna/labs/kit.js");
  const po = ["interface range fa0/23 - 24", "switchport mode trunk", "channel-group 1 mode active"];
  const l = buildLab({ id: "t", tasks: [], solution: {}, devices: [S("SW1", 20, 20, cfg(...po)), S("SW2", 70, 20, cfg(...po, "interface fa0/24", "switchport trunk allowed vlan 10"))], links: [["SW1", "fa0/23", "SW2", "fa0/23"], ["SW1", "fa0/24", "SW2", "fa0/24"]] });
  const sw2 = l.devices.SW2;
  assert.match(exec(sw2, "show etherchannel summary"), /Po1\(SU\)\s+LACP\s+Fa0\/23\(P\) Fa0\/24\(s\)/);
  for (const c of ["enable", "configure terminal", "interface port-channel 1", "switchport trunk allowed vlan 10,20", "end"]) exec(sw2, c);
  assert.match(exec(sw2, "show etherchannel summary"), /Fa0\/23\(P\) Fa0\/24\(P\)/);
  assert.match(exec(sw2, "show running-config interface fa0/24"), /switchport trunk allowed vlan 10,20/);
});

test("show ip route groups subnets under their classful network, like IOS 15", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { R, PC: pc, cfg } = await import("../ccna/labs/kit.js");
  const l = buildLab({ id: "t", tasks: [], solution: {}, devices: [R("R1", 20, 20), R("R2", 70, 20, cfg("interface g0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown")), pc("PC1", 20, 60, "192.168.1.10/24", "192.168.1.1")], links: [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"]] });
  const r = l.devices.R1;
  exec(r, "enable");
  for (const c of ["configure terminal", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "exit", "ip route 192.168.4.0 255.255.255.0 10.0.12.2", "ip route 0.0.0.0 0.0.0.0 10.0.12.2", "end"]) exec(r, c);
  const out = exec(r, "show ip route");
  assert.match(out, /\nS\*    0\.0\.0\.0\/0 \[1\/0\] via 10\.0\.12\.2/);
  assert.match(out, /\n      10\.0\.0\.0\/8 is variably subnetted, 2 subnets, 2 masks\nC        10\.0\.12\.0\/30/);
  assert.match(out, /\n      192\.168\.1\.0\/24 is variably subnetted, 2 subnets, 2 masks\n/);
  assert.match(out, /\nS     192\.168\.4\.0\/24 \[1\/0\] via 10\.0\.12\.2/);
  // a filtered view keeps the legend and the headings
  const st = exec(r, "show ip route static");
  assert.match(st, /^Codes:/);
  assert.doesNotMatch(st, /directly connected/);
});

test("a router's ping loses the first packet to ARP, needs a real target and a route back", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { LABS } = await import("../ccna/labs/index.js");
  const l = buildLab(LABS.find((x) => x.id === "ch-backup-oneway"));
  const { R1, R4 } = l.devices;
  for (const c of ["enable", "configure terminal", "ip route 192.168.4.0 255.255.255.0 10.0.12.2", "end"]) exec(R1, c);
  assert.match(exec(R1, "ping 192.168.1.10"), /\n\.!!!!\nSuccess rate is 80 percent \(4\/5\)/);
  assert.match(exec(R1, "ping 192.168.1.10"), /\n!!!!!\nSuccess rate is 100 percent/);
  assert.match(exec(R1, "ping 192.168.1.99"), /Success rate is 0 percent/);
  // R4 has no route back to 10.0.12.1, so neither it nor PC4 answers
  assert.match(exec(R1, "ping 192.168.4.10"), /Success rate is 0 percent/);
  assert.match(exec(R1, "traceroute 192.168.4.10"), /  1 10\.0\.12\.2 .*\n  2  \*  \*  \*/);
  for (const c of ["enable", "configure terminal", "ip route 0.0.0.0 0.0.0.0 10.0.24.1", "end"]) exec(R4, c);
  assert.match(exec(R1, "traceroute 192.168.4.10"), /  2 10\.0\.24\.2 .*\n  3 192\.168\.4\.10 /);
});

test("ACLs filter pings and DHCP, and the first matching entry decides", async () => {
  const { buildLab } = await import("../ccna/engine/lab.js");
  const { R, HOST, cfg } = await import("../ccna/labs/kit.js");
  const l = buildLab({
    id: "t", tasks: [], solution: {},
    devices: [
      R("R1", 50, 0, cfg("interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.2.2.1 255.255.255.0", "no shutdown", "exit", "ip dhcp pool LAN", "network 10.1.1.0 255.255.255.0", "default-router 10.1.1.1")),
      HOST("PC1", 20, 40, "windows", { dhcp: true, mac: "0050.7966.6891" }),
      HOST("PC2", 80, 40, "windows", { ip: "10.2.2.10/24", gateway: "10.2.2.1", mac: "0050.7966.6892" }),
    ],
    links: [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "PC2", "fa0"]],
  });
  const { R1, PC1, PC2 } = l.devices;
  const cmds = (...lines) => lines.forEach((c) => exec(R1, c));
  assert.match(exec(PC1, "ipconfig /renew"), /10\.1\.1\.\d+/);
  assert.match(exec(PC1, "ping 10.2.2.10"), /Received = 4/);
  // outbound towards PC2: echoes from 10.1.1.0/24 dropped
  cmds("enable", "configure terminal", "access-list 101 deny icmp 10.1.1.0 0.0.0.255 any echo", "access-list 101 permit ip any any", "interface g0/1", "ip access-group 101 out");
  assert.match(exec(PC1, "ping 10.2.2.10"), /Received = 0/);
  // the reply direction is a different packet: PC2's own pings still work
  assert.match(exec(PC2, "ping 10.1.1.1"), /Received = 4/);
  cmds("no ip access-group 101 out", "exit");
  assert.match(exec(PC1, "ping 10.2.2.10"), /Received = 4/);
  // inbound on the LAN, permitting only the subnet: the Discover comes from 0.0.0.0
  cmds("access-list 10 permit 10.1.1.0 0.0.0.255", "interface g0/0", "ip access-group 10 in", "end");
  exec(PC1, "ipconfig /release");
  assert.match(exec(PC1, "ipconfig /renew"), /unable to contact your DHCP server/);
});

test("ACL entries print well-known ports by name, and no permit|deny removes one", () => {
  const r = router();
  for (const c of ["configure terminal", "ip access-list extended EDGE", "permit tcp any host 192.0.2.10 eq 80", "permit udp any any eq 53", "permit tcp any any eq 443", "permit icmp any any echo-reply", "no permit icmp any any echo-reply", "end"]) exec(r, c);
  const out = exec(r, "show access-lists EDGE");
  assert.match(out, /10 permit tcp any host 192\.0\.2\.10 eq www/);
  assert.match(out, /20 permit udp any any eq domain/);
  assert.match(out, /30 permit tcp any any eq 443/);
  assert.doesNotMatch(out, /echo-reply/);
});
