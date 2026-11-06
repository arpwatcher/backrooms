import { lab, R, PC, SRV, HOST, cfg, EN, need, is } from "./kit.js";
import { fromRouter, pings } from "../engine/host.js";

const M = "acl";
// the remarks typed just before an entry
const remarked = (e, text) => (e?.remarks ?? []).some((r) => r.trim().toLowerCase() === text);
const pick = (want, why) => (t) => need(t.reply === want, why);
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
  lab({
    id: "acl-read", module: M, title: "Reading show access-lists",
    cmds: ["show access-lists", "show ip interface"],
    devices: three(["access-list 110 permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq 443", "access-list 110 deny ip 192.168.10.0 0.0.0.255 172.16.1.0 0.0.0.255", "access-list 110 permit ip any any", "interface g0/0", "ip access-group 110 in"]), links: threeLinks,
    intro: "Someone else configured R1's filtering. Find out what it does.",
    tasks: [
      { text: "List R1's access lists.", check: (t) => need(t.ran("R1", /^show (ip )?access-lists/), "Run show access-lists.") },
      { text: "Find which interface and direction ACL 110 is applied to.", check: (t) => need(t.ran("R1", /^show (ip interface|running-config)/), "show ip interface g0/0 shows the Inbound access list (or look in show running-config).") },
      { text: "Can PC10 (192.168.10.10) open an SSH session to 172.16.1.100?", choices: ["Yes", "No"], check: (t) => need(t.reply === "No", "SSH is TCP 22: the first entry permits only 443, and the second denies the rest to 172.16.1.0/24.") },
      { text: "Which sequence number permits HTTPS?", ask: "number", check: (t) => need(is.num(t.reply, 10), "Entries are numbered 10, 20, 30... in show access-lists.") },
    ],
    solution: { R1: ["enable", "show access-lists", "show ip interface g0/0"] },
    answers: { 2: "No", 3: "10" },
    teach: "show access-lists shows every entry with its sequence number and match counters; show ip interface shows which ACL is applied in and out on each interface.",
  }),
  lab({
    id: "sim-acl-fix", module: M, title: "Sim: the ACL blocks everything", kind: "sim",
    cmds: ["show ip interface", "ip access-group", "access-list"],
    devices: three(["access-list 100 permit tcp 192.168.10.0 0.0.0.255 host 172.16.1.100 eq www", "access-list 100 deny ip 192.168.10.0 0.0.0.255 host 172.16.1.100", "interface g0/0", "ip access-group 100 out"]), links: threeLinks,
    intro: "ACL 100 should let LAN 10 reach only the web service on SRV and leave all other traffic alone. Instead, PC10 cannot reach anything, and SRV is still open to it. Fix it.",
    tasks: [
      { text: "Find where ACL 100 is applied.", check: (t) => need(t.ran("R1", /^show (ip interface|running-config)/), "Run show ip interface g0/0 (or show running-config).") },
      { text: "Apply it in the direction that filters traffic coming from LAN 10.", check: (t) => need(t.f("R1", "g0/0").aclIn === "100" && t.f("R1", "g0/0").aclOut !== "100", t.f("R1", "g0/0").aclOut === "100" ? "It is still applied out on G0/0, which filters traffic going to LAN 10." : "Expected ip access-group 100 in on G0/0.") },
      { text: "Stop the implicit deny from blocking all other traffic.", check: (t) => { const a = t.acl("R1", 100); const last = a?.entries[a.entries.length - 1]; return need(last?.action === "permit" && last.proto === "ip" && last.src.any && last.dst.any, "The last entry must be permit ip any any."); } },
    ],
    solution: { R1: ["enable", "show ip interface g0/0", "configure terminal", "access-list 100 permit ip any any", "interface g0/0", "no ip access-group 100 out", "ip access-group 100 in"] },
    teach: "In and out are from the router's point of view: in = arriving on the interface, out = leaving it. Every ACL ends with an implicit deny any, so a list of permits and denies for one host needs a permit at the end.",
  }),  lab({
    id: "acl-resequence", module: M, title: "Renumbering an ACL with resequence",
    cmds: ["ip access-list resequence", "show access-lists"],
    devices: [R("R1", 50, 30, cfg("ip access-list standard MGMT", "permit host 10.0.99.10", "permit host 10.0.99.11", "1 deny host 10.0.99.66", "2 deny host 10.0.99.67", "3 permit 10.0.99.0 0.0.0.255"))],
    intro: "After many quick fixes, ACL MGMT is numbered 1, 2, 3, 10, 20: there is no room left to insert a line between the first entries. Renumber it without retyping it.",
    tasks: [
      { text: "MGMT starts at 10 and goes up in steps of 10, in the same order.", check: (t) => { const a = t.acl("R1", "MGMT"); const old = a?.entries.filter((e) => e.src?.host !== "10.0.99.68") ?? []; return need(old.map((e) => e.seq).join() === "10,20,30,40,50" && old[0].src.host === "10.0.99.66", "ip access-list resequence MGMT 10 10"); } },
      { text: "After the renumbering, which sequence number does permit host 10.0.99.11 have?", ask: "Sequence number", check: (t) => need(is.num(t.reply, 50), "show access-lists MGMT: the order stays, only the numbers change.") },
      { text: "Insert deny host 10.0.99.68 so that it is checked right after deny host 10.0.99.67.", check: (t) => { const a = t.acl("R1", "MGMT"); const i = a?.entries.findIndex((e) => e.src?.host === "10.0.99.68" && e.action === "deny"); return need(i === 2, "25 deny host 10.0.99.68 inside ip access-list standard MGMT."); } },
    ],
    solution: { R1: [...EN, "ip access-list resequence MGMT 10 10", "do show access-lists MGMT", "ip access-list standard MGMT", "25 deny host 10.0.99.68", "end", "show access-lists MGMT"] },
    answers: { 1: "50" },
    teach: "Entries are kept in sequence-number order, and a new one without a number goes 10 past the last. ip access-list resequence <acl> <start> <step> renumbers the whole list in place (same order), which makes room to insert lines between old ones.",
  }),
  lab({
    id: "acl-remark", module: M, title: "Documenting an ACL with remarks",
    cmds: ["remark", "access-list remark", "show running-config"],
    devices: [R("R1", 50, 30, cfg("interface g0/0", "ip address 10.0.50.1 255.255.255.0", "no shutdown"))],
    intro: "Six months from now nobody will remember why an ACL line is there. Write the reason above each line as you build two ACLs on R1.",
    tasks: [
      { text: "Named extended ACL GUEST-IN: first the remark Guests stay out of the servers, then deny ip 10.0.50.0 0.0.0.255 10.0.10.0 0.0.0.255.", check: (t) => { const e = t.acl("R1", "GUEST-IN")?.entries[0]; return need(e?.action === "deny" && e.dst?.net === "10.0.10.0" && remarked(e, "guests stay out of the servers"), "ip access-list extended GUEST-IN, then remark Guests stay out of the servers, then the deny line: the remark goes in just before the entry it explains."); } },
      { text: "Then the remark Everything else is allowed, and permit ip any any.", check: (t) => { const e = t.acl("R1", "GUEST-IN")?.entries[1]; return need(e?.action === "permit" && e.src?.any && remarked(e, "everything else is allowed"), "remark Everything else is allowed, then permit ip any any, still inside GUEST-IN."); } },
      { text: "Numbered ACL 10: the remark Management hosts, then permit host 10.0.99.10.", check: (t) => { const e = t.acl("R1", 10)?.entries[0]; return need(e?.src?.host === "10.0.99.10" && remarked(e, "management hosts"), "access-list 10 remark Management hosts, then access-list 10 permit host 10.0.99.10."); } },
      { text: "Where do the remarks show up?", choices: ["show running-config", "show access-lists", "show ip interface", "Nowhere: they are dropped once typed"], check: pick("show running-config", "show access-lists prints the entries and their match counts but no remarks; the configuration keeps them, each above its entry.") },
      { text: "What does a remark change in what the ACL permits?", choices: ["Nothing", "It permits the next entry's traffic", "It logs matches", "It disables the next entry"], check: pick("Nothing", "A remark is a comment: it is not matched against packets.") },
    ],
    solution: { R1: [...EN, "ip access-list extended GUEST-IN", "remark Guests stay out of the servers", "deny ip 10.0.50.0 0.0.0.255 10.0.10.0 0.0.0.255", "remark Everything else is allowed", "permit ip any any", "exit", "access-list 10 remark Management hosts", "access-list 10 permit host 10.0.99.10", "end", "show running-config", "show access-lists"] },
    answers: { 3: "show running-config", 4: "Nothing" },
    teach: "remark <text> (inside a named ACL) or access-list <n> remark <text> adds a comment of up to 100 characters. It belongs to the entry typed after it and prints just above that entry in the running-config; show access-lists leaves remarks out. Remarks never match packets.",
  }),
  lab({
    id: "acl-counters", module: M, title: "Reading ACL match counters",
    cmds: ["show access-lists", "clear access-list counters", "ping", "traceroute"],
    devices: [
      R("R1", 15, 30, cfg("interface g0/0", "ip address 10.0.12.1 255.255.255.0", "no shutdown", "ip route 10.0.3.0 255.255.255.0 10.0.12.2")),
      R("R2", 50, 30, cfg("access-list 100 permit icmp any any", "access-list 100 permit udp any any", "access-list 100 permit ip any any", "interface g0/0", "ip address 10.0.12.2 255.255.255.0", "ip access-group 100 in", "no shutdown", "interface g0/1", "ip address 10.0.23.1 255.255.255.0", "no shutdown", "ip route 10.0.3.0 255.255.255.0 10.0.23.3")),
      R("R3", 85, 30, cfg("interface g0/0", "ip address 10.0.23.3 255.255.255.0", "no shutdown", "interface loopback 0", "ip address 10.0.3.1 255.255.255.0", "ip route 10.0.12.0 255.255.255.0 10.0.23.1")),
    ],
    links: [["R1", "g0/0", "R2", "g0/0"], ["R2", "g0/1", "R3", "g0/0"]],
    intro: "ACL 100 on R2's G0/0 permits everything, in three lines, so its counters show what kind of traffic comes in from R1. Send some and read them.",
    tasks: [
      { text: "From R1, ping 10.0.3.1 once (five echoes). How many matches does R2's permit icmp line show?", ask: "Matches", check: (t) => need(t.ran("R1", /^ping 10\.0\.3\.1$/) && is.num(t.reply, 4), "show access-lists on R2: (4 matches).") },
      { text: "Why not 5?", choices: ["R1 lost the first echo while it ARPed for 10.0.12.2, so it never reached R2", "The ACL drops one packet in five", "R3 did not answer the first", "Echo replies are not counted"], check: (t) => need(t.reply === "R1 lost the first echo while it ARPed for 10.0.12.2, so it never reached R2", "The .!!!! on R1: the first packet waits for ARP and is dropped. The echo replies enter R2 on G0/1, which has no ACL.") },
      { text: "Reset the counters on R2.", check: (t) => need(t.ran("R2", /^clear access-list counters/), "clear access-list counters (or clear access-list counters 100) in privileged EXEC.") },
      { text: "Now trace from R1 to 10.0.3.1. How many matches does the permit udp line show?", ask: "Matches", check: (t) => need(t.ran("R1", /^traceroute 10\.0\.3\.1$/) && is.num(t.reply, 6), "IOS traceroute sends three UDP probes per TTL. The TTL 1 probes reach R2 and expire there, the TTL 2 probes pass it and reach R3: 3 + 3 = 6.") },
      { text: "And the permit icmp line, after the trace?", ask: "Matches", check: (t) => need(is.num(t.reply, 0), "The time-exceeded and port-unreachable answers are ICMP, but they come back into R2 on G0/1, where there is no ACL.") },
    ],
    solution: { R1: ["enable", "ping 10.0.3.1"], R2: ["enable", "show access-lists", "clear access-list counters"], "R1#2": ["traceroute 10.0.3.1"], "R2#2": ["show access-lists"] },
    answers: { 0: "4", 1: "R1 lost the first echo while it ARPed for 10.0.12.2, so it never reached R2", 3: "6", 4: "0" },
    teach: "show access-lists counts the packets each entry matched, in the direction the ACL is applied. A router's first ping to a next hop it has not ARPed for loses one packet (.!!!!) before it leaves. IOS, Linux and macOS traceroute send UDP probes (three per TTL, ports from 33434); Windows tracert sends ICMP echoes. clear access-list counters [acl] starts the counts again.",
  }),
  lab({
    id: "acl-router-itself", module: M, title: "An inbound ACL and the router's own traffic",
    cmds: ["ip access-group in", "ping", "echo", "echo-reply"],
    devices: [
      R("R1", 25, 30, cfg("interface g0/0", "ip address 10.0.12.1 255.255.255.0", "no shutdown")),
      R("R2", 75, 30, cfg("access-list 101 deny icmp any host 10.0.12.2", "access-list 101 permit ip any any", "interface g0/0", "ip address 10.0.12.2 255.255.255.0", "ip access-group 101 in", "no shutdown")),
    ],
    links: [["R1", "g0/0", "R2", "g0/0"]],
    intro: "Someone wanted R2 to stop answering pings, and put ACL 101 inbound on its G0/0. Now R2's own pings to R1 fail too.",
    tasks: [
      { text: "Ping R2 (10.0.12.2) from R1. What does R1 print?", choices: ["U.U.U", "!!!!!", ".....", "% Unrecognized host"], check: (t) => need(t.ran("R1", /^ping 10\.0\.12\.2$/) && t.reply === "U.U.U", "R2 drops the echo with the ACL and answers administratively prohibited (U), rate-limited.") },
      { text: "Does an inbound ACL also filter packets addressed to the router itself?", choices: ["Yes", "No, only packets it routes"], check: (t) => need(t.reply === "Yes", "Inbound ACLs see every packet that arrives on the interface, the router's own addresses included (that is how vty and management traffic is filtered).") },
      { text: "Ping R1 (10.0.12.1) from R2. Why does it fail as well?", choices: ["R1's echo replies come back in on G0/0 and match the deny", "Outbound ACLs block the router's own pings", "R1 has no route to R2", "ICMP is off on R1"], check: (t) => need(t.ran("R2", /^ping 10\.0\.12\.1$/) && t.reply === "R1's echo replies come back in on G0/0 and match the deny", "The echo leaves R2 fine, but the echo reply is ICMP to host 10.0.12.2, arriving inbound on G0/0.") },
      { text: "Change ACL 101 so it drops only echo requests to 10.0.12.2, and let everything else through.", check: (t) => { const a = t.acl("R2", 101); const deny = a?.entries.find((e) => e.action === "deny"); return need(deny?.proto === "icmp" && /^echo$/.test(deny.icmpType ?? deny.icmp ?? deny.type ?? "") && fromRouter(t.dev("R2"), "10.0.12.1", pings(0))?.ok && !fromRouter(t.dev("R1"), "10.0.12.2", pings(0))?.ok, "no access-list 101, then access-list 101 deny icmp any host 10.0.12.2 echo and access-list 101 permit ip any any."); } },
      { text: "Would an outbound ACL on R2's G0/0 have filtered R2's own pings?", choices: ["No: an outbound ACL does not filter traffic the router itself sends", "Yes, always", "Only with the log keyword", "Only for ICMP"], check: (t) => need(t.reply === "No: an outbound ACL does not filter traffic the router itself sends", "Outbound ACLs filter packets routed through the router; packets it originates (its pings, routing updates) skip them.") },
    ],
    solution: { R1: ["enable", "ping 10.0.12.2"], R2: ["enable", "ping 10.0.12.1", "configure terminal", "no access-list 101", "access-list 101 deny icmp any host 10.0.12.2 echo", "access-list 101 permit ip any any", "end", "ping 10.0.12.1"] },
    answers: { 0: "U.U.U", 1: "Yes", 2: "R1's echo replies come back in on G0/0 and match the deny", 4: "No: an outbound ACL does not filter traffic the router itself sends" },
    failingPings: true,
    teach: "An inbound ACL checks every packet that arrives on the interface, including those addressed to the router itself, and the replies to the router's own pings. An outbound ACL checks only packets the router forwards out that interface, not ones it originates. To stop pings to the router without breaking its own, deny icmp ... echo and leave echo-reply alone.",
  }),
  lab({
    id: "acl-log", module: M, title: "Logging ACL matches",
    cmds: ["access-list ... log", "show logging", "show access-lists"],
    devices: [
      R("R1", 50, 25, cfg("interface g0/0", "ip address 10.0.10.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.20.1 255.255.255.0", "no shutdown")),
      HOST("PC1", 15, 55, "linux", { ip: "10.0.10.11/24", gateway: "10.0.10.1" }),
      SRV("SRV1", 85, 55, "10.0.20.80/24", "10.0.20.1"),
    ],
    links: [["R1", "g0/0", "PC1", "fa0"], ["R1", "g0/1", "SRV1", "fa0"]],
    intro: "Security wants a record every time someone on the user LAN pings the server farm, and the pings blocked.",
    tasks: [
      { text: "ACL 110: deny ICMP echo from 10.0.10.0/24 to 10.0.20.0/24 and log it, then permit everything else.", check: (t) => { const e = t.acl("R1", 110)?.entries ?? []; return need(e[0]?.action === "deny" && e[0].proto === "icmp" && e[0].icmp === "echo" && e[0].log && e[1]?.action === "permit" && e[1].proto === "ip", "access-list 110 deny icmp 10.0.10.0 0.0.0.255 10.0.20.0 0.0.0.255 echo log, then access-list 110 permit ip any any."); } },
      { text: "Apply it where the pings come in from the user LAN.", check: (t) => need(t.f("R1", "g0/0").aclIn === "110", "ip access-group 110 in on G0/0.") },
      { text: "Ping 10.0.20.80 from PC1, then read R1's show logging. Which message ID does the entry log?", choices: ["%SEC-6-IPACCESSLOGDP", "%SEC-6-IPACCESSLOGS", "%LINEPROTO-5-UPDOWN", "%SYS-5-CONFIG_I"], check: (t) => need(t.ran("PC1", /^ping .*10\.0\.20\.80/) && t.reply === "%SEC-6-IPACCESSLOGDP", "IPACCESSLOGDP: an ICMP match (with type/code 8/0, an echo). IPACCESSLOGS is a standard ACL, IPACCESSLOGP one with ports.") },
      { text: "How many packets does that log line count?", ask: "Packets", check: (t) => need(is.num(t.reply, 4), "ping -c 4 sends four echoes: ..., 4 packets. show access-lists shows the same 4 matches.") },
      { text: "Which severity level is a SEC-6 message?", choices: ["informational", "notifications", "warnings", "debugging"], check: (t) => need(t.reply === "informational", "Level 6 is informational; logging trap 6 or higher sends it to a syslog server.") },
    ],
    solution: { R1: [...EN, "access-list 110 deny icmp 10.0.10.0 0.0.0.255 10.0.20.0 0.0.0.255 echo log", "access-list 110 permit ip any any", "interface g0/0", "ip access-group 110 in", "end"], PC1: ["ping -c 4 10.0.20.80"], "R1#2": ["show logging", "show access-lists"] },
    answers: { 2: "%SEC-6-IPACCESSLOGDP", 3: "4", 4: "informational" },
    failingPings: true,
    teach: "log at the end of an ACL entry makes the router send a syslog message when the entry matches: %SEC-6-IPACCESSLOGDP for ICMP (with type/code), IPACCESSLOGP for TCP/UDP (with ports), IPACCESSLOGS for a standard ACL. IOS logs the first match at once and then a total every five minutes. Use it on deny entries you want a record of; on a busy permit it costs CPU.",
  }),
];
