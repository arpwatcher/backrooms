import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, decode, PREFIX } from "../src/net/codes.js";

const sdp = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n".repeat(6);

test("an invite survives the trip through a line of text, and comes out shorter", async () => {
  const code = await encode("invite", { type: "offer", sdp });
  assert.ok(code.startsWith(`${PREFIX}.`));
  assert.ok(!/\s/.test(code), "one line, nothing to break in a chat");
  assert.ok(code.length < sdp.length, `${code.length} < ${sdp.length}`);
  assert.deepEqual(await decode(code), { kind: "invite", desc: { type: "offer", sdp } });
});

test("anything that isn't one of our codes is turned away", async () => {
  assert.equal(await decode("hello"), null);
  assert.equal(await decode(`${PREFIX}.z.!!!!`), null);
  assert.equal(await decode(`OTHER1.p.${btoa("{}")}`), null);
});
