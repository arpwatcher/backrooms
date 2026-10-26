import { test } from "node:test";
import assert from "node:assert/strict";
import { link } from "../src/net/rtc.js";

const channel = (label, readyState) => ({ label, readyState, sent: [], send(t) { this.sent.push(t); } });

test("a hello sent before the channels open goes out when they do", async () => {
  const l = link({ connectionState: "new" });
  const reliable = channel("reliable", "connecting");
  const fast = channel("fast", "connecting");
  l.adopt(reliable);
  l.adopt(fast);
  l.send("hello");
  assert.deepEqual(reliable.sent, []);
  reliable.readyState = fast.readyState = "open";
  reliable.onopen();
  fast.onopen();
  assert.deepEqual(reliable.sent, ["hello"]);
  await l.open;
});

test("channels handed over already open count as open", async () => {
  const l = link({ connectionState: "connected" });
  l.send("hello");
  const reliable = channel("reliable", "open");
  l.adopt(reliable);
  l.adopt(channel("fast", "open"));
  assert.deepEqual(reliable.sent, ["hello"]);
  await l.open;
});

test("an early snapshot is dropped, not queued", () => {
  const l = link({ connectionState: "new" });
  const fast = channel("fast", "connecting");
  l.adopt(channel("reliable", "connecting"));
  l.adopt(fast);
  l.send("snap", true);
  fast.readyState = "open";
  fast.onopen();
  assert.deepEqual(fast.sent, []);
});
