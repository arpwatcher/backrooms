import { test } from "node:test";
import assert from "node:assert/strict";
import { LABS } from "../ccna/labs/index.js";
import { buildLab, checkLab, runSolution } from "../ccna/engine/lab.js";

test("every lab has a unique id, a module, tasks and a solution", () => {
  const ids = new Set();
  for (const l of LABS) {
    assert.ok(!ids.has(l.id), `duplicate lab id ${l.id}`);
    ids.add(l.id);
    assert.ok(l.module && l.title && l.tasks.length && l.solution, `lab ${l.id} is missing parts`);
  }
});

for (const def of LABS) {
  test(`lab ${def.id}: the answer passes every task, and doing nothing doesn't`, () => {
    const fresh = buildLab(def);
    const before = checkLab(fresh);
    assert.ok(before.some((r) => !r.ok), `${def.id}: passes before anything is typed`);
    const lab = buildLab(def);
    const out = runSolution(lab);
    const bad = out.filter((o) => /% Invalid|% Incomplete|% Ambiguous|Bad mask|overlaps with|rejected/.test(o.out));
    assert.deepEqual(bad.map((o) => `${o.name}: ${o.line} -> ${o.out}`), [], `${def.id}: the answer has commands IOS rejects`);
    const after = checkLab(lab);
    assert.deepEqual(after.filter((r) => !r.ok).map((r) => `${r.text} -> ${r.why}`), [], `${def.id}: the answer fails`);
  });
}

// a ping, traceroute or session in a model answer has to work, unless the
// lab's point is to watch one fail first
const failed = /Success rate is 0|\n {2}\d+ {2}\* {2}\* {2}\*|% Connection (refused|timed out)|Received = 0|100% packet loss|Request timed out|port 22: Connection/;
for (const def of LABS) {
  if (def.failingPings) continue;
  test(`lab ${def.id}: the pings in the answer get their replies`, () => {
    const lab = buildLab(def);
    const bad = runSolution(lab).filter((o) => /^(do )?(ping|traceroute|tracert|telnet|ssh)\b/.test(o.line) && failed.test(o.out));
    assert.deepEqual(bad.map((o) => `${o.name}: ${o.line}`), []);
  });
}
