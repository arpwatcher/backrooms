// The Codex: what you've survived. It fills in only after a first contact
// you lived through, and it survives between runs (this browser only).

const KEY = "noclip.codex.v1";

export function loadCodex(storage = globalThis.localStorage) {
  try {
    return new Set(JSON.parse(storage?.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function recordSurvival(codex, kind, storage = globalThis.localStorage) {
  const isNew = !codex.has(kind);
  codex.add(kind);
  try {
    storage?.setItem(KEY, JSON.stringify([...codex]));
  } catch {
    // private mode or storage blocked: the codex just lasts this session
  }
  return isNew;
}
