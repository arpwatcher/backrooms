import { lab, need, is } from "./kit.js";

// Blueprint topics the exam asks about from an exhibit rather than a CLI:
// automation and data formats, REST, wireless, QoS. No devices, just the
// exhibit and the questions.
const M = "exhibits";
const ex = (def) => lab({ module: M, devices: [], links: [], solution: {}, ...def });
const pick = (want, hint) => (t) => need(t.reply === want, hint);

export default [
  ex({
    id: "ex-json", title: "Reading JSON from RESTCONF",
    cmds: ["JSON", "RESTCONF", "YANG"],
    intro: "A RESTCONF GET for one interface on R1 returned this body.",
    exhibit: `{
  "ietf-interfaces:interface": {
    "name": "GigabitEthernet0/1",
    "description": "to R2",
    "type": "iana-if-type:ethernetCsmacd",
    "enabled": true,
    "ietf-ip:ipv4": {
      "address": [
        {
          "ip": "10.0.12.1",
          "netmask": "255.255.255.252"
        }
      ]
    }
  }
}`,
    tasks: [
      { text: "What JSON type is the value of \"enabled\"?", choices: ["boolean", "string", "number", "object"], check: pick("boolean", "true without quotes is a boolean; \"true\" in quotes would be a string.") },
      { text: "What JSON type is the value of \"address\"?", choices: ["array", "object", "string", "boolean"], check: pick("array", "Square brackets hold an array (an ordered list); here a list of one object.") },
      { text: "How many JSON objects are in the body, counting the outermost one?", ask: "Number", check: (t) => need(is.num(t.reply, 4), "Count the pairs of curly braces: the body, the interface, ipv4, and the one address.") },
      { text: "What prefix length does that address and netmask give?", ask: "/n", check: (t) => need(is.prefix(t.reply, 30), "255.255.255.252 has 30 bits set.") },
      { text: "Which YANG module defines the \"ipv4\" container in this body?", choices: ["ietf-ip", "ietf-interfaces", "iana-if-type", "openconfig-interfaces"], check: pick("ietf-ip", "A key prefixed with module:name comes from that module.") },
    ],
    answers: { 0: "boolean", 1: "array", 2: "4", 3: "30", 4: "ietf-ip" },
    teach: "JSON values are strings (in double quotes), numbers, booleans (true, false), null, objects ({ } with key: value pairs) and arrays ([ ] lists). Keys are always strings. RESTCONF returns YANG-modelled data as JSON or XML, and a key such as ietf-ip:ipv4 names the YANG module it comes from.",
  }),
  ex({
    id: "ex-rest", title: "A REST call and its answer",
    cmds: ["REST", "HTTP", "CRUD"],
    intro: "A script talks to the RESTCONF API on R1. These are two requests and the answers they got.",
    exhibit: `GET /restconf/data/ietf-interfaces:interfaces/interface=GigabitEthernet0%2F2 HTTP/1.1
Host: 10.0.0.1
Accept: application/yang-data+json
Authorization: Basic YWRtaW46Q2lzY28xMjM=

HTTP/1.1 404 Not Found

PUT /restconf/data/ietf-interfaces:interfaces/interface=GigabitEthernet0%2F2 HTTP/1.1
Host: 10.0.0.1
Content-Type: application/yang-data+json
Authorization: Basic YWRtaW46Q2lzY28xMjM=

{ "ietf-interfaces:interface": { "name": "GigabitEthernet0/2", "enabled": true } }

HTTP/1.1 201 Created`,
    tasks: [
      { text: "Which CRUD operation does the first request perform?", choices: ["Read", "Create", "Update", "Delete"], check: pick("Read", "GET reads; POST creates; PUT and PATCH update or replace; DELETE deletes.") },
      { text: "What does the answer to the first request say?", choices: ["The resource does not exist", "The credentials were refused", "The request was malformed", "The server failed"], check: pick("The resource does not exist", "404 is Not Found. 401 would be bad credentials, 400 a bad request, 500 a server error.") },
      { text: "Which username does the Authorization header carry? (Basic is Base64 of user:password)", ask: "Username", check: (t) => need(is.text(t.reply, "admin"), "YWRtaW46Q2lzY28xMjM= decodes to admin:Cisco123: Basic authentication is encoding, not encryption, so it needs HTTPS.") },
      { text: "In which data format does the script ask for the answer?", choices: ["JSON", "XML", "YAML", "CSV"], check: pick("JSON", "Accept: application/yang-data+json asks for YANG data encoded as JSON.") },
      { text: "Which status class does 201 Created belong to?", choices: ["2xx success", "3xx redirection", "4xx client error", "5xx server error"], check: pick("2xx success", "1xx informational, 2xx success, 3xx redirection, 4xx client error, 5xx server error.") },
    ],
    answers: { 0: "Read", 1: "The resource does not exist", 2: "admin", 3: "JSON", 4: "2xx success" },
    teach: "REST maps CRUD onto HTTP: POST creates, GET reads, PUT replaces, PATCH updates part of a resource, DELETE deletes. The status code says what happened (200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error). Accept says which format the client wants back, Content-Type which format it is sending.",
  }),
  ex({
    id: "ex-ansible", title: "An Ansible playbook",
    cmds: ["Ansible", "YAML", "Puppet", "Chef"],
    intro: "The operations team pushes NTP to every router with this playbook.",
    exhibit: `---
- name: set ntp on the routers
  hosts: routers
  gather_facts: no
  connection: network_cli

  tasks:
    - name: ntp server
      cisco.ios.ios_config:
        lines:
          - ntp server 10.30.30.5
          - ntp update-calendar`,
    tasks: [
      { text: "In which language is a playbook written?", choices: ["YAML", "JSON", "Ruby", "Python"], check: pick("YAML", "Ansible playbooks are YAML; Puppet manifests use Puppet's own DSL, Chef recipes Ruby.") },
      { text: "How does Ansible reach the routers?", choices: ["Agentless, over SSH, pushing from the control node", "With an agent on each router that pulls its configuration", "Over SNMP traps", "Over NETCONF only, with an agent"], check: pick("Agentless, over SSH, pushing from the control node", "Ansible needs no agent: the control node connects (here network_cli over SSH) and pushes. Puppet and Chef use agents that pull.") },
      { text: "Which inventory group does the play run against?", ask: "Group", check: (t) => need(is.text(t.reply, "routers"), "hosts: names the inventory group.") },
      { text: "How many configuration lines does the task send to each router?", ask: "Number", check: (t) => need(is.num(t.reply, 2), "The list under lines: has two entries.") },
      { text: "Which of these tools uses agents that pull their configuration from a server?", choices: ["Puppet", "Ansible", "both", "neither"], check: pick("Puppet", "Puppet (and Chef) agents pull from a master/server; Ansible pushes without agents.") },
    ],
    answers: { 0: "YAML", 1: "Agentless, over SSH, pushing from the control node", 2: "routers", 3: "2", 4: "Puppet" },
    teach: "Configuration management tools: Ansible is agentless and push-based, written in YAML playbooks and run over SSH (or NETCONF/APIs); Puppet uses agents that pull from a server, with manifests in its own language; Chef uses agents too, with recipes and cookbooks in Ruby. All of them keep many devices consistent from one definition.",
  }),
  ex({
    id: "ex-qos", title: "QoS markings in a capture",
    cmds: ["DSCP", "CoS", "LLQ"],
    intro: "Two packets captured on the uplink of an access switch, from the phone and the video endpoint in a meeting room.",
    exhibit: `Frame 118: 214 bytes on wire
Ethernet II, Src: 00:1b:54:a1:22:10, Dst: 00:50:79:66:6e:01
802.1Q Virtual LAN, PRI: 5, DEI: 0, ID: 20
Internet Protocol Version 4, Src: 10.10.20.15, Dst: 10.30.30.40
    Differentiated Services Field: 0xb8 (DSCP: EF, ECN: Not-ECT)
User Datagram Protocol, Src Port: 16384, Dst Port: 16386

Frame 119: 1110 bytes on wire
Ethernet II, Src: 00:1b:54:a1:22:31, Dst: 00:50:79:66:6e:01
802.1Q Virtual LAN, PRI: 4, DEI: 0, ID: 10
Internet Protocol Version 4, Src: 10.10.10.31, Dst: 10.30.30.41
    Differentiated Services Field: 0x88 (DSCP: AF41, ECN: Not-ECT)
User Datagram Protocol, Src Port: 5004, Dst Port: 5004`,
    tasks: [
      { text: "What decimal DSCP value does frame 118 carry?", ask: "Number", check: (t) => need(is.num(t.reply, 46), "EF is 46: the DS field 0xb8 is 184, and DSCP is its top six bits (184 / 4).") },
      { text: "What decimal DSCP value is AF41?", ask: "Number", check: (t) => need(is.num(t.reply, 34), "AFxy = 8x + 2y: 8*4 + 2*1 = 34 (and 0x88 = 136 = 34 * 4).") },
      { text: "Which traffic is frame 118 most likely?", choices: ["Voice (RTP)", "Interactive video", "Bulk data", "Network control"], check: pick("Voice (RTP)", "EF with CoS 5, small UDP packets on RTP ports: voice.") },
      { text: "Which Layer 2 field carries the CoS value 5?", choices: ["The PCP (PRI) bits of the 802.1Q tag", "The DSCP bits of the IP header", "The Ethernet type field", "The DEI bit"], check: pick("The PCP (PRI) bits of the 802.1Q tag", "CoS is the 3-bit priority (PCP) field of the 802.1Q tag, so it exists only on trunks/tagged links.") },
      { text: "Which queuing should give frame 118 a strict-priority queue with a cap on its bandwidth?", choices: ["LLQ", "WRED", "FIFO", "Policing to zero"], check: pick("LLQ", "Low Latency Queuing adds a strict priority queue (policed so it cannot starve the others) to CBWFQ.") },
      { text: "Where should the trust boundary for these markings be?", choices: ["At the access switch port facing the phone", "At the core switches", "At the WAN router only", "At the server"], check: pick("At the access switch port facing the phone", "Classify and mark (or trust a known IP phone) as close to the source as possible: the access edge.") },
    ],
    answers: { 0: "46", 1: "34", 2: "Voice (RTP)", 3: "The PCP (PRI) bits of the 802.1Q tag", 4: "LLQ", 5: "At the access switch port facing the phone" },
    teach: "DSCP is the top six bits of the IP DS field: EF (46) for voice, AF41 (34) for interactive video, CS0/default for best effort; AFxy = 8x + 2y. CoS is the 3-bit PCP field in the 802.1Q tag (5 for voice). Mark close to the source and trust only devices you control (the trust boundary); queue voice with LLQ, a policed strict-priority queue on top of CBWFQ.",
  }),
  ex({
    id: "ex-wlc", title: "A wireless LAN controller",
    cmds: ["WLC", "CAPWAP", "WPA3"],
    intro: "From the WLC that runs the office's lightweight APs.",
    exhibit: `(Cisco Controller) >show wlan summary

Number of WLANs.................................. 3

WLAN ID  WLAN Profile Name / SSID               Status    Interface Name
-------  -------------------------------------  --------  --------------------
1        CORP / CORP                            Enabled   corp
2        GUEST / GUEST                          Enabled   guest
3        LAB / LAB                              Disabled  lab

(Cisco Controller) >show wlan 1
...
Security
   802.11 Authentication:........................ Open System
   Static WEP Keys............................... Disabled
   Wi-Fi Protected Access (WPA/WPA2/WPA3)........ Enabled
      WPA3 (SAE)................................. Disabled
      WPA2 (RSN)................................. Enabled
         CCMP (AES) Cipher....................... Enabled
      Auth Key Management
         802.1x.................................. Enabled
         PSK..................................... Disabled`,
    tasks: [
      { text: "How many SSIDs do clients see?", ask: "Number", check: (t) => need(is.num(t.reply, 2), "Only the enabled WLANs are broadcast: CORP and GUEST.") },
      { text: "How does a client authenticate on CORP?", choices: ["802.1X with a RADIUS server (WPA2-Enterprise)", "A pre-shared key (WPA2-Personal)", "SAE (WPA3-Personal)", "Open, no authentication"], check: pick("802.1X with a RADIUS server (WPA2-Enterprise)", "WPA2 with 802.1x key management is Enterprise mode; PSK is Disabled.") },
      { text: "Which encryption protects CORP's traffic?", choices: ["AES (CCMP)", "TKIP", "WEP", "None"], check: pick("AES (CCMP)", "WPA2 uses CCMP, which is AES.") },
      { text: "What replaces the PSK exchange in WPA3-Personal?", choices: ["SAE", "802.1X", "TKIP", "WPS"], check: pick("SAE", "Simultaneous Authentication of Equals, resistant to offline dictionary attacks.") },
      { text: "Which protocol tunnels traffic between the lightweight APs and this WLC?", choices: ["CAPWAP", "GRE", "IPsec", "LWAPP over TCP"], check: pick("CAPWAP", "CAPWAP: UDP 5246 for control (DTLS-encrypted) and UDP 5247 for data.") },
      { text: "Each WLAN maps to an interface on the WLC. What does that interface map the SSID to?", choices: ["A VLAN on the wired network", "An AP group", "A RADIUS server", "A radio channel"], check: pick("A VLAN on the wired network", "A dynamic interface ties the WLAN to a VLAN (and subnet) on the WLC's trunk to the switch.") },
    ],
    answers: { 0: "2", 1: "802.1X with a RADIUS server (WPA2-Enterprise)", 2: "AES (CCMP)", 3: "SAE", 4: "CAPWAP", 5: "A VLAN on the wired network" },
    teach: "Lightweight APs (split MAC) tunnel to a WLC with CAPWAP, UDP 5246 control and 5247 data. Each WLAN (SSID) maps to a dynamic interface, that is a VLAN on the WLC's trunk. Personal modes use a passphrase (WPA2 PSK, WPA3 SAE), Enterprise modes 802.1X against a RADIUS server; WPA2 encrypts with AES-CCMP, WPA3 with AES-GCMP or CCMP.",
  }),
];
