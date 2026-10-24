// A transport for tests: endpoints in one process that deliver messages when
// `pump()` is called, after `delay` pumps, as JSON (so nothing that wouldn't
// survive the wire gets through). Snapshots can be dropped at random, the way
// an unreliable WebRTC channel drops them; everything else always arrives.

export function createLoopback({ delay = 1, drop = 0, rng = Math.random } = {}) {
  const queue = [];
  const endpoints = new Map();
  let now = 0;
  function endpoint(name) {
    const handlers = [];
    const e = {
      name,
      send(to, message) {
        if (message.type === "snapshot" && rng() < drop) return;
        queue.push({ at: now + delay, to, from: name, text: JSON.stringify(message) });
      },
      onMessage(fn) {
        handlers.push(fn);
      },
      deliver(from, text) {
        for (const fn of handlers) fn(from, text);
      },
    };
    endpoints.set(name, e);
    return e;
  }
  function pump() {
    now += 1;
    const due = queue.filter((m) => m.at <= now);
    queue.splice(0, queue.length, ...queue.filter((m) => m.at > now));
    for (const m of due) endpoints.get(m.to)?.deliver(m.from, m.text);
    return due.length;
  }
  return { endpoint, pump, get pending() { return queue.length; } };
}
