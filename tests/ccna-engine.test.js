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
