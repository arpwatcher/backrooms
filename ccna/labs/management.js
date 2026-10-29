import { lab, R, SRV, cfg, EN, need } from "./kit.js";

const M = "management";
const IMAGE = "c2900-universalk9-mz.SPA.155-3.M.bin";

export default [
  lab({
    id: "show-flash", module: M, title: "show flash and the IOS image",
    cmds: ["show flash", "show version"],
    devices: [R("R1", 50, 30)],
    intro: "Before an upgrade, find out which IOS R1 runs and what is in flash.",
    tasks: [
      { text: "List the files in flash.", check: (t) => need(t.ran("R1", /^(show flash:?|dir( flash:)?)$/), "Run show flash (or dir flash:).") },
      { text: "Display which image was loaded and the configuration register.", check: (t) => need(t.ran("R1", /^show version$/), "Run show version.") },
    ],
    solution: { R1: ["enable", "show flash", "show version"] },
    teach: "Boot sequence: POST, bootstrap (ROM), IOS (from flash, per boot system or the first image found), then the startup-config from NVRAM.",
  }),
  lab({
    id: "boot-system", module: M, title: "boot system",
    cmds: ["boot system flash"],
    devices: [R("R1", 50, 30)],
    intro: `The new image ${IMAGE} has been copied to flash. R1 must boot from it.`,
    tasks: [
      { text: `Set ${IMAGE} as the boot image.`, check: (t) => need(t.dev("R1").boot.includes(IMAGE), `Expected boot system flash:${IMAGE}.`) },
      { text: "Save, or the change is lost at the next reload.", check: (t) => need(t.dev("R1").saved?.boot?.includes(IMAGE), "Run copy running-config startup-config.") },
    ],
    solution: { R1: [...EN, `boot system flash:${IMAGE}`, "end", "copy running-config startup-config", ""] },
    teach: "boot system commands are tried in order. If they all fail, the router loads the first image it finds in flash.",
  }),
  lab({
    id: "config-register", module: M, title: "Configuration register after password recovery",
    cmds: ["config-register", "show version"],
    devices: [R("R1", 50, 30, cfg("config-register 0x2142"))],
    intro: "After a password recovery, R1 booted with 0x2142 (ignore the startup-config). The password has been changed, and the register must go back to normal.",
    tasks: [
      { text: "Set the configuration register back to its normal value.", check: (t) => need(t.dev("R1").configRegister === "0x2102", t.dev("R1").configRegister === "0x2142" ? "With 0x2142 the router ignores the startup-config at every reload." : "The normal value is 0x2102.") },
      { text: "Verify with show version.", check: (t) => need(t.ran("R1", /^show version$/), "Run show version.") },
    ],
    solution: { R1: [...EN, "config-register 0x2102", "end", "show version"] },
    teach: "0x2102 is a normal boot; 0x2142 bypasses NVRAM, for password recovery. The change applies at the next reload.",
  }),
  lab({
    id: "tftp-backup", module: M, title: "Backing up the configuration to TFTP",
    cmds: ["copy running-config tftp:"],
    devices: [R("R1", 30, 30, cfg("interface g0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown")), SRV("TFTP", 75, 30, "10.0.0.100/24")],
    links: [["R1", "g0/0", "TFTP", "fa0"]],
    intro: "Keep a copy of the configuration on the TFTP server 10.0.0.100.",
    tasks: [{ text: "Copy the running-config to 10.0.0.100.", check: (t) => need(t.dev("R1").transfers?.some((x) => x.host === "10.0.0.100" && x.from === "running-config"), "Run copy running-config tftp:, and give 10.0.0.100 when asked for the remote host.") }],
    solution: { R1: ["enable", "copy running-config tftp:", "10.0.0.100", ""] },
    teach: "copy <from> <to> works for every combination: copy tftp: running-config restores (merges), and copy tftp: flash: loads an IOS image. TFTP uses UDP 69 with no authentication.",
  }),
];
