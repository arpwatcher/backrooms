import { lab, S, L3, cfg, EN, need } from "./kit.js";

const M = "etherchannel";
const pair = (a = [], b = []) => [S("SW1", 25, 30, a), S("SW2", 75, 30, b)];
const links = [["SW1", "g0/1", "SW2", "g0/1"], ["SW1", "g0/2", "SW2", "g0/2"]];
const both = (t, sw, ok) => ["g0/1", "g0/2"].every((p) => ok(t.f(sw, p)));

export default [
  lab({
    id: "lacp", module: M, title: "EtherChannel με LACP",
    cmds: ["channel-group mode active", "show etherchannel summary"],
    devices: pair(), links,
    intro: "Οι δύο σύνδεσμοι ανάμεσα στους switches πρέπει να γίνουν ένα λογικό link 2 Gbps, με το ανοιχτό πρότυπο.",
    tasks: [
      { text: "SW1: βάλε τις G0/1 και G0/2 στο channel-group 1 με LACP σε active.", check: (t) => need(both(t, "SW1", (f) => f.channel?.group === 1 && f.channel.mode === "active"), "Στον SW1 οι G0/1-2 χρειάζονται channel-group 1 mode active.") },
      { text: "SW2: βάλε τις G0/1 και G0/2 στο channel-group 1 με LACP (active ή passive).", check: (t) => need(both(t, "SW2", (f) => f.channel?.group === 1 && ["active", "passive"].includes(f.channel.mode)), "Στον SW2 χρειάζεται channel-group 1 mode active ή passive.") },
      { text: "Επιβεβαίωσε ότι οι θύρες είναι bundled (P) στο Po1.", check: (t) => need(t.bundled("SW1", "g0/1") && t.bundled("SW1", "g0/2") && t.ran("SW1", /^show etherchannel summary$/), "Δες show etherchannel summary στον SW1. Οι θύρες πρέπει να είναι (P).") },
    ],
    solution: { SW1: [...EN, "interface range g0/1 - 2", "channel-group 1 mode active", "end", "show etherchannel summary"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 1 mode passive"] },
    teach: "LACP (802.3ad): active+active ή active+passive = bundle. passive+passive = όχι. Οι θύρες πρέπει να έχουν ίδια speed, duplex, mode και VLANs. Το Port-channel1 φτιάχνεται αυτόματα.",
  }),
  lab({
    id: "pagp", module: M, title: "EtherChannel με PAgP",
    cmds: ["channel-group mode desirable", "channel-group mode auto"],
    devices: pair(), links,
    intro: "Το δίκτυο είναι μόνο Cisco και η ομάδα θέλει PAgP.",
    tasks: [
      { text: "SW1: G0/1-2 στο channel-group 2 με PAgP desirable.", check: (t) => need(both(t, "SW1", (f) => f.channel?.group === 2 && f.channel.mode === "desirable"), "Στον SW1 χρειάζεται channel-group 2 mode desirable.") },
      { text: "SW2: G0/1-2 στο channel-group 2 με PAgP auto.", check: (t) => need(both(t, "SW2", (f) => f.channel?.group === 2 && f.channel.mode === "auto"), "Στον SW2 χρειάζεται channel-group 2 mode auto.") },
      { text: "Το EtherChannel να σχηματίζεται.", check: (t) => need(t.bundled("SW1", "g0/1"), "Το channel δεν σχηματίζεται: auto+auto δεν κάνει bundle, χρειάζεται τουλάχιστον ένα desirable.") },
    ],
    solution: { SW1: [...EN, "interface range g0/1 - 2", "channel-group 2 mode desirable"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 2 mode auto"] },
    teach: "PAgP (Cisco): desirable+desirable ή desirable+auto = bundle. auto+auto = όχι. Δεν ανακατεύεις PAgP με LACP.",
  }),
  lab({
    id: "static-on", module: M, title: "Στατικό EtherChannel (mode on)",
    cmds: ["channel-group mode on"],
    devices: pair(), links,
    intro: "Ο SW2 δεν υποστηρίζει κανένα πρωτόκολλο διαπραγμάτευσης.",
    tasks: [{ text: "Φτιάξε το channel-group 3 χωρίς πρωτόκολλο (on) στις G0/1-2 και των δύο switches.", check: (t) => need(["SW1", "SW2"].every((s) => both(t, s, (f) => f.channel?.group === 3 && f.channel.mode === "on")) && t.bundled("SW1", "g0/1"), "Θέλει channel-group 3 mode on και στις δύο άκρες. Το on δουλεύει μόνο με on.") }],
    solution: { SW1: [...EN, "interface range g0/1 - 2", "channel-group 3 mode on"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 3 mode on"] },
    teach: "Το mode on δεν στέλνει τίποτα για να ελέγξει την άλλη άκρη. Αν η άλλη πλευρά δεν είναι επίσης on, μπορεί να δημιουργηθεί loop. Γι' αυτό προτιμάται το LACP.",
  }),
  lab({
    id: "po-trunk", module: M, title: "Trunk πάνω σε Port-channel",
    cmds: ["interface port-channel", "switchport mode trunk"],
    devices: pair(cfg("interface range g0/1 - 2", "channel-group 1 mode active")), links: links,
    intro: "Το Po1 στον SW1 υπάρχει ήδη. Πρέπει να μεταφέρει όλες τις VLANs, και να φτιαχτεί και στον SW2.",
    tasks: [
      { text: "Στον SW1, κάνε το Port-channel1 trunk, ρυθμίζοντας το ίδιο το port-channel.", check: (t) => need(t.f("SW1", "po1")?.mode === "trunk" && t.ran("SW1", /^interface Port-channel1$/), "Μπες στο interface port-channel 1 και βάλε switchport mode trunk.") },
      { text: "Στον SW2, φτιάξε το ίδιο bundle (LACP, group 1) και κάνε το Port-channel1 trunk.", check: (t) => need(both(t, "SW2", (f) => f.channel?.group === 1) && t.f("SW2", "po1")?.mode === "trunk", "Στον SW2: channel-group 1 mode active/passive στις G0/1-2 και switchport mode trunk στο Po1.") },
    ],
    solution: { SW1: [...EN, "interface port-channel 1", "switchport mode trunk"], SW2: [...EN, "interface range g0/1 - 2", "channel-group 1 mode passive", "interface port-channel 1", "switchport mode trunk"] },
    teach: "Μετά το bundle ρυθμίζεις το interface Port-channel και όχι τις θύρες-μέλη. Οι ρυθμίσεις του περνάνε στα μέλη.",
  }),
  lab({
    id: "l3-etherchannel", module: M, title: "Layer 3 EtherChannel",
    cmds: ["no switchport", "channel-group", "interface port-channel", "ip address"],
    devices: [L3("CORE1", 25, 30), L3("CORE2", 75, 30, cfg("interface range g0/1 - 2", "no switchport", "channel-group 1 mode active", "interface port-channel 1", "no switchport", "ip address 10.0.0.2 255.255.255.252"))],
    links: [["CORE1", "g0/1", "CORE2", "g0/1"], ["CORE1", "g0/2", "CORE2", "g0/2"]],
    intro: "Ανάμεσα στους δύο core switches θέλουμε ένα routed link με EtherChannel. Ο CORE2 είναι ήδη έτοιμος.",
    tasks: [
      { text: "Στον CORE1, κάνε τις G0/1-2 routed (όχι switchport) και βάλε τες στο channel-group 1 με LACP.", check: (t) => need(both(t, "CORE1", (f) => !f.switchport && f.channel?.group === 1 && ["active", "passive"].includes(f.channel.mode)), "Χρειάζεται no switchport και channel-group 1 mode active στις G0/1-2.") },
      { text: "Δώσε στο Port-channel1 του CORE1 τη 10.0.0.1/30.", check: (t) => need(t.ip("CORE1", "po1") === "10.0.0.1/30", `Στο Po1 βρέθηκε ${t.ip("CORE1", "po1") ?? "τίποτα"}. Το Po1 θέλει πρώτα no switchport.`) },
    ],
    solution: { CORE1: [...EN, "interface range g0/1 - 2", "no switchport", "channel-group 1 mode active", "interface port-channel 1", "no switchport", "ip address 10.0.0.1 255.255.255.252"] },
    teach: "Σε L3 EtherChannel κάνεις no switchport πριν το channel-group, ώστε το Port-channel να γίνει routed. Η IP μπαίνει στο Port-channel.",
  }),
  lab({
    id: "sim-etherchannel", module: M, title: "Sim: διόρθωσε το EtherChannel", kind: "sim",
    cmds: ["channel-group", "show etherchannel summary", "switchport mode trunk"],
    devices: pair(cfg("interface range g0/1 - 2", "switchport mode trunk", "channel-group 1 mode passive"), cfg("interface range g0/1 - 2", "switchport mode trunk", "channel-group 1 mode passive")), links,
    intro: "Κάποιος ρύθμισε LACP και στους δύο switches, αλλά το Po1 δεν ανεβαίνει ποτέ. Βρες γιατί και διόρθωσέ το.",
    tasks: [
      { text: "Δες την κατάσταση του EtherChannel στον SW1.", check: (t) => need(t.ran("SW1", /^show etherchannel summary$/), "Ξεκίνα με show etherchannel summary.") },
      { text: "Διόρθωσε ώστε οι G0/1 και G0/2 να είναι bundled (P) και στις δύο πλευρές, με LACP.", check: (t) => need(["SW1", "SW2"].every((s) => both(t, s, (f) => ["active", "passive"].includes(f.channel?.mode))) && t.bundled("SW1", "g0/1") && t.bundled("SW1", "g0/2"), "passive + passive δεν σχηματίζει ποτέ LACP channel: μία πλευρά πρέπει να είναι active.") },
      { text: "Το Port-channel1 να είναι trunk και στις δύο πλευρές.", check: (t) => need(t.f("SW1", "po1")?.mode === "trunk" && t.f("SW2", "po1")?.mode === "trunk", "Το Po1 δεν είναι trunk σε κάποια πλευρά.") },
    ],
    solution: { SW1: ["enable", "show etherchannel summary", "configure terminal", "interface range g0/1 - 2", "channel-group 1 mode active", "interface port-channel 1", "switchport mode trunk"], SW2: [...EN, "interface port-channel 1", "switchport mode trunk"] },
    teach: "Στην εξέταση τα troubleshooting sims ξεκινούν με show. Στο show etherchannel summary, το (I) σημαίνει stand-alone (δεν μπήκε στο bundle) και το (P) bundled.",
  }),
];
