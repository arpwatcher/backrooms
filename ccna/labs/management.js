import { lab, R, SRV, cfg, EN, need } from "./kit.js";

const M = "management";
const IMAGE = "c2900-universalk9-mz.SPA.155-3.M.bin";

export default [
  lab({
    id: "show-flash", module: M, title: "show flash και IOS image",
    cmds: ["show flash", "show version"],
    devices: [R("R1", 50, 30)],
    intro: "Πριν από αναβάθμιση, μάθε τι IOS τρέχει ο R1 και τι υπάρχει στη flash.",
    tasks: [
      { text: "Δες τα αρχεία της flash.", check: (t) => need(t.ran("R1", /^(show flash:?|dir( flash:)?)$/), "show flash (ή dir flash:)") },
      { text: "Δες ποιο image φόρτωσε και το configuration register.", check: (t) => need(t.ran("R1", /^show version$/), "show version") },
    ],
    solution: { R1: ["enable", "show flash", "show version"] },
    teach: "Η σειρά εκκίνησης: POST, bootstrap (ROM), IOS (από flash, με βάση το boot system ή το πρώτο image), και μετά το startup-config από τη NVRAM.",
  }),
  lab({
    id: "boot-system", module: M, title: "boot system",
    cmds: ["boot system flash"],
    devices: [R("R1", 50, 30)],
    intro: `Ανέβηκε στη flash το νέο image ${IMAGE}. Ο R1 πρέπει να ξεκινά με αυτό.`,
    tasks: [
      { text: `Όρισε το ${IMAGE} ως boot image.`, check: (t) => need(t.dev("R1").boot.includes(IMAGE), `Χρειάζεται boot system flash:${IMAGE}.`) },
      { text: "Αποθήκευσε, αλλιώς η αλλαγή χάνεται στο reload.", check: (t) => need(t.dev("R1").saved?.boot?.includes(IMAGE), "copy running-config startup-config") },
    ],
    solution: { R1: [...EN, `boot system flash:${IMAGE}`, "end", "copy running-config startup-config", ""] },
    teach: "Οι εντολές boot system ελέγχονται με τη σειρά. Αν αποτύχουν όλες, ο router φορτώνει το πρώτο image που βρίσκει στη flash.",
  }),
  lab({
    id: "config-register", module: M, title: "Configuration register μετά από password recovery",
    cmds: ["config-register", "show version"],
    devices: [R("R1", 50, 30, cfg("config-register 0x2142"))],
    intro: "Έγινε password recovery: ο R1 ξεκίνησε με 0x2142 (αγνοεί το startup-config). Το password άλλαξε και τώρα το register πρέπει να γυρίσει στο κανονικό.",
    tasks: [
      { text: "Γύρνα το configuration register στην κανονική τιμή.", check: (t) => need(t.dev("R1").configRegister === "0x2102", t.dev("R1").configRegister === "0x2142" ? "Με 0x2142 ο router θα αγνοεί το startup-config σε κάθε reload." : "Η κανονική τιμή είναι 0x2102.") },
      { text: "Επιβεβαίωσε με show version.", check: (t) => need(t.ran("R1", /^show version$/), "show version") },
    ],
    solution: { R1: [...EN, "config-register 0x2102", "end", "show version"] },
    teach: "0x2102: κανονική εκκίνηση. 0x2142: παράκαμψη της NVRAM, για password recovery. Η αλλαγή ισχύει από το επόμενο reload.",
  }),
  lab({
    id: "tftp-backup", module: M, title: "Backup config σε TFTP",
    cmds: ["copy running-config tftp:"],
    devices: [R("R1", 30, 30, cfg("interface g0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown")), SRV("TFTP", 75, 30, "10.0.0.100/24")],
    links: [["R1", "g0/0", "TFTP", "fa0"]],
    intro: "Κράτα αντίγραφο της ρύθμισης στον TFTP server 10.0.0.100.",
    tasks: [{ text: "Αντέγραψε το running-config στον 10.0.0.100.", check: (t) => need(t.dev("R1").transfers?.some((x) => x.host === "10.0.0.100" && x.from === "running-config"), "copy running-config tftp:, και στην ερώτηση για τον host δώσε 10.0.0.100.") }],
    solution: { R1: ["enable", "copy running-config tftp:", "10.0.0.100", ""] },
    teach: "Το copy <από> <προς> ισχύει για κάθε συνδυασμό: copy tftp: running-config κάνει restore (merge), και copy tftp: flash: ανεβάζει IOS. Το TFTP τρέχει σε UDP 69, χωρίς authentication.",
  }),
];
