// Prints the generator's sample entities as a markdown table, for the
// design document: node tools/entity-samples.mjs [count] [seed]

import { generateEntity } from "../src/entities/generator.js";
import { Rng } from "../src/core/rng.js";

const count = Number(process.argv[2] ?? 30);
const seed = process.argv[3] ?? "gdd-samples";
console.log("| # | Name | Body | Rule | Tell | Counter | Threat |");
console.log("|---|------|------|------|------|---------|--------|");
for (let i = 1; i <= count; i++) {
  const e = generateEntity(new Rng(`${seed}/${i}`));
  console.log(`| ${i} | **${e.name}** | ${e.body}; ${e.behaviour.split(". ")[1].replace(/\.$/, "").toLowerCase()} | ${e.rule} | ${e.tell} | ${e.counter} | ${e.threat} |`);
}
