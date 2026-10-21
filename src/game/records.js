// The deepest level reached on each tier, kept in this browser.

const KEY = "noclip.records.v1";

export function loadRecords(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "{}");
    const records = {};
    for (const [tier, depth] of Object.entries(saved)) {
      if (Number.isInteger(depth) && depth > 0) records[tier] = depth;
    }
    return records;
  } catch {
    return {};
  }
}

// returns true when this is a new deepest for the tier
export function recordDepth(records, tier, depth, storage = globalThis.localStorage) {
  if ((records[tier] ?? 0) >= depth) return false;
  records[tier] = depth;
  try {
    storage?.setItem(KEY, JSON.stringify(records));
  } catch {
    // storage blocked: the record lasts this visit
  }
  return true;
}

export function describeRecords(records, order = ["lucid", "uneasy", "lost", "noclip"]) {
  const parts = order.filter((t) => records[t]).map((t) => `${t} ${records[t]}`);
  return parts.length ? `deepest: ${parts.join(" · ")}` : "";
}
