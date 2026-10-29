import { lab, R, PC, SRV, cfg, EN, need } from "./kit.js";

const M = "acl";
const same = (a, b) => (b.any ? a?.any : b.host ? a?.host === b.host : a?.net === b.net && a?.wild === b.wild);
// does this ACL contain an entry like `want` (only the given fields are compared)
const has = (acl, want) => Boolean(acl?.entries.some((e) =>
  e.action === want.action && (!want.src || same(e.src, want.src)) && (!want.dst || same(e.dst, want.dst)) &&
  (!want.proto || e.proto === want.proto) && (!want.port || (e.dstPort?.op === "eq" && e.dstPort.port === want.port)) &&
  (!want.established || e.established)));
const index = (acl, want) => acl?.entries.findIndex((e) => has({ entries: [e] }, want)) ?? -1;

// R1 between two LANs and a server LAN
const three = (extra = []) => [
  R("R1", 50, 22, cfg("interface g0/0", "ip address 192.168.10.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.1 255.255.255.0", "no shutdown", "interface g0/2", "ip address 172.16.1.1 255.255.255.0", "no shutdown", ...extra)),
  PC("PC10", 18, 52, "192.168.10.10/24", "192.168.10.1"), PC("PC20", 50, 55, "192.168.20.10/24", "192.168.20.1"), SRV("SRV", 82, 52, "172.16.1.100/24", "172.16.1.1"),
];
const threeLinks = [["R1", "g0/0", "PC10", "fa0"], ["R1", "g0/1", "PC20", "fa0"], ["R1", "g0/2", "SRV", "fa0"]];

export default [
  lab({
    id: "acl-standard", module: M, title: "Standard numbered ACL",
    cmds: ["access-list", "ip access-group"],
    devices: three(), links: threeLinks,
    intro: "LAN 192.168.20.0/24 must not reach the server network (172.16.1.0/24). Everything else is allowed.",
    tasks: [
      { text: "ACL 10: deny 192.168.20.0/24, then permit any.", check: (t) => { const a = t.acl("R1", 10); const d = index(a, { action: "deny", src: { net: "192.168.20.0", wild: "0.0.0.255" } }); const p = index(a, { action: "permit", src: { any: true } }); return need(d >= 0 && p > d, d < 0 ? "access-list 10 deny 192.168.20.0 0.0.0.255 is missing." : p < 0 ? "Without permit any, the implicit deny drops everything else." : "permit any comes before the deny, so the deny never matches."); } },
      { text: "Apply the ACL where a standard ACL belongs.", check: (t) => need(t.f("R1", "g0/2").aclOut === "10", t.f("R1", "g0/1").aclIn === "10" ? "A standard ACL near the source (G0/1 in) cuts LAN 20 off from everything. Put it near the destination: G0/2 out." : "Expected ip access-group 10 out on G0/2.") },
    ],
    solution: { R1: [...EN, "access-list 10 deny 192.168.20.0 0.0.0.255", "access-list 10 permit any", "interface g0/2", "ip access-group 10 out"] },
    teach: "A standard ACL checks only the source address, so it goes as close to the destination as possible. Every ACL ends with an invisible deny any.",
  }),
  lab({
    id: "acl-host", module: M, title: "Standard ACL: host and wildcard",
    cmds: ["access-list host", "access-list wildcard"],
    devices: three(), links: threeLinks,
    intro: "Only the administrator 192.168.10.10 and the subnet 192.168.20.0/25 may reach the servers.",
    tasks: [
      { text: "ACL 20: permit only host 192.168.10.10.", check: (t) => need(has(t.acl("R1", 20), { action: "permit", src: { host: "192.168.10.10" } }), "Expected access-list 20 permit host 192.168.10.10 (or 192.168.10.10 0.0.0.0).") },
      { text: "ACL 20: permit 192.168.20.0/25.", check: (t) => need(has(t.acl("R1", 20), { action: "permit", src: { net: "192.168.20.0", wild: "0.0.0.127" } }), "For a /25 the wildcard is 0.0.0.127.") },
      { text: "Apply it outbound on G0/2.", check: (t) => need(t.f("R1", "g0/2").aclOut === "20", "Expected ip access-group 20 out on G0/2.") },
    ],
    solution: { R1: [...EN, "access-list 20 permit host 192.168.10.10", "access-list 20 permit 192.168.20.0 0.0.0.127", "interface g0/2", "ip access-group 20 out"] },
    teach: "Wildcard = 255.255.255.255 minus the mask: /25 gives 0.0.0.127, /30 gives 0.0.0.3. host X is X 0.0.0.0, and any is 0.0.0.0 255.255.255.255.",
  }),
  lab({
    id: "acl-extended", module: M, title: "Extended ACL: web only to the server",
    cmds: ["access-list 100", "eq www"],
    devices: three(), links: threeLinks,
    intro: "LAN 192.168.10.0/24 may reach only HTTP and HTTPS on server 172.16.1.100. All other traffic from the LAN to anywhere else is allowed.",
    tasks: [
      { text: "ACL 100: permit tcp from 192.168.10.0/24 to host 172.16.1.100 eq 80.", check: (t) => need(has(t.acl("R1", 100), { action: "permit", proto: "tcp", src: { net: "192.168.10.0", wild: "0.0.0.255" }, dst: { host: "172.16.1.100" }, port: 80 }), "permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq www is missing.") },
      { text: "The same for port 443.", check: (t) => need(has(t.acl("R1", 100), { action: "permit", proto: "tcp", src: { net: "192.168.10.0", wild: "0.0.0.255" }, dst: { host: "172.16.1.100" }, port: 443 }), "... eq 443 is missing.") },
      { text: "Block everything else from the LAN to the server, and permit all other traffic.", check: (t) => { const a = t.acl("R1", 100); const d = index(a, { action: "deny", proto: "ip", dst: { host: "172.16.1.100" } }); const p = index(a, { action: "permit", proto: "ip", src: { any: true }, dst: { any: true } }); return need(d >= 0 && p > d, d < 0 ? "deny ip ... host 172.16.1.100 is missing." : "permit ip any any is missing at the end, or in the wrong place."); } },
      { text: "Apply it close to the source.", check: (t) => need(t.f("R1", "g0/0").aclIn === "100", "An extended ACL goes near the source: ip access-group 100 in on G0/0.") },
    ],
    solution: { R1: [...EN, "access-list 100 permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq www", "access-list 100 permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq 443", "access-list 100 deny ip 192.168.10.0 0.0.0.255 host 172.16.1.100", "access-list 100 permit ip any any", "interface g0/0", "ip access-group 100 in"] },
    teach: "Syntax: access-list 100-199 permit|deny protocol, then source with wildcard and [port], then destination with wildcard and [port]. An extended ACL goes near the source, so unwanted traffic does not cross the network.",
  }),
  lab({
    id: "acl-named-std", module: M, title: "Named standard ACL",
    cmds: ["ip access-list standard"],
    devices: three(), links: threeLinks,
    intro: "The company wants named ACLs so they are easy to read.",
    tasks: [
      { text: "Named standard ACL BLOCK-LAN20: deny 192.168.20.0/24, permit any.", check: (t) => { const a = t.acl("R1", "BLOCK-LAN20"); return need(a?.type === "standard" && has(a, { action: "deny", src: { net: "192.168.20.0", wild: "0.0.0.255" } }) && has(a, { action: "permit", src: { any: true } }), "Expected ip access-list standard BLOCK-LAN20 with deny 192.168.20.0 0.0.0.255 and permit any."); } },
      { text: "Apply it outbound on G0/2.", check: (t) => need(t.f("R1", "g0/2").aclOut === "BLOCK-LAN20", "Expected ip access-group BLOCK-LAN20 out on G0/2.") },
    ],
    solution: { R1: [...EN, "ip access-list standard BLOCK-LAN20", "deny 192.168.20.0 0.0.0.255", "permit any", "exit", "interface g0/2", "ip access-group BLOCK-LAN20 out"] },
    teach: "ip access-list standard|extended <name> enters (config-std-nacl)#, where you write the entries without the access-list <n> prefix.",
  }),
  lab({
    id: "acl-named-ext", module: M, title: "Named extended ACL",
    cmds: ["ip access-list extended"],
    devices: three(), links: threeLinks,
    intro: "LAN 192.168.20.0/24 must not be able to Telnet anywhere. Everything else is allowed.",
    tasks: [
      { text: "Named extended ACL NO-TELNET: deny tcp from 192.168.20.0/24 to any eq 23, then permit ip any any.", check: (t) => { const a = t.acl("R1", "NO-TELNET"); const d = index(a, { action: "deny", proto: "tcp", src: { net: "192.168.20.0", wild: "0.0.0.255" }, dst: { any: true }, port: 23 }); return need(a?.type === "extended" && d >= 0 && index(a, { action: "permit", proto: "ip", src: { any: true }, dst: { any: true } }) > d, "Expected deny tcp 192.168.20.0 0.0.0.255 any eq telnet, then permit ip any any."); } },
      { text: "Apply it inbound on G0/1.", check: (t) => need(t.f("R1", "g0/1").aclIn === "NO-TELNET", "Expected ip access-group NO-TELNET in on G0/1.") },
    ],
    solution: { R1: [...EN, "ip access-list extended NO-TELNET", "deny tcp 192.168.20.0 0.0.0.255 any eq telnet", "permit ip any any", "interface g0/1", "ip access-group NO-TELNET in"] },
    teach: "Ports to know: Telnet 23, SSH 22, HTTP 80, HTTPS 443, DNS 53 (UDP/TCP), DHCP 67/68 (UDP), TFTP 69 (UDP), SNMP 161 (UDP), syslog 514 (UDP), NTP 123 (UDP).",
  }),
  lab({
    id: "acl-seq-edit", module: M, title: "Editing an ACL with sequence numbers",
    cmds: ["ip access-list", "no <seq>", "<seq> deny"],
    devices: three(["ip access-list standard SERVERS", "permit 192.168.10.0 0.0.0.255", "permit 192.168.20.0 0.0.0.255", "exit", "interface g0/2", "ip access-group SERVERS out"]), links: threeLinks,
    intro: "ACL SERVERS has 10 permit 192.168.10.0/24 and 20 permit 192.168.20.0/24. Host 192.168.10.66 must be blocked without rewriting the whole ACL.",
    tasks: [
      { text: "Add deny host 192.168.10.66 with sequence number 5, so it is checked first.", check: (t) => { const a = t.acl("R1", "SERVERS"); return need(a?.entries[0]?.seq === 5 && has({ entries: [a.entries[0]] }, { action: "deny", src: { host: "192.168.10.66" } }), "Inside ip access-list standard SERVERS: 5 deny host 192.168.10.66."); } },
      { text: "Remove entry 20.", check: (t) => need(t.acl("R1", "SERVERS") && !t.acl("R1", "SERVERS").entries.some((e) => e.seq === 20), "Inside the ACL: no 20.") },
      { text: "Verify with show access-lists.", check: (t) => need(t.ran("R1", /^show (ip )?access-lists/), "Run show access-lists.") },
    ],
    solution: { R1: [...EN, "ip access-list standard SERVERS", "5 deny host 192.168.10.66", "no 20", "end", "show access-lists"] },
    teach: "ACLs are checked top-down and stop at the first match. A new entry without a number goes at the end (+10); to place it earlier, give it a lower sequence number.",
  }),
  lab({
    id: "acl-vty", module: M, title: "access-class: who may SSH in",
    cmds: ["access-list", "line vty", "access-class"],
    devices: three(), links: threeLinks,
    intro: "Only the administrator 192.168.10.10 may log in remotely to R1.",
    tasks: [
      { text: "ACL 5 permitting only host 192.168.10.10.", check: (t) => need(has(t.acl("R1", 5), { action: "permit", src: { host: "192.168.10.10" } }), "Expected access-list 5 permit host 192.168.10.10.") },
      { text: "Apply it to vty lines 0 through 15.", check: (t) => need(t.dev("R1").lines.vty.accessClass === "5", "Under line vty 0 15, use access-class 5 in (not access-group).") },
    ],
    solution: { R1: [...EN, "access-list 5 permit host 192.168.10.10", "line vty 0 15", "access-class 5 in"] },
    teach: "On vty lines an ACL is applied with access-class, not ip access-group. It filters only sessions to the router itself (Telnet/SSH).",
  }),
  lab({
    id: "acl-established", module: M, title: "Extended ACL: established",
    cmds: ["established", "eq"],
    devices: [R("R1", 50, 25, cfg("interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 203.0.113.2 255.255.255.252", "no shutdown")), PC("PC1", 18, 50, "192.168.1.10/24", "192.168.1.1"), PC("Internet", 82, 50, "203.0.113.1/30")],
    links: [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "Internet", "fa0"]],
    intro: "From the Internet into the LAN, only replies to TCP sessions opened by users may enter.",
    tasks: [
      { text: "ACL 110: permit tcp any 192.168.1.0/24 established.", check: (t) => need(has(t.acl("R1", 110), { action: "permit", proto: "tcp", src: { any: true }, dst: { net: "192.168.1.0", wild: "0.0.0.255" }, established: true }), "Expected access-list 110 permit tcp any 192.168.1.0 0.0.0.255 established.") },
      { text: "Apply it inbound on G0/1.", check: (t) => need(t.f("R1", "g0/1").aclIn === "110", "Expected ip access-group 110 in on G0/1.") },
    ],
    solution: { R1: [...EN, "access-list 110 permit tcp any 192.168.1.0 0.0.0.255 established", "interface g0/1", "ip access-group 110 in"] },
    teach: "established matches packets with ACK or RST set, that is replies, not new sessions. It is a simple flag filter, not a stateful firewall.",
  }),
  lab({
    id: "sim-acl", module: M, title: "Sim: ACLs on two routers", kind: "sim",
    cmds: ["access-list", "ip access-list extended", "ip access-group", "access-class"],
    devices: [
      R("R1", 25, 22, cfg("interface g0/0", "ip address 192.168.10.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "ip route 172.16.1.0 255.255.255.0 10.0.0.2")),
      R("R2", 75, 22, cfg("interface g0/0", "ip address 172.16.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.0.2 255.255.255.252", "no shutdown", "ip route 192.168.10.0 255.255.255.0 10.0.0.1")),
      PC("PC1", 25, 52, "192.168.10.10/24", "192.168.10.1"), SRV("SRV", 75, 52, "172.16.1.100/24", "172.16.1.1"),
    ],
    links: [["R1", "g0/1", "R2", "g0/1"], ["R1", "g0/0", "PC1", "fa0"], ["R2", "g0/0", "SRV", "fa0"]],
    intro: "R1's LAN may reach only DNS (UDP 53) and HTTPS on SRV. Only PC1 may SSH into R2.",
    tasks: [
      { text: "R1: named extended ACL TO-SRV with permit udp 53 and tcp 443 from 192.168.10.0/24 to host 172.16.1.100.", check: (t) => { const a = t.acl("R1", "TO-SRV"); const src = { net: "192.168.10.0", wild: "0.0.0.255" }, dst = { host: "172.16.1.100" }; return need(has(a, { action: "permit", proto: "udp", src, dst, port: 53 }) && has(a, { action: "permit", proto: "tcp", src, dst, port: 443 }), "permit udp ... eq domain or permit tcp ... eq 443 is missing."); } },
      { text: "R1: TO-SRV must block other traffic to SRV, but not to other networks.", check: (t) => { const a = t.acl("R1", "TO-SRV"); const d = index(a, { action: "deny", proto: "ip", dst: { host: "172.16.1.100" } }); return need(d >= 0 && index(a, { action: "permit", proto: "ip", src: { any: true }, dst: { any: true } }) > d, "Expected deny ip ... host 172.16.1.100, then permit ip any any."); } },
      { text: "R1: apply TO-SRV on the right interface in the right direction.", check: (t) => need(t.f("R1", "g0/0").aclIn === "TO-SRV", "An extended ACL near the source: G0/0 in on R1.") },
      { text: "R2: only 192.168.10.10 may log in remotely (ACL 1 and the vty lines).", check: (t) => need(has(t.acl("R2", 1), { action: "permit", src: { host: "192.168.10.10" } }) && t.dev("R2").lines.vty.accessClass === "1", "Expected access-list 1 permit host 192.168.10.10 and access-class 1 in under line vty 0 15 on R2.") },
    ],
    solution: {
      R1: [...EN, "ip access-list extended TO-SRV", "permit udp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq domain", "permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq 443", "deny ip 192.168.10.0 0.0.0.255 host 172.16.1.100", "permit ip any any", "exit", "interface g0/0", "ip access-group TO-SRV in"],
      R2: [...EN, "access-list 1 permit host 192.168.10.10", "line vty 0 15", "access-class 1 in"],
    },
    teach: "Each interface takes one ACL per direction per protocol (IPv4/IPv6). A second ip access-group replaces the first.",
  }),
];
