// Every command the simulator knows, mode by mode, and what each does to
// the device's configuration. Patterns are in parse.js's little language.

import { compile } from "./parse.js";
import { IosError, newInterface, iface, DEFAULT_NAME } from "./state.js";
import { parseIp, maskBits, wildcardBits, network, broadcast, ipText, parseIpv6Prefix, expandIpv6, eui64 } from "./ip.js";
import { normalize, expandRange, isSub, parentOf, kind, short } from "./iface.js";
import { SHOWS, routeTable } from "./show.js";
import { runningConfig } from "./config.js";
import { status, stpRoot, bridgePriority } from "./net.js";

export const COMMANDS = { user: [], priv: [], config: [], if: [], subif: [], range: [], line: [], router: [], vlan: [], dhcp: [], "acl-std": [], "acl-ext": [] };

const IF_MODES = ["if", "subif", "range"];
const EXEC = ["user", "priv"];

function def(modes, pattern, run, opts = {}) {
  const seqs = compile(pattern);
  for (const mode of [].concat(modes)) COMMANDS[mode].push({ seqs, run, pattern, only: opts.only, mode });
}

const fail = (msg) => {
  throw new IosError(msg);
};

// --- the interface(s) a sub-mode is on --------------------------------------------

function each(c, fn) {
  for (const name of c.dev.ctx.ifaces ?? []) {
    const f = c.dev.interfaces[name];
    fn(f, name);
    // what is set on a layer 2 port-channel is set on its members too
    if (!name.startsWith("Port-channel") || !f?.switchport) continue;
    for (const m of Object.values(c.dev.interfaces)) {
      if (m.channel?.group === Number(name.slice(12))) Object.assign(m, { mode: f.mode, accessVlan: f.accessVlan, nativeVlan: f.nativeVlan, allowed: Array.isArray(f.allowed) ? [...f.allowed] : f.allowed, trunkEncap: f.trunkEncap });
    }
  }
}

const isPhysical = (name) => /^(FastEthernet|GigabitEthernet|Ethernet|Serial)\d/.test(name) && !isSub(name);
const isSwitchPort = (dev, f) => dev.type !== "router" && f.switchport;

// make the interface exist if it can be created here, or say why not
function ensureInterface(c, name) {
  const dev = c.dev;
  if (dev.interfaces[name]) return dev.interfaces[name];
  const k = kind(name);
  if (k === "Loopback" && dev.type !== "switch" && /^Loopback\d+$/.test(name)) return (dev.interfaces[name] = newInterface(dev, name));
  if (k === "Vlan" && dev.type !== "router") {
    const id = Number(name.slice(4));
    if (!(id >= 1 && id <= 4094)) fail("% Invalid input detected at '^' marker.");
    return (dev.interfaces[name] = newInterface(dev, name));
  }
  if (k === "Port-channel" && dev.type !== "router") return (dev.interfaces[name] = { ...newInterface(dev, name), shutdown: false, switchport: true, mode: "dynamic auto" });
  if (isSub(name) && dev.type === "router" && dev.interfaces[parentOf(name)] && isPhysical(parentOf(name))) {
    const sub = newInterface(dev, name);
    sub.shutdown = false;
    return (dev.interfaces[name] = sub);
  }
  return null;
}

// --- exec ----------------------------------------------------------------------------

// enable asks for the enable secret (or password) if one is set: three tries
function askEnable(dev, secret, tries) {
  dev.pending = {
    prompt: "Password: ",
    secret: true,
    answer: (pw, d) => {
      if (pw === secret) {
        d.mode = "priv";
        return "";
      }
      if (tries >= 3) return "% Bad secrets\n";
      askEnable(d, secret, tries + 1);
      return "";
    },
  };
}
def("user", "enable", (c) => {
  const secret = c.dev.enableSecret ?? c.dev.enablePassword;
  if (!secret) return c.mode("priv");
  askEnable(c.dev, secret, 1);
});
def("priv", "enable", () => {});
def("priv", "disable", (c) => c.mode("user"));
def(EXEC, "(exit | logout)", (c) => {
  c.mode("user");
  c.say("\n" + c.dev.hostname + " con0 is now available\n\nPress RETURN to get started.");
});
def("priv", "configure terminal", (c) => {
  c.say("Enter configuration commands, one per line.  End with CNTL/Z.");
  c.mode("config");
});
def("priv", "(copy running-config startup-config | write [memory])", (c) => {
  const save = () => {
    c.dev.saved = snapshotOf(c.dev);
    return "Building configuration...\n[OK]";
  };
  if (c.has("copy")) {
    c.ask({ prompt: "Destination filename [startup-config]? ", answer: (a, d) => (a.trim() === "" || a.trim() === "startup-config" ? save() : "%Error opening flash:" + a.trim()) });
  } else c.say(save());
});
def("priv", "copy startup-config running-config", (c) => {
  c.ask({
    prompt: "Destination filename [running-config]? ",
    answer: (a, d) => {
      if (!d.saved) return "%Error opening nvram:startup-config (No such file or directory)";
      mergeSaved(d);
      return `${(d.savedSize ?? 1024)} bytes copied in 0.416 secs`;
    },
  });
});
def("priv", "copy (running-config | startup-config | flash:) (tftp: | flash: | usbflash0:)", (c) => {
  c.ask({
    prompt: "Address or name of remote host []? ",
    answer: (a, d) => {
      const host = a.trim();
      d.pending = {
        prompt: "Destination filename [" + d.hostname.toLowerCase() + "-confg]? ",
        answer: (f) => {
          const file = f.trim() || d.hostname.toLowerCase() + "-confg";
          d.transfers = [...(d.transfers ?? []), { host, file, from: c.words[1] }];
          return "Writing " + file + "...!!\n[OK - 1024 bytes]";
        },
      };
      return "";
    },
  });
});
def("priv", "(erase startup-config | write erase | erase nvram:)", (c) => {
  c.ask({
    prompt: "Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]",
    answer: (a, d) => {
      if (/^\s*(n|no)\s*$/i.test(a)) return "";
      d.saved = null;
      d.erased = true;
      return "[OK]\nErase of nvram: complete\n%SYS-7-NV_BLOCK_INIT: Initialized the geometry of nvram";
    },
  });
});
def("priv", "reload", (c) => {
  const go = (d) => {
    reloadDevice(d);
    return "\nSystem Bootstrap, Version 15.1(4)M4, RELEASE SOFTWARE (fc1)\n...\n" + (d.saved ? "" : "\n         --- System Configuration Dialog ---\n\nWould you like to enter the initial configuration dialog? [yes/no]: no\n") + "\nPress RETURN to get started!";
  };
  const unsaved = JSON.stringify(stripRuntime(c.dev)) !== JSON.stringify(c.dev.saved ? stripRuntime(c.dev.saved) : null);
  if (unsaved && c.dev.saved !== undefined) {
    c.ask({
      prompt: "System configuration has been modified. Save? [yes/no]: ",
      answer: (a, d) => {
        if (/^\s*y/i.test(a)) d.saved = snapshotOf(d);
        d.pending = { prompt: "Proceed with reload? [confirm]", answer: (b, dd) => (/^\s*n/i.test(b) ? "" : go(dd)) };
        return /^\s*y/i.test(a) ? "Building configuration...\n[OK]" : "";
      },
    });
  } else c.ask({ prompt: "Proceed with reload? [confirm]", answer: (b, d) => (/^\s*n/i.test(b) ? "" : go(d)) });
});
def("priv", "clock set <time:word> (<day:num:1-31> <month:word> | <month:word> <day:num:1-31>) <year:num:1993-2035>", (c) => {
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(c.args.time)) fail("% Invalid input detected at '^' marker.");
  c.dev.clock.set = `${c.args.time} ${c.args.day} ${c.args.month} ${c.args.year}`;
});
def(EXEC, "ping <target:word> [source (<src:ip> | <srci:iface>)] [repeat <n:num:1-2147483647>]", (c) => c.say(ping(c.dev, c.args.target, c.args.n ?? 5)));
def("priv", "ping", (c) => c.say("% Extended ping is not simulated here; give a target: ping <address>"));
def(EXEC, "traceroute <target:word>", (c) => c.say(trace(c.dev, c.args.target)));
def(EXEC, "telnet <target:word>", (c) => c.say(`Trying ${resolve(c.dev, c.args.target) ?? c.args.target} ... Open\n(remote session simulated - nothing to log in to)`));
def(EXEC, "ssh -l <user:word> <target:word>", (c) => c.say(`(SSH to ${c.args.target} as ${c.args.user} simulated)\nPassword:`));
def("priv", "debug <what:rest>", (c) => {
  c.dev.debugs.push(c.args.what);
  c.say(`${c.args.what.replace(/^ip /, "IP ").toUpperCase().startsWith("IP") ? c.args.what : c.args.what} debugging is on`);
});
def("priv", "(undebug all | no debug all)", (c) => {
  c.dev.debugs = [];
  c.say("All possible debugging has been turned off");
});
def("priv", "clear ip ospf process", (c) => c.ask({ prompt: "Reset ALL OSPF processes? [no]: ", answer: (a) => (/^\s*y/i.test(a) ? "" : "") }));
def("priv", "clear mac address-table dynamic", () => {});
def("priv", "clear ip nat translation *", (c) => { c.dev.nat.live = []; });
def("priv", "clear (counters | arp-cache | ip dhcp binding *)", () => {});
def("priv", "terminal (length <n:num:0-512> | monitor | no monitor)", () => {});
def(EXEC, "dir [flash:]", (c) => c.say(SHOWS.flash(c.dev)));
def("priv", "setup", (c) => c.say("--- System Configuration Dialog ---\n(the setup wizard is not simulated; use configure terminal)"));

// --- global configuration ------------------------------------------------------------------

def("config", "hostname <name:word>", (c) => {
  if (!/^[A-Za-z]/.test(c.args.name)) fail("% Hostname contains one or more illegal characters.");
  c.dev.hostname = c.args.name;
});
def("config", "no hostname", (c) => (c.dev.hostname = DEFAULT_NAME[c.dev.type]));
def("config", "enable secret [(0 | 5)] <pw:word>", (c) => (c.dev.enableSecret = c.args.pw));
def("config", "enable password [(0 | 7)] <pw:word>", (c) => {
  c.dev.enablePassword = c.args.pw;
  if (c.dev.enableSecret) c.say("The enable password you have chosen is the same as your enable secret.\nThis is not recommended.  Re-enter the enable password.".slice(0, c.args.pw === c.dev.enableSecret ? 999 : 0));
});
def("config", "no enable (secret | password)", (c) => {
  if (c.has("secret")) c.dev.enableSecret = null;
  else c.dev.enablePassword = null;
});
def("config", "service password-encryption", (c) => (c.dev.passwordEncryption = true));
def("config", "no service password-encryption", (c) => (c.dev.passwordEncryption = false));
def("config", "service timestamps (log | debug) datetime [msec]", (c) => (c.dev.logging.timestamps = true));
def("config", "banner (motd | login | exec) <text:rest>", (c) => {
  const which = c.has("motd") ? "banner" : c.has("login") ? "bannerLogin" : "bannerExec";
  const text = c.args.text;
  const delim = text[0];
  const rest = text.slice(1);
  const end = rest.indexOf(delim);
  if (end >= 0) {
    c.dev[which] = rest.slice(0, end);
    c.dev.motdDelimiter = delim;
    return;
  }
  // the text goes on over more lines until the delimiter comes back
  const lines = rest ? [rest] : [];
  c.say(`Enter TEXT message.  End with the character '${delim}'.`);
  const more = (d) => {
    d.pending = {
      prompt: "",
      answer: (line, dd) => {
        const at = line.indexOf(delim);
        if (at >= 0) {
          lines.push(line.slice(0, at));
          dd[which] = lines.join("\n");
          dd.motdDelimiter = delim;
          return "";
        }
        lines.push(line);
        more(dd);
        return "";
      },
    };
  };
  more(c.dev);
});
def("config", "no banner (motd | login | exec)", (c) => {
  if (c.has("motd")) c.dev.banner = null;
  else if (c.has("login")) c.dev.bannerLogin = null;
  else c.dev.bannerExec = null;
});
def("config", "(ip domain-name | ip domain name) <name:word>", (c) => (c.dev.domainName = c.args.name));
def("config", "no (ip domain-name | ip domain name)", (c) => (c.dev.domainName = null));
def("config", "ip domain-list <name:word>", (c) => (c.dev.domainList = c.args.name));
def("config", "ip name-server <a:ip> [<b:ip>] [<c:ip>]", (c) => {
  for (const s of [c.args.a, c.args.b, c.args.c]) if (s && !c.dev.nameServers.includes(s)) c.dev.nameServers.push(s);
});
def("config", "no ip name-server [<a:ip>]", (c) => (c.dev.nameServers = c.args.a ? c.dev.nameServers.filter((s) => s !== c.args.a) : []));
def("config", "(ip domain-lookup | ip domain lookup)", (c) => (c.dev.domainLookup = true));
def("config", "no (ip domain-lookup | ip domain lookup)", (c) => (c.dev.domainLookup = false));
def("config", "ip host <name:word> <ip:ip>", (c) => (c.dev.hosts[c.args.name] = c.args.ip));
def("config", "no ip host <name:word> [<ip:ip>]", (c) => delete c.dev.hosts[c.args.name]);
def("config", "ip dns server", (c) => (c.dev.dnsServer = true));
def("config", "ip default-gateway <ip:ip>", (c) => (c.dev.defaultGateway = c.args.ip), { only: ["switch", "l3switch"] });
def("config", "no ip default-gateway", (c) => (c.dev.defaultGateway = null), { only: ["switch", "l3switch"] });
def("config", "ip routing", (c) => (c.dev.ipRouting = true), { only: ["l3switch", "router"] });
def("config", "no ip routing", (c) => (c.dev.ipRouting = false), { only: ["l3switch", "router"] });
def("config", "ipv6 unicast-routing", (c) => (c.dev.ipv6Routing = true), { only: ["l3switch", "router"] });
def("config", "no ipv6 unicast-routing", (c) => (c.dev.ipv6Routing = false), { only: ["l3switch", "router"] });
def("config", "username <user:word> [privilege <priv:num:0-15>] (secret | password) [(0 | 5 | 7)] <pw:word>", (c) => {
  c.dev.users[c.args.user] = { pw: c.args.pw, secret: c.has("secret"), privilege: c.args.priv ?? 1 };
});
def("config", "no username <user:word>", (c) => delete c.dev.users[c.args.user]);
def("config", "cdp run", (c) => (c.dev.cdp = true));
def("config", "no cdp run", (c) => (c.dev.cdp = false));
def("config", "lldp run", (c) => (c.dev.lldp = true));
def("config", "no lldp run", (c) => (c.dev.lldp = false));
def("config", "config-register <reg:hex>", (c) => (c.dev.configRegister = c.args.reg));
def("config", "boot system [flash:] <file:word>", (c) => c.dev.boot.push(c.args.file.replace(/^flash:/, "")));
def("config", "no boot system [flash:] [<file:word>]", (c) => (c.dev.boot = []));

// --- entering interfaces ---------------------------------------------------------------

def("config", "interface <name:iface>", (c) => {
  const f = ensureInterface(c, c.args.name);
  if (!f) fail("                     ^\n% Invalid input detected at '^' marker.");
  c.mode(isSub(f.name) ? "subif" : "if", { ifaces: [f.name] });
});
def("config", "interface range <list:rest>", (c) => {
  const names = expandRange(c.args.list);
  if (!names || names.some((n) => !c.dev.interfaces[n])) fail("% Invalid interface range");
  c.mode("range", { ifaces: names });
});
def("config", "no interface <name:iface>", (c) => {
  const n = c.args.name;
  if (/^(Loopback|Vlan|Port-channel)/.test(n) || isSub(n)) delete c.dev.interfaces[n];
  else fail("% Removal of physical interfaces is not permitted");
});

// --- on an interface ------------------------------------------------------------------------

def(IF_MODES, "description <text:rest>", (c) => each(c, (f) => (f.description = c.args.text)));
def(IF_MODES, "no description", (c) => each(c, (f) => (f.description = null)));
def(IF_MODES, "shutdown", (c) =>
  each(c, (f) => {
    const was = f.shutdown;
    f.shutdown = true;
    f.errdisabled = false;
    if (!was) c.say(`%LINK-5-CHANGED: Interface ${f.name}, changed state to administratively down\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${f.name}, changed state to down`);
  }),
);
def(IF_MODES, "no shutdown", (c) =>
  each(c, (f) => {
    const was = f.shutdown;
    f.shutdown = false;
    if (was) {
      const [st, pr] = status(c.dev, f);
      c.say(`%LINK-5-CHANGED: Interface ${f.name}, changed state to ${st === "up" ? "up" : "down"}` + (pr === "up" ? `\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${f.name}, changed state to up` : ""));
    }
  }),
);

function setAddress(c, f, ip, mask, secondary) {
  const dev = c.dev;
  if (dev.type === "switch" && !f.name.startsWith("Vlan")) fail("                ^\n% Invalid input detected at '^' marker.");
  if (dev.type === "l3switch" && f.switchport) fail("% IP addresses may not be configured on L2 links.");
  if (isSub(f.name) && !f.encap) fail("% Configuring IP routing on a LAN subinterface is only allowed if that\nsubinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,\nor ISL vLAN.");
  const bits = maskBits(mask);
  if (bits < 0) fail(`Bad mask 0x${(parseIp(mask) >>> 0).toString(16).toUpperCase()} for address ${ip}`);
  if (bits < 31 && (network(ip, bits) === ip || broadcast(ip, bits) === ip)) fail(`Bad mask /${bits} for address ${ip}`);
  for (const other of Object.values(dev.interfaces)) {
    if (other === f || !other.ip) continue;
    const ob = maskBits(other.mask);
    if (network(ip, Math.min(bits, ob)) === network(other.ip, Math.min(bits, ob))) fail(`% ${network(ip, bits)} overlaps with ${other.name}`);
  }
  if (secondary) f.secondaries.push({ ip, mask });
  else {
    f.ip = ip;
    f.mask = mask;
    f.dhcp = false;
  }
}
def(IF_MODES, "ip address <ip:ip> <mask:mask> [secondary]", (c) => each(c, (f) => setAddress(c, f, c.args.ip, c.args.mask, c.has("secondary"))));
def(IF_MODES, "ip address dhcp", (c) =>
  each(c, (f) => {
    if (c.dev.type === "switch" && !f.name.startsWith("Vlan")) fail("% Invalid input detected at '^' marker.");
    f.dhcp = true;
    f.ip = null;
    f.mask = null;
  }),
);
def(IF_MODES, "no ip address [<ip:ip> <mask:mask>]", (c) =>
  each(c, (f) => {
    f.ip = null;
    f.mask = null;
    f.dhcp = false;
    f.secondaries = [];
  }),
);
def(IF_MODES, "speed (10 | 100 | 1000 | auto)", (c) => each(c, (f) => (f.speed = c.words[1])));
def(IF_MODES, "duplex (full | half | auto)", (c) => each(c, (f) => (f.duplex = c.words[1])));
def(IF_MODES, "no (speed | duplex)", (c) => each(c, (f) => (f[c.words[1]] = "auto")));
def(IF_MODES, "bandwidth <kbps:num:1-10000000>", (c) => each(c, (f) => (f.bandwidth = c.args.kbps)));
def(IF_MODES, "no bandwidth [<kbps:num:1-10000000>]", (c) => each(c, (f) => (f.bandwidth = null)));
def(IF_MODES, "clock rate <rate:num:300-8000000>", (c) =>
  each(c, (f) => {
    if (!f.name.startsWith("Serial")) fail("% Invalid input detected at '^' marker.");
    f.clockRate = c.args.rate;
  }),
);
def(IF_MODES, "mtu <bytes:num:64-9216>", (c) => each(c, (f) => (f.mtu = c.args.bytes)));
def(IF_MODES, "cdp enable", (c) => each(c, (f) => (f.cdp = true)));
def(IF_MODES, "no cdp enable", (c) => each(c, (f) => (f.cdp = false)));
def(IF_MODES, "lldp (transmit | receive)", (c) => each(c, (f) => (f[c.has("transmit") ? "lldpTx" : "lldpRx"] = true)));
def(IF_MODES, "no lldp (transmit | receive)", (c) => each(c, (f) => (f[c.has("transmit") ? "lldpTx" : "lldpRx"] = false)));

// switchports
const SW = ["switch", "l3switch"];
function needSwitchport(c, f) {
  if (!f.switchport) fail("% Command rejected: " + f.name + " is not a switchport.");
}
def(IF_MODES, "switchport mode (access | trunk | dynamic (auto | desirable))", (c) =>
  each(c, (f) => {
    needSwitchport(c, f);
    const mode = c.has("dynamic") ? `dynamic ${c.has("auto") ? "auto" : "desirable"}` : c.has("access") ? "access" : "trunk";
    if (mode === "trunk" && f.trunkEncap === "negotiate") fail('Command rejected: An interface whose trunk encapsulation is "Auto" can not be configured to "trunk" mode.');
    f.mode = mode;
  }), { only: SW });
def(IF_MODES, "no switchport mode", (c) => each(c, (f) => (f.mode = "dynamic auto")), { only: SW });
def(IF_MODES, "switchport access vlan <vlan:num:1-4094>", (c) =>
  each(c, (f) => {
    needSwitchport(c, f);
    f.accessVlan = c.args.vlan;
    if (!c.dev.vlans[c.args.vlan]) {
      c.dev.vlans[c.args.vlan] = { name: `VLAN${String(c.args.vlan).padStart(4, "0")}` };
      c.say(`% Access VLAN does not exist. Creating vlan ${c.args.vlan}`);
    }
  }), { only: SW });
def(IF_MODES, "no switchport access vlan", (c) => each(c, (f) => (f.accessVlan = 1)), { only: SW });
def(IF_MODES, "switchport voice vlan <vlan:num:1-4094>", (c) =>
  each(c, (f) => {
    needSwitchport(c, f);
    f.voiceVlan = c.args.vlan;
    if (!c.dev.vlans[c.args.vlan]) c.dev.vlans[c.args.vlan] = { name: `VLAN${String(c.args.vlan).padStart(4, "0")}` };
  }), { only: SW });
def(IF_MODES, "no switchport voice vlan", (c) => each(c, (f) => (f.voiceVlan = null)), { only: SW });
def(IF_MODES, "switchport trunk encapsulation (dot1q | isl | negotiate)", (c) => each(c, (f) => (f.trunkEncap = c.words[3])), { only: ["l3switch"] });
def(IF_MODES, "switchport trunk native vlan <vlan:num:1-4094>", (c) => each(c, (f) => (f.nativeVlan = c.args.vlan)), { only: SW });
def(IF_MODES, "no switchport trunk native vlan", (c) => each(c, (f) => (f.nativeVlan = 1)), { only: SW });
def(IF_MODES, "switchport trunk allowed vlan (<list:vlist> | add <add:vlist> | remove <remove:vlist> | except <except:vlist> | all | none)", (c) =>
  each(c, (f) => {
    const all = Array.from({ length: 4094 }, (_, i) => i + 1);
    let now = f.allowed ?? all;
    if (c.args.list) now = c.args.list;
    else if (c.args.add) now = [...new Set([...now, ...c.args.add])].sort((a, b) => a - b);
    else if (c.args.remove) now = now.filter((v) => !c.args.remove.includes(v));
    else if (c.args.except) now = all.filter((v) => !c.args.except.includes(v));
    else if (c.has("all")) now = null;
    else now = [];
    f.allowed = now && now.length === 4094 ? null : now;
  }), { only: SW });
def(IF_MODES, "no switchport trunk allowed vlan", (c) => each(c, (f) => (f.allowed = null)), { only: SW });
def(IF_MODES, "switchport nonegotiate", (c) =>
  each(c, (f) => {
    if (f.mode && f.mode.startsWith("dynamic")) fail("Command rejected: Conflict between 'nonegotiate' and 'dynamic' status.");
    f.nonegotiate = true;
  }), { only: SW });
def(IF_MODES, "no switchport nonegotiate", (c) => each(c, (f) => (f.nonegotiate = false)), { only: SW });
def(IF_MODES, "switchport", (c) => each(c, (f) => isPhysical(f.name) && Object.assign(f, { switchport: true, ip: null, mask: null })), { only: ["l3switch"] });
def(IF_MODES, "no switchport", (c) =>
  each(c, (f) => {
    if (!isPhysical(f.name) && !f.name.startsWith("Port-channel")) fail("% Invalid input detected at '^' marker.");
    f.switchport = false;
  }), { only: ["l3switch"] });

// port security
function needAccess(c, f) {
  if (f.mode !== "access") fail(`Command rejected: ${f.name} is a ${f.mode && f.mode.startsWith("dynamic") ? "dynamic" : "trunk"} port.`);
}
def(IF_MODES, "switchport port-security", (c) => each(c, (f) => (needAccess(c, f), (f.ps.enabled = true))), { only: SW });
def(IF_MODES, "no switchport port-security", (c) => each(c, (f) => (f.ps.enabled = false)), { only: SW });
def(IF_MODES, "switchport port-security maximum <n:num:1-132>", (c) => each(c, (f) => (needAccess(c, f), (f.ps.max = c.args.n))), { only: SW });
def(IF_MODES, "switchport port-security violation (protect | restrict | shutdown)", (c) => each(c, (f) => (needAccess(c, f), (f.ps.violation = c.words[3]))), { only: SW });
def(IF_MODES, "switchport port-security mac-address (sticky | <mac:mac>)", (c) =>
  each(c, (f) => {
    needAccess(c, f);
    if (c.has("sticky")) f.ps.sticky = true;
    else if (!f.ps.macs.includes(c.args.mac)) f.ps.macs.push(c.args.mac);
  }), { only: SW });
def(IF_MODES, "switchport port-security aging time <min:num:0-1440>", (c) => each(c, (f) => (f.ps.aging = c.args.min)), { only: SW });

// etherchannel
def(IF_MODES, "channel-group <group:num:1-48> mode (active | passive | on | desirable | auto)", (c) => {
  const pc = `Port-channel${c.args.group}`;
  const made = !c.dev.interfaces[pc];
  if (made) {
    const po = newInterface(c.dev, pc);
    po.shutdown = false;
    po.switchport = c.dev.type !== "router";
    po.mode = po.switchport ? null : null;
    c.dev.interfaces[pc] = po;
    c.say(`Creating a port-channel interface Port-channel ${c.args.group}`);
  }
  each(c, (f) => {
    if (f.channel && f.channel.group !== c.args.group) fail(`% Interface ${f.name} is already part of a channel-group`);
    f.channel = { group: c.args.group, mode: c.words[c.words.length - 1] };
    if (made) {
      const po = c.dev.interfaces[pc];
      Object.assign(po, { switchport: f.switchport, mode: f.mode, accessVlan: f.accessVlan, nativeVlan: f.nativeVlan, allowed: f.allowed, trunkEncap: f.trunkEncap });
    }
  });
}, { only: SW });
def(IF_MODES, "no channel-group", (c) => each(c, (f) => (f.channel = null)), { only: SW });
def(IF_MODES, "channel-protocol (lacp | pagp)", (c) => each(c, (f) => (f.channelProtocol = c.words[1])), { only: SW });
def("config", "port-channel load-balance <how:word>", (c) => (c.dev.loadBalance = c.args.how), { only: SW });

// spanning tree on a port
const PORTFAST_WARNING =
  "%Warning: portfast should only be enabled on ports connected to a single\n host. Connecting hubs, concentrators, switches, bridges, etc... to this\n interface  when portfast is enabled, can cause temporary bridging loops.\n Use with CAUTION";
def(IF_MODES, "spanning-tree portfast [(trunk | edge [trunk])]", (c) =>
  each(c, (f) => {
    f.stp.portfast = c.has("trunk") ? "trunk" : "edge";
    c.say(PORTFAST_WARNING + (f.mode === "trunk" && !c.has("trunk") ? `\n\n%Portfast has been configured on ${f.name} but will only\n have effect when the interface is in a non-trunking mode.` : `\n\n%Portfast has been configured on ${f.name} but will only\n have effect when the interface is in a non-trunking mode.`));
  }), { only: SW });
def(IF_MODES, "(no spanning-tree portfast | spanning-tree portfast disable)", (c) => each(c, (f) => (f.stp.portfast = "disable")), { only: SW });
def(IF_MODES, "spanning-tree bpduguard (enable | disable)", (c) => each(c, (f) => (f.stp.bpduguard = c.has("enable"))), { only: SW });
def(IF_MODES, "no spanning-tree bpduguard", (c) => each(c, (f) => (f.stp.bpduguard = null)), { only: SW });
def(IF_MODES, "spanning-tree bpdufilter (enable | disable)", (c) => each(c, (f) => (f.stp.bpdufilter = c.has("enable"))), { only: SW });
def(IF_MODES, "spanning-tree guard (root | loop | none)", (c) => each(c, (f) => (f.stp.guard = c.words[2] === "none" ? null : c.words[2])), { only: SW });
def(IF_MODES, "spanning-tree cost <cost:num:1-200000000>", (c) => each(c, (f) => (f.stp.cost = c.args.cost)), { only: SW });
def(IF_MODES, "spanning-tree port-priority <p:num:0-240>", (c) =>
  each(c, (f) => {
    if (c.args.p % 16) fail("% Port Priority in increments of 16 is required\n  Allowed values are:\n  0   16  32  48  64  80  96  112 128 144 160 176 192 208 224 240");
    f.stp.priority = c.args.p;
  }), { only: SW });
def(IF_MODES, "spanning-tree vlan <v:vlist> (cost <cost:num:1-200000000> | port-priority <p:num:0-240>)", (c) =>
  each(c, (f) => {
    for (const v of c.args.v) f.stp.vlan[v] = { ...(f.stp.vlan[v] ?? {}), ...(c.args.cost ? { cost: c.args.cost } : { priority: c.args.p }) };
  }), { only: SW });
def(IF_MODES, "spanning-tree link-type (point-to-point | shared)", (c) => each(c, (f) => (f.stp.linkType = c.words[2])), { only: SW });

// dhcp snooping and arp inspection on a port
def(IF_MODES, "ip dhcp snooping trust", (c) => each(c, (f) => (f.snoopTrust = true)), { only: SW });
def(IF_MODES, "no ip dhcp snooping trust", (c) => each(c, (f) => (f.snoopTrust = false)), { only: SW });
def(IF_MODES, "ip dhcp snooping limit rate <pps:num:1-2048>", (c) => each(c, (f) => (f.snoopRate = c.args.pps)), { only: SW });
def(IF_MODES, "ip arp inspection trust", (c) => each(c, (f) => (f.daiTrust = true)), { only: SW });
def(IF_MODES, "no ip arp inspection trust", (c) => each(c, (f) => (f.daiTrust = false)), { only: SW });

// routing on an interface
def(IF_MODES, "ip ospf <pid:num:1-65535> area <area:num:0-4294967295>", (c) => each(c, (f) => Object.assign(f.ospf, { pid: c.args.pid, area: c.args.area })), { only: ["router", "l3switch"] });
def(IF_MODES, "no ip ospf <pid:num:1-65535> area <area:num:0-4294967295>", (c) => each(c, (f) => Object.assign(f.ospf, { pid: null, area: null })), { only: ["router", "l3switch"] });
def(IF_MODES, "ip ospf cost <cost:num:1-65535>", (c) => each(c, (f) => (f.ospf.cost = c.args.cost)), { only: ["router", "l3switch"] });
def(IF_MODES, "ip ospf priority <p:num:0-255>", (c) => each(c, (f) => (f.ospf.priority = c.args.p)), { only: ["router", "l3switch"] });
def(IF_MODES, "ip ospf network (point-to-point | broadcast)", (c) => each(c, (f) => (f.ospf.network = c.words[3])), { only: ["router", "l3switch"] });
def(IF_MODES, "ip ospf hello-interval <s:num:1-65535>", (c) => each(c, (f) => (f.ospf.hello = c.args.s)), { only: ["router", "l3switch"] });
def(IF_MODES, "ip ospf dead-interval <s:num:1-65535>", (c) => each(c, (f) => (f.ospf.dead = c.args.s)), { only: ["router", "l3switch"] });
def(IF_MODES, "no ip ospf (cost | priority | network | hello-interval | dead-interval)", (c) =>
  each(c, (f) => (f.ospf[{ cost: "cost", priority: "priority", network: "network", "hello-interval": "hello", "dead-interval": "dead" }[c.words[3]]] = null)), { only: ["router", "l3switch"] });
def(IF_MODES, "ip summary-address rip <net:ip> <mask:mask>", (c) => each(c, (f) => (f.ripSummary = `${c.args.net} ${c.args.mask}`)), { only: ["router"] });
def(IF_MODES, "ip helper-address <ip:ip>", (c) => each(c, (f) => !f.helpers.includes(c.args.ip) && f.helpers.push(c.args.ip)), { only: ["router", "l3switch"] });
def(IF_MODES, "no ip helper-address [<ip:ip>]", (c) => each(c, (f) => (f.helpers = c.args.ip ? f.helpers.filter((h) => h !== c.args.ip) : [])), { only: ["router", "l3switch"] });
def(IF_MODES, "ip nat (inside | outside)", (c) => each(c, (f) => (f.nat = c.words[2])), { only: ["router"] });
def(IF_MODES, "no ip nat (inside | outside)", (c) => each(c, (f) => (f.nat = null)), { only: ["router"] });
def(IF_MODES, "ip access-group (<n:num:1-2699> | <name:word>) (in | out)", (c) =>
  each(c, (f) => {
    const acl = String(c.args.n ?? c.args.name);
    if (c.has("in")) f.aclIn = acl;
    else f.aclOut = acl;
  }), { only: ["router", "l3switch"] });
def(IF_MODES, "no ip access-group [(<n:num:1-2699> | <name:word>)] (in | out)", (c) => each(c, (f) => (c.has("in") ? (f.aclIn = null) : (f.aclOut = null))), { only: ["router", "l3switch"] });
def("subif", "encapsulation dot1q <vlan:num:1-4094> [native]", (c) => each(c, (f) => (f.encap = { vlan: c.args.vlan, native: c.has("native") })), { only: ["router"] });

// hsrp
def(IF_MODES, "standby version (1 | 2)", (c) => each(c, (f) => (f.hsrp.version = Number(c.words[2]))), { only: ["router", "l3switch"] });
const group = (c) => c.args.g ?? 0;
const hsrpGroup = (f, g) => (f.hsrp.groups[g] ??= { ip: null, priority: 100, preempt: false });
def(IF_MODES, "standby [<g:num:0-4095>] ip <ip:ip>", (c) =>
  each(c, (f) => {
    if (c.args.g > 255 && f.hsrp.version === 1) fail("% Group number must be 0-255 with HSRP version 1");
    hsrpGroup(f, group(c)).ip = c.args.ip;
  }), { only: ["router", "l3switch"] });
def(IF_MODES, "standby [<g:num:0-4095>] priority <p:num:0-255>", (c) => each(c, (f) => (hsrpGroup(f, group(c)).priority = c.args.p)), { only: ["router", "l3switch"] });
def(IF_MODES, "standby [<g:num:0-4095>] preempt", (c) => each(c, (f) => (hsrpGroup(f, group(c)).preempt = true)), { only: ["router", "l3switch"] });
def(IF_MODES, "no standby <g:num:0-4095>", (c) => each(c, (f) => delete f.hsrp.groups[c.args.g]), { only: ["router", "l3switch"] });
def(IF_MODES, "no standby [<g:num:0-4095>] ip [<ip:ip>]", (c) => each(c, (f) => f.hsrp.groups[group(c)] && (f.hsrp.groups[group(c)].ip = null)), { only: ["router", "l3switch"] });
def(IF_MODES, "no standby [<g:num:0-4095>] priority [<p:num:0-255>]", (c) => each(c, (f) => f.hsrp.groups[group(c)] && (f.hsrp.groups[group(c)].priority = 100)), { only: ["router", "l3switch"] });
def(IF_MODES, "no standby [<g:num:0-4095>] preempt", (c) => each(c, (f) => (hsrpGroup(f, group(c)).preempt = false)), { only: ["router", "l3switch"] });

// ipv6 on an interface
function addIpv6(c, f, text, eui) {
  const p = parseIpv6Prefix(text);
  const addr = eui ? eui64(p.addr, c.dev.mac) : p.addr;
  if (!f.ipv6.some((a) => a.addr === addr)) f.ipv6.push({ addr, bits: p.bits, eui });
  f.ipv6Enabled = true;
}
def(IF_MODES, "ipv6 address <pfx:ipv6pfx> [eui-64]", (c) =>
  each(c, (f) => {
    if (c.dev.type === "switch" && !f.name.startsWith("Vlan")) fail("% Invalid input detected at '^' marker.");
    addIpv6(c, f, c.args.pfx, c.has("eui-64"));
  }));
def(IF_MODES, "ipv6 address <addr:ipv6> link-local", (c) =>
  each(c, (f) => {
    if (!expandIpv6(c.args.addr).startsWith("fe8")) fail("% Invalid link-local address");
    f.ipv6LinkLocal = expandIpv6(c.args.addr);
    f.ipv6Enabled = true;
  }));
def(IF_MODES, "ipv6 address autoconfig [default]", (c) => each(c, (f) => ((f.ipv6Auto = true), (f.ipv6Enabled = true))));
def(IF_MODES, "ipv6 address dhcp", (c) => each(c, (f) => ((f.ipv6Dhcp = true), (f.ipv6Enabled = true))));
def(IF_MODES, "ipv6 enable", (c) => each(c, (f) => (f.ipv6Enabled = true)));
def(IF_MODES, "no ipv6 address [<pfx:ipv6pfx>]", (c) => each(c, (f) => (f.ipv6 = c.args.pfx ? f.ipv6.filter((a) => a.addr !== parseIpv6Prefix(c.args.pfx).addr) : [])));

// --- lines ---------------------------------------------------------------------------------------

def("config", "line console 0", (c) => c.mode("line", { line: "con" }));
def("config", "line vty <first:num:0-15> [<last:num:0-15>]", (c) => {
  const v = c.dev.lines.vty;
  v.first = c.args.first;
  v.last = c.args.last ?? c.args.first;
  c.mode("line", { line: "vty" });
});
def("config", "line aux 0", (c) => c.mode("line", { line: "aux" }), { only: ["router"] });
const line = (c) => (c.dev.ctx.line === "aux" ? (c.dev.lines.aux ??= { password: null, login: false }) : c.dev.lines[c.dev.ctx.line]);
def("line", "password [(0 | 7)] <pw:word>", (c) => (line(c).password = c.args.pw));
def("line", "no password", (c) => (line(c).password = null));
def("line", "login", (c) => {
  const l = line(c);
  if (!l.password) c.say("% Login disabled on line " + (c.dev.ctx.line === "con" ? 0 : c.dev.lines.vty.first) + ", until 'password' is set");
  l.login = true;
  l.loginLocal = false;
});
def("line", "login local", (c) => {
  const l = line(c);
  l.loginLocal = true;
  l.login = false;
});
def("line", "no login", (c) => Object.assign(line(c), { login: false, loginLocal: false }));
def("line", "transport input (ssh | telnet | all | none | ssh telnet | telnet ssh)", (c) => {
  if (c.dev.ctx.line !== "vty") fail("% Invalid input detected at '^' marker.");
  const v = c.dev.lines.vty;
  v.transport = c.has("all") ? ["telnet", "ssh"] : c.has("none") ? [] : c.words.filter((w) => w === "ssh" || w === "telnet");
  v.transportSet = true;
});
def("line", "exec-timeout <min:num:0-35791> [<sec:num:0-2147483>]", (c) => (line(c).execTimeout = { min: c.args.min, sec: c.args.sec ?? 0 }));
def("line", "no exec-timeout", (c) => (line(c).execTimeout = null));
def("line", "logging synchronous", (c) => (line(c).logSync = true));
def("line", "access-class (<n:num:1-199> | <name:word>) in", (c) => {
  if (c.dev.ctx.line !== "vty") fail("% Invalid input detected at '^' marker.");
  c.dev.lines.vty.accessClass = String(c.args.n ?? c.args.name);
});
def("line", "no access-class (<n:num:1-199> | <name:word>) in", (c) => (c.dev.lines.vty.accessClass = null));
def("line", "history size <n:num:0-256>", (c) => (line(c).history = c.args.n));

// --- vlans -----------------------------------------------------------------------------------------

def("config", "vlan <ids:vlist>", (c) => {
  for (const id of c.args.ids) {
    if (id >= 1002 && id <= 1005) fail(`Default VLAN ${id} may not have its name changed.`.slice(0, 0) + `% Default VLAN ${id} may not be deleted.`.slice(0, 0) || "");
    if (!c.dev.vlans[id]) c.dev.vlans[id] = { name: `VLAN${String(id).padStart(4, "0")}` };
  }
  c.mode("vlan", { vlans: c.args.ids });
}, { only: SW });
def("config", "no vlan <ids:vlist>", (c) => {
  for (const id of c.args.ids) {
    if (id === 1) fail("% Default VLAN 1 may not be deleted.");
    delete c.dev.vlans[id];
  }
}, { only: SW });
def("vlan", "name <name:word>", (c) => {
  if (c.dev.ctx.vlans.length > 1) fail("% Applying VLAN changes may take few minutes.  Please wait...".slice(0, 0) + "% Cannot set the name for more than one VLAN at a time");
  c.dev.vlans[c.dev.ctx.vlans[0]].name = c.args.name;
});
def("vlan", "no name", (c) => (c.dev.vlans[c.dev.ctx.vlans[0]].name = `VLAN${String(c.dev.ctx.vlans[0]).padStart(4, "0")}`));
def("config", "vtp mode (server | client | transparent | off)", (c) => {
  c.dev.vtp.mode = c.words[2];
  c.say(`Setting device to VTP ${c.words[2].toUpperCase()} mode.`);
}, { only: SW });
def("config", "vtp domain <name:word>", (c) => {
  c.say(`Changing VTP domain name from ${c.dev.vtp.domain ?? "NULL"} to ${c.args.name}`);
  c.dev.vtp.domain = c.args.name;
}, { only: SW });
def("config", "vtp version <v:num:1-3>", (c) => (c.dev.vtp.version = c.args.v), { only: SW });
def("config", "vtp password <pw:word>", (c) => {
  c.dev.vtp.password = c.args.pw;
  c.say(`Setting device VLAN database password to ${c.args.pw}`);
}, { only: SW });

// --- spanning tree, globally -----------------------------------------------------------------------

def("config", "spanning-tree mode (pvst | rapid-pvst | mst)", (c) => (c.dev.stp.mode = c.words[2]), { only: SW });
// root primary takes 24576, or 4096 under the current root when that is
// already lower, and gives up when it would have to go below zero
def("config", "spanning-tree vlan <v:vlist> root (primary | secondary)", (c) => {
  for (const v of c.args.v) {
    let p = c.has("primary") ? 24576 : 28672;
    if (c.has("primary")) {
      const before = c.dev.stp.vlans[v];
      delete c.dev.stp.vlans[v];
      const root = stpRoot(c.dev, v);
      const theirs = bridgePriority(root, v) - v;
      if (root !== c.dev && theirs <= p) p = theirs - 4096;
      if (p < 0 && before) c.dev.stp.vlans[v] = before;
      if (p < 0) fail(`% Failed to make the bridge root for vlan ${v}\n% It may be possible to make the bridge root by setting the priority\n% for some (or all) of these instances to zero.`);
    }
    c.dev.stp.vlans[v] = { priority: p, root: c.has("primary") ? "primary" : "secondary" };
  }
}, { only: SW });
def("config", "spanning-tree vlan <v:vlist> priority <p:num:0-61440>", (c) => {
  if (c.args.p % 4096) fail("% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440");
  for (const v of c.args.v) c.dev.stp.vlans[v] = { priority: c.args.p };
}, { only: SW });
def("config", "no spanning-tree vlan <v:vlist> [(priority | root)]", (c) => {
  for (const v of c.args.v) delete c.dev.stp.vlans[v];
}, { only: SW });
def("config", "spanning-tree portfast [edge] default", (c) => {
  c.dev.stp.portfastDefault = true;
  c.say("%Warning: this command enables portfast by default on all interfaces. You\n should now disable portfast explicitly on switched ports leading to hubs,\n switches and bridges as they may create temporary bridging loops.");
}, { only: SW });
def("config", "spanning-tree portfast [edge] bpduguard default", (c) => (c.dev.stp.bpduguardDefault = true), { only: SW });
def("config", "spanning-tree portfast [edge] bpdufilter default", (c) => (c.dev.stp.bpdufilterDefault = true), { only: SW });
def("config", "spanning-tree loopguard default", (c) => (c.dev.stp.loopguardDefault = true), { only: SW });
def("config", "spanning-tree pathcost method (long | short)", (c) => (c.dev.stp.pathcost = c.words[3]), { only: SW });
def("config", "errdisable recovery cause (bpduguard | psecure-violation | all | udld | link-flap)", (c) => !c.dev.errdisable.causes.includes(c.words[3]) && c.dev.errdisable.causes.push(c.words[3]));
def("config", "errdisable recovery interval <s:num:30-86400>", (c) => (c.dev.errdisable.interval = c.args.s));

// --- dhcp ------------------------------------------------------------------------------------------------

def("config", "ip dhcp excluded-address <from:ip> [<to:ip>]", (c) => c.dev.dhcp.excluded.push({ from: c.args.from, to: c.args.to ?? c.args.from }), { only: ["router", "l3switch"] });
def("config", "no ip dhcp excluded-address <from:ip> [<to:ip>]", (c) => (c.dev.dhcp.excluded = c.dev.dhcp.excluded.filter((e) => e.from !== c.args.from)), { only: ["router", "l3switch"] });
def("config", "ip dhcp pool <name:word>", (c) => {
  c.dev.dhcp.pools[c.args.name] ??= { network: null, mask: null, router: [], dns: [], domain: null, lease: null };
  c.mode("dhcp", { pool: c.args.name });
}, { only: ["router", "l3switch"] });
def("config", "no ip dhcp pool <name:word>", (c) => delete c.dev.dhcp.pools[c.args.name], { only: ["router", "l3switch"] });
const pool = (c) => c.dev.dhcp.pools[c.dev.ctx.pool];
def("dhcp", "network <net:ip> <mask:mask>", (c) => {
  const bits = maskBits(c.args.mask);
  if (bits < 0) fail("% Invalid mask");
  Object.assign(pool(c), { network: network(c.args.net, bits), mask: c.args.mask });
});
def("dhcp", "default-router <a:ip> [<b:ip>]", (c) => (pool(c).router = [c.args.a, c.args.b].filter(Boolean)));
def("dhcp", "dns-server <a:ip> [<b:ip>]", (c) => (pool(c).dns = [c.args.a, c.args.b].filter(Boolean)));
def("dhcp", "domain-name <name:word>", (c) => (pool(c).domain = c.args.name));
def("dhcp", "lease (<d:num:0-365> [<h:num:0-23> [<m:num:0-59>]] | infinite)", (c) => (pool(c).lease = c.has("infinite") ? "infinite" : [c.args.d, c.args.h ?? 0, c.args.m ?? 0]));
def("dhcp", "option <code:num:0-254> ip <ip:ip>", (c) => ((pool(c).options ??= {})[c.args.code] = c.args.ip));
def("config", "ip dhcp snooping", (c) => (c.dev.snooping.enabled = true), { only: SW });
def("config", "no ip dhcp snooping", (c) => (c.dev.snooping.enabled = false), { only: SW });
def("config", "ip dhcp snooping vlan <v:vlist>", (c) => (c.dev.snooping.vlans = [...new Set([...c.dev.snooping.vlans, ...c.args.v])].sort((a, b) => a - b)), { only: SW });
def("config", "no ip dhcp snooping information option", (c) => (c.dev.snooping.option82 = false), { only: SW });
def("config", "ip dhcp snooping information option", (c) => (c.dev.snooping.option82 = true), { only: SW });
def("config", "ip arp inspection vlan <v:vlist>", (c) => (c.dev.dai.vlans = [...new Set([...c.dev.dai.vlans, ...c.args.v])].sort((a, b) => a - b)), { only: SW });

// --- static routes -------------------------------------------------------------------------------------------

function routeKey(r) {
  return `${r.net}/${r.mask}/${r.via ?? ""}/${r.out ?? ""}`;
}
def("config", "ip route <net:ip> <mask:mask> (<via:ip> | <out:iface> [<via2:ip>]) [<ad:num:1-255>] [permanent]", (c) => {
  const bits = maskBits(c.args.mask);
  if (bits < 0) fail("%Inconsistent address and mask");
  if (network(c.args.net, bits) !== c.args.net) fail("%Inconsistent address and mask");
  if (c.args.out && !c.dev.interfaces[c.args.out]) fail("% Invalid input detected at '^' marker.");
  const r = { net: c.args.net, mask: c.args.mask, via: c.args.via ?? c.args.via2 ?? null, out: c.args.out ?? null, ad: c.args.ad ?? 1 };
  c.dev.routes = c.dev.routes.filter((x) => routeKey(x) !== routeKey(r));
  c.dev.routes.push(r);
}, { only: ["router", "l3switch"] });
def("config", "no ip route <net:ip> <mask:mask> [(<via:ip> | <out:iface> [<via2:ip>])] [<ad:num:1-255>]", (c) => {
  c.dev.routes = c.dev.routes.filter((r) => !(r.net === c.args.net && r.mask === c.args.mask && (!c.args.via || r.via === c.args.via) && (!c.args.out || r.out === c.args.out)));
}, { only: ["router", "l3switch"] });
def("config", "ipv6 route <pfx:ipv6pfx> (<via:ipv6> | <out:iface> [<via2:ipv6>]) [<ad:num:1-254>]", (c) => {
  const p = parseIpv6Prefix(c.args.pfx);
  c.dev.ipv6Routes.push({ addr: p.addr, bits: p.bits, via: c.args.via ? expandIpv6(c.args.via) : c.args.via2 ? expandIpv6(c.args.via2) : null, out: c.args.out ?? null, ad: c.args.ad ?? 1 });
}, { only: ["router", "l3switch"] });
def("config", "no ipv6 route <pfx:ipv6pfx> [(<via:ipv6> | <out:iface>)]", (c) => {
  const p = parseIpv6Prefix(c.args.pfx);
  c.dev.ipv6Routes = c.dev.ipv6Routes.filter((r) => !(r.addr === p.addr && r.bits === p.bits));
}, { only: ["router", "l3switch"] });

// --- routing protocols -----------------------------------------------------------------------------------------

const RT = ["router", "l3switch"];
def("config", "router ospf <pid:num:1-65535>", (c) => {
  c.dev.ospf[c.args.pid] ??= { routerId: null, networks: [], passive: [], passiveDefault: false, notPassive: [], defaultOriginate: null, refBw: null, ranges: [], maxPaths: null };
  c.mode("router", { proto: "ospf", pid: c.args.pid });
}, { only: RT });
def("config", "no router ospf <pid:num:1-65535>", (c) => delete c.dev.ospf[c.args.pid], { only: RT });
def("config", "router rip", (c) => {
  c.dev.rip ??= { version: 1, networks: [], autoSummary: true, passive: [], defaultOriginate: false };
  c.mode("router", { proto: "rip" });
}, { only: RT });
def("config", "no router rip", (c) => (c.dev.rip = null), { only: RT });
def("config", "router eigrp <as:num:1-65535>", (c) => {
  c.dev.eigrp[c.args.as] ??= { networks: [], autoSummary: false, passive: [], routerId: null };
  c.mode("router", { proto: "eigrp", as: c.args.as });
}, { only: RT });
const proc = (c) => (c.dev.ctx.proto === "ospf" ? c.dev.ospf[c.dev.ctx.pid] : c.dev.ctx.proto === "rip" ? c.dev.rip : c.dev.eigrp[c.dev.ctx.as]);
const onlyProto = (c, ...protos) => {
  if (!protos.includes(c.dev.ctx.proto)) fail("% Invalid input detected at '^' marker.");
};
def("router", "router-id <id:ip>", (c) => {
  onlyProto(c, "ospf");
  const p = proc(c);
  const had = p.routerId !== null || p.networks.length;
  p.routerId = c.args.id;
  if (had) c.say("% OSPF: Reload or use \"clear ip ospf process\" command, for this to take effect");
});
def("router", "eigrp router-id <id:ip>", (c) => (onlyProto(c, "eigrp"), (proc(c).routerId = c.args.id)));
def("router", "network <net:ip> <wild:wild> area <area:num:0-4294967295>", (c) => {
  onlyProto(c, "ospf");
  if (wildcardBits(c.args.wild) < 0) {
    // IOS takes any wildcard, but a non-contiguous one is almost always a typo
    // of a subnet mask; say so
    if (maskBits(c.args.wild) >= 0) c.say(`% Note: ${c.args.wild} looks like a subnet mask - OSPF network statements take a wildcard (e.g. 0.0.0.255)`);
  }
  const p = proc(c);
  if (!p.networks.some((n) => n.net === c.args.net && n.wild === c.args.wild)) p.networks.push({ net: c.args.net, wild: c.args.wild, area: c.args.area });
});
def("router", "no network <net:ip> <wild:wild> area <area:num:0-4294967295>", (c) => {
  onlyProto(c, "ospf");
  const p = proc(c);
  p.networks = p.networks.filter((n) => !(n.net === c.args.net && n.wild === c.args.wild));
});
def("router", "network <net:ip> [<wild:wild>]", (c) => {
  onlyProto(c, "rip", "eigrp");
  proc(c).networks.push({ net: c.args.net, wild: c.args.wild ?? null });
});
def("router", "passive-interface default", (c) => {
  const p = proc(c);
  p.passiveDefault = true;
  p.notPassive = [];
});
def("router", "no passive-interface default", (c) => (proc(c).passiveDefault = false));
def("router", "passive-interface <name:iface>", (c) => {
  const p = proc(c);
  if (!c.dev.interfaces[c.args.name]) fail("% Invalid input detected at '^' marker.");
  if (!p.passive.includes(c.args.name)) p.passive.push(c.args.name);
  p.notPassive = (p.notPassive ?? []).filter((n) => n !== c.args.name);
});
def("router", "no passive-interface <name:iface>", (c) => {
  const p = proc(c);
  p.passive = p.passive.filter((n) => n !== c.args.name);
  if (p.passiveDefault && !p.notPassive.includes(c.args.name)) p.notPassive.push(c.args.name);
});
def("router", "default-information originate [always]", (c) => {
  const p = proc(c);
  if (c.dev.ctx.proto === "ospf") p.defaultOriginate = c.has("always") ? "always" : true;
  else p.defaultOriginate = true;
});
def("router", "no default-information originate", (c) => (proc(c).defaultOriginate = null));
def("router", "auto-cost reference-bandwidth <mbps:num:1-4294967>", (c) => {
  onlyProto(c, "ospf");
  proc(c).refBw = c.args.mbps;
  c.say("% OSPF: Reference bandwidth is changed.\n        Please ensure reference bandwidth is consistent across all routers.");
});
def("router", "area <area:num:0-4294967295> range <net:ip> <mask:mask>", (c) => (onlyProto(c, "ospf"), proc(c).ranges.push({ area: c.args.area, net: c.args.net, mask: c.args.mask })));
def("router", "maximum-paths <n:num:1-32>", (c) => (proc(c).maxPaths = c.args.n));
def("router", "distance <ad:num:1-255>", (c) => (proc(c).distance = c.args.ad));
def("router", "log-adjacency-changes [detail]", () => {});
def("router", "version (1 | 2)", (c) => (onlyProto(c, "rip"), (proc(c).version = Number(c.words[1]))));
def("router", "(auto-summary | no auto-summary)", (c) => (onlyProto(c, "rip", "eigrp"), (proc(c).autoSummary = !c.has("no"))));

// --- access lists ----------------------------------------------------------------------------------------------

// "any" | "host A" | "A W" (a lone A on a standard list means host A)
function address(tokens, i, standard) {
  const t = tokens[i]?.toLowerCase();
  if (t === "any") return [{ any: true }, i + 1];
  if (t === "host") {
    if (parseIp(tokens[i + 1] ?? "") === null) return [null, i + 1];
    return [{ host: tokens[i + 1] }, i + 2];
  }
  if (parseIp(tokens[i] ?? "") === null) return [null, i];
  if (tokens[i + 1] && parseIp(tokens[i + 1]) !== null) return [{ net: tokens[i], wild: tokens[i + 1] }, i + 2];
  if (standard) return [{ host: tokens[i] }, i + 1];
  return [null, i + 1];
}
const PORTS = { www: 80, http: 80, telnet: 23, ftp: 21, "ftp-data": 20, smtp: 25, domain: 53, pop3: 110, bootps: 67, bootpc: 68, tftp: 69, ntp: 123, snmp: 161, syslog: 514, https: 443, ssh: 22 };
const portOf = (t) => (t === undefined ? null : /^\d+$/.test(t) ? Number(t) : PORTS[t.toLowerCase()] ?? null);
function portSpec(tokens, i) {
  const op = tokens[i]?.toLowerCase();
  if (["eq", "neq", "lt", "gt"].includes(op)) {
    const p = portOf(tokens[i + 1]);
    if (p === null) return [undefined, i + 1];
    return [{ op, port: p }, i + 2];
  }
  if (op === "range") {
    const a = portOf(tokens[i + 1]), b = portOf(tokens[i + 2]);
    if (a === null || b === null) return [undefined, i + 1];
    return [{ op: "range", port: a, to: b }, i + 3];
  }
  return [null, i];
}

// parse the part after permit/deny; returns { ace } or { bad: token index }
export function parseAce(text, standard) {
  const tokens = text.trim().split(/\s+/);
  if (standard) {
    const [src, i] = address(tokens, 0, true);
    if (!src) return { bad: i };
    let j = i;
    const ace = { src };
    if (tokens[j]?.toLowerCase() === "log") (ace.log = true), j++;
    if (j < tokens.length) return { bad: j };
    return { ace };
  }
  const proto = tokens[0]?.toLowerCase();
  if (!["ip", "tcp", "udp", "icmp", "ospf", "eigrp", "gre", "esp", "ahp"].includes(proto) && !/^\d+$/.test(proto ?? "")) return { bad: 0 };
  const ace = { proto };
  let [src, i] = address(tokens, 1, false);
  if (!src) return { bad: i };
  ace.src = src;
  if (proto === "tcp" || proto === "udp") {
    const [p, j] = portSpec(tokens, i);
    if (p === undefined) return { bad: j };
    if (p) ace.srcPort = p;
    i = j;
  }
  const [dst, k] = address(tokens, i, false);
  if (!dst) return { bad: k };
  ace.dst = dst;
  i = k;
  if (proto === "tcp" || proto === "udp") {
    const [p, j] = portSpec(tokens, i);
    if (p === undefined) return { bad: j };
    if (p) ace.dstPort = p;
    i = j;
  }
  while (i < tokens.length) {
    const t = tokens[i].toLowerCase();
    if (t === "established" && proto === "tcp") ace.established = true;
    else if (t === "log") ace.log = true;
    else if (proto === "icmp" && ["echo", "echo-reply", "unreachable", "time-exceeded"].includes(t)) ace.icmp = t;
    else return { bad: i };
    i++;
  }
  return { ace };
}
const offsetOf = (line, text, index) => {
  const start = line.lastIndexOf(text);
  const tokens = [...text.matchAll(/\S+/g)];
  return start + (tokens[index]?.index ?? text.length);
};
function addAce(c, name, type, action, text, seq) {
  const acl = (c.dev.acls[name] ??= { type, entries: [], named: !/^\d+$/.test(name) });
  if (acl.type !== type) fail(`% Access-list ${name} is a ${acl.type} access-list`);
  const parsed = parseAce(text, type === "standard");
  if (parsed.bad !== undefined) throw c.invalidAt(offsetOf(c.line, text, parsed.bad));
  const last = acl.entries.length ? acl.entries[acl.entries.length - 1].seq : 0;
  const entry = { seq: seq ?? last + 10, action, ...parsed.ace };
  acl.entries = [...acl.entries.filter((e) => e.seq !== entry.seq), entry].sort((a, b) => a.seq - b.seq);
}
const standardNumber = (n) => (n >= 1 && n <= 99) || (n >= 1300 && n <= 1999);
def("config", "access-list <n:num:1-2699> (permit | deny) <ace:rest>", (c) => {
  const n = c.args.n;
  const type = standardNumber(n) ? "standard" : (n >= 100 && n <= 199) || (n >= 2000 && n <= 2699) ? "extended" : null;
  if (!type) fail("% Invalid access list number");
  addAce(c, String(n), type, c.has("permit") ? "permit" : "deny", c.args.ace);
});
def("config", "access-list <n:num:1-2699> remark <text:rest>", (c) => {
  const acl = (c.dev.acls[String(c.args.n)] ??= { type: standardNumber(c.args.n) ? "standard" : "extended", entries: [], named: false });
  acl.remarks = [...(acl.remarks ?? []), c.args.text];
});
def("config", "no access-list <n:num:1-2699>", (c) => delete c.dev.acls[String(c.args.n)]);
def("config", "ip access-list (standard | extended) (<n:num:1-2699> | <name:word>)", (c) => {
  const name = String(c.args.n ?? c.args.name);
  const type = c.has("standard") ? "standard" : "extended";
  const acl = (c.dev.acls[name] ??= { type, entries: [], named: c.args.n === undefined });
  if (acl.type !== type) fail(`% A ${acl.type} access-list with this name already exists`);
  c.mode(type === "standard" ? "acl-std" : "acl-ext", { acl: name });
}, { only: ["router", "l3switch"] });
def("config", "no ip access-list (standard | extended) (<n:num:1-2699> | <name:word>)", (c) => delete c.dev.acls[String(c.args.n ?? c.args.name)]);
for (const [mode, type] of [["acl-std", "standard"], ["acl-ext", "extended"]]) {
  def(mode, "[<seq:num:1-2147483647>] (permit | deny) <ace:rest>", (c) => addAce(c, c.dev.ctx.acl, type, c.has("permit") ? "permit" : "deny", c.args.ace, c.args.seq));
  def(mode, "no <seq:num:1-2147483647>", (c) => {
    const acl = c.dev.acls[c.dev.ctx.acl];
    acl.entries = acl.entries.filter((e) => e.seq !== c.args.seq);
  });
  def(mode, "remark <text:rest>", (c) => {
    const acl = c.dev.acls[c.dev.ctx.acl];
    acl.remarks = [...(acl.remarks ?? []), c.args.text];
  });
}

// --- nat ----------------------------------------------------------------------------------------------------------------

def("config", "ip nat inside source static <local:ip> <global:ip>", (c) => c.dev.nat.statics.push({ local: c.args.local, global: c.args.global }), { only: ["router"] });
def("config", "ip nat inside source static (tcp | udp) <local:ip> <lport:num:1-65535> <global:ip> <gport:num:1-65535>", (c) =>
  c.dev.nat.statics.push({ proto: c.words[5], local: c.args.local, lport: c.args.lport, global: c.args.global, gport: c.args.gport }), { only: ["router"] });
def("config", "no ip nat inside source static <local:ip> <global:ip>", (c) => (c.dev.nat.statics = c.dev.nat.statics.filter((s) => s.local !== c.args.local)), { only: ["router"] });
def("config", "ip nat pool <name:word> <start:ip> <end:ip> (netmask <mask:mask> | prefix-length <len:num:1-32>)", (c) => {
  c.dev.nat.pools[c.args.name] = { start: c.args.start, end: c.args.end, mask: c.args.mask ?? bitsMaskOf(c.args.len) };
}, { only: ["router"] });
def("config", "ip nat inside source list (<n:num:1-2699> | <aclname:word>) (pool <pool:word> | interface <out:iface>) [overload]", (c) => {
  const acl = String(c.args.n ?? c.args.aclname);
  c.dev.nat.dynamic = c.dev.nat.dynamic.filter((d) => d.acl !== acl);
  c.dev.nat.dynamic.push({ acl, pool: c.args.pool ?? null, out: c.args.out ?? null, overload: c.has("overload") });
}, { only: ["router"] });
def("config", "no ip nat inside source list (<n:num:1-2699> | <aclname:word>) [(pool <pool:word> | interface <out:iface>)] [overload]", (c) => {
  const acl = String(c.args.n ?? c.args.aclname);
  c.dev.nat.dynamic = c.dev.nat.dynamic.filter((d) => d.acl !== acl);
}, { only: ["router"] });
const bitsMaskOf = (n) => ipText(n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0);

// --- management services ---------------------------------------------------------------------------------------------------

def("config", "ntp server <ip:ip> [prefer]", (c) => !c.dev.ntp.servers.some((s) => s.ip === c.args.ip) && c.dev.ntp.servers.push({ ip: c.args.ip, prefer: c.has("prefer") }));
def("config", "no ntp server <ip:ip>", (c) => (c.dev.ntp.servers = c.dev.ntp.servers.filter((s) => s.ip !== c.args.ip)));
def("config", "ntp master [<stratum:num:1-15>]", (c) => (c.dev.ntp.master = c.args.stratum ?? 8));
def("config", "ntp update-calendar", (c) => (c.dev.ntp.updateCalendar = true));
def("config", "ntp source <name:iface>", (c) => (c.dev.ntp.source = c.args.name));
def("config", "clock timezone <zone:word> <hours:word> [<minutes:num:0-59>]", (c) => {
  if (!/^[+-]?\d{1,2}$/.test(c.args.hours) || Math.abs(Number(c.args.hours)) > 23) fail("% Invalid input detected at '^' marker.");
  c.dev.clock.timezone = { zone: c.args.zone, hours: Number(c.args.hours), minutes: c.args.minutes ?? 0 };
});
def("config", "clock summer-time <zone:word> recurring", (c) => (c.dev.clock.summer = c.args.zone));
const LEVELS = ["emergencies", "alerts", "critical", "errors", "warnings", "notifications", "informational", "debugging"];
const levelPattern = "(<lvl:num:0-7> | emergencies | alerts | critical | errors | warnings | notifications | informational | debugging)";
const levelOf = (c) => (c.args.lvl !== undefined ? c.args.lvl : LEVELS.findIndex((l) => c.has(l)));
def("config", "logging host <ip:ip>", (c) => !c.dev.logging.hosts.includes(c.args.ip) && c.dev.logging.hosts.push(c.args.ip));
def("config", "logging <ip:ip>", (c) => !c.dev.logging.hosts.includes(c.args.ip) && c.dev.logging.hosts.push(c.args.ip));
def("config", "no logging [host] <ip:ip>", (c) => (c.dev.logging.hosts = c.dev.logging.hosts.filter((h) => h !== c.args.ip)));
def("config", `logging trap ${levelPattern}`, (c) => (c.dev.logging.trap = levelOf(c)));
def("config", `logging console ${levelPattern}`, (c) => (c.dev.logging.console = levelOf(c)));
def("config", `logging buffered [<size:num:4096-2147483647>] [${levelPattern}]`, (c) => (c.dev.logging.buffered = { size: c.args.size ?? 4096, level: c.args.lvl !== undefined || LEVELS.some((l) => c.has(l)) ? levelOf(c) : 7 }));
def("config", `logging monitor ${levelPattern}`, (c) => (c.dev.logging.monitor = levelOf(c)));
def("config", "no logging console", (c) => (c.dev.logging.console = "off"));
def("config", "snmp-server community <name:word> (ro | rw) [(<acl:num:1-99> | <aclname:word>)]", (c) => (c.dev.snmp.communities[c.args.name] = { access: c.has("rw") ? "rw" : "ro", acl: c.args.acl ?? c.args.aclname ?? null }));
def("config", "no snmp-server community <name:word>", (c) => delete c.dev.snmp.communities[c.args.name]);
def("config", "snmp-server location <text:rest>", (c) => (c.dev.snmp.location = c.args.text));
def("config", "snmp-server contact <text:rest>", (c) => (c.dev.snmp.contact = c.args.text));
def("config", "snmp-server host <ip:ip> [version (1 | 2c | 3)] <community:word>", (c) => c.dev.snmp.hosts.push({ ip: c.args.ip, community: c.args.community }));
def("config", "snmp-server enable traps", (c) => (c.dev.snmp.traps = true));

// ssh
function generateRsa(dev, bits) {
  dev.rsa = bits;
  return `The name for the keys will be: ${dev.hostname}.${dev.domainName}\n\n% The key modulus size is ${bits} bits\n% Generating ${bits} bit RSA keys, keys will be non-exportable...[OK]\n*Mar 1 00:12:44.351: %SSH-5-ENABLED: SSH 1.99 has been enabled`;
}
def("config", "crypto key generate rsa [general-keys] [modulus <bits:num:360-4096>]", (c) => {
  const dev = c.dev;
  if (dev.hostname === DEFAULT_NAME[dev.type]) fail("% Please define a hostname other than Router.".replace("Router", DEFAULT_NAME[dev.type]));
  if (!dev.domainName) fail("% Please define a domain-name first.");
  if (c.args.bits) return c.say(generateRsa(dev, c.args.bits));
  c.say(`The name for the keys will be: ${dev.hostname}.${dev.domainName}\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n`);
  c.ask({
    prompt: "How many bits in the modulus [512]: ",
    answer: (a, d) => {
      const bits = a.trim() === "" ? 512 : Number(a.trim());
      if (!(bits >= 360 && bits <= 4096)) return "% Invalid modulus size";
      return generateRsa(d, bits).split("\n").slice(2).join("\n");
    },
  });
});
def("config", "crypto key zeroize rsa", (c) => (c.dev.rsa = null));
def("config", "ip ssh version (1 | 2)", (c) => {
  if (c.words[3] === "2" && !(c.dev.rsa >= 768)) fail("Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).");
  c.dev.sshVersion = Number(c.words[3]);
});
def("config", "ip ssh time-out <s:num:1-120>", (c) => (c.dev.sshTimeout = c.args.s));
def("config", "ip ssh authentication-retries <n:num:0-5>", (c) => (c.dev.sshRetries = c.args.n));
def("config", "(ip http server | ip http secure-server)", (c) => (c.dev.http = true));
def("config", "no ip http server", (c) => (c.dev.http = false));

// --- leaving modes ---------------------------------------------------------------------------------------------------------

def("config", "exit", (c) => c.mode("priv"));
def(["if", "subif", "range", "line", "router", "vlan", "dhcp", "acl-std", "acl-ext"], "exit", (c) => c.mode("config"));
def(["config", "if", "subif", "range", "line", "router", "vlan", "dhcp", "acl-std", "acl-ext"], "end", (c) => {
  c.mode("priv");
  c.say("%SYS-5-CONFIG_I: Configured from console by console");
});

// --- show ---------------------------------------------------------------------------------------------------------------------

for (const [pattern, fn, privOnly] of SHOWS.patterns) def(privOnly ? "priv" : EXEC, pattern, (c) => c.say(fn(c.dev, c.args, c)));

// --- helpers --------------------------------------------------------------------------------------------------------------------

const RUNTIME = new Set(["saved", "history", "ran", "mode", "ctx", "pending", "debugs", "links", "erased", "savedSize", "lab", "gateway", "transfers"]);
function stripRuntime(d) {
  const o = {};
  for (const [k, v] of Object.entries(d)) if (!RUNTIME.has(k)) o[k] = v;
  return o;
}
function snapshotOf(dev) {
  return structuredClone(stripRuntime(dev));
}
function reloadDevice(dev) {
  const saved = dev.saved;
  const keepPorts = Object.keys(dev.interfaces).filter((n) => !/^(Loopback|Vlan|Port-channel)/.test(n) && !isSub(n));
  const fresh = createFresh(dev, keepPorts);
  for (const k of Object.keys(dev)) if (!RUNTIME.has(k)) delete dev[k];
  Object.assign(dev, structuredClone(saved ?? fresh));
  dev.mode = "user";
  dev.ctx = {};
}
function mergeSaved(dev) {
  const saved = structuredClone(dev.saved);
  for (const [k, v] of Object.entries(saved)) {
    if (k === "interfaces") for (const [n, f] of Object.entries(v)) dev.interfaces[n] = f;
    else dev[k] = v;
  }
}
let freshMaker = null;
export function setFreshMaker(fn) {
  freshMaker = fn;
}
function createFresh(dev, ports) {
  return stripRuntime(freshMaker({ name: dev.name, type: dev.type, ports, mac: dev.mac }));
}

export function linkUp(dev, f) {
  return status(dev, f)[1] === "up";
}

export function resolve(dev, target) {
  if (parseIp(target) !== null) return target;
  if (dev.hosts[target]) return dev.hosts[target];
  return null;
}

// does this device have somewhere to send a packet for ip: a connected
// subnet on an up interface, or a route in its routing table (static, ospf,
// default); a layer 2 switch only knows its own subnet and its gateway
export function reachable(dev, ip) {
  for (const f of Object.values(dev.interfaces)) {
    if (!f.ip || !linkUp(dev, f)) continue;
    const bits = maskBits(f.mask);
    if (network(ip, bits) === network(f.ip, bits)) return true;
  }
  if (dev.type !== "router" && !dev.ipRouting) return Boolean(dev.defaultGateway) && reachable({ ...dev, defaultGateway: null, ipRouting: false }, dev.defaultGateway);
  return routeTable(dev).some((r) => network(ip, r.bits) === r.net);
}

function ping(dev, target, count) {
  const ip = resolve(dev, target);
  if (!ip) {
    if (!dev.domainLookup) return `% Unrecognized host or address, or protocol not running.\n`;
    return `Translating "${target}"...domain server (${dev.nameServers[0] ?? "255.255.255.255"})\n% Unrecognized host or address, or protocol not running.\n`;
  }
  const ok = reachable(dev, ip);
  const marks = ok ? "!".repeat(count) : ".".repeat(count);
  return `Type escape sequence to abort.\nSending ${count}, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:\n${marks}\nSuccess rate is ${ok ? 100 : 0} percent (${ok ? count : 0}/${count})${ok ? ", round-trip min/avg/max = 1/2/4 ms" : ""}`;
}

function trace(dev, target) {
  const ip = resolve(dev, target);
  if (!ip) return "% Unrecognized host or address, or protocol not running.";
  return `Type escape sequence to abort.\nTracing the route to ${ip}\n\n  1 ${reachable(dev, ip) ? ip + " 1 msec 0 msec 1 msec" : "*  *  *"}`;
}
