// Invite and answer codes: how two browsers find each other with no server.
// The host's offer (and the joiner's answer) is a WebRTC session description;
// it travels as one line of text the players copy to each other by any chat.
// Squeezed with deflate where the browser can, then base64url.

export const PREFIX = "NOCLIP1";

function toBase64Url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function squeeze(bytes, how) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(how === "in" ? new CompressionStream("deflate-raw") : new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// kind: "invite" or "answer"; desc: { type, sdp }
export async function encode(kind, desc) {
  const raw = new TextEncoder().encode(JSON.stringify({ k: kind, t: desc.type, s: desc.sdp }));
  const packed = await squeeze(raw, "in");
  return packed ? `${PREFIX}.z.${toBase64Url(packed)}` : `${PREFIX}.p.${toBase64Url(raw)}`;
}

// back to { kind, desc }, or null for anything that isn't one of ours
export async function decode(code) {
  try {
    const [prefix, mode, body] = code.trim().split(".");
    if (prefix !== PREFIX || !body) return null;
    let bytes = fromBase64Url(body);
    if (mode === "z") bytes = await squeeze(bytes, "out");
    const m = JSON.parse(new TextDecoder().decode(bytes));
    if (!["invite", "answer"].includes(m.k) || typeof m.s !== "string") return null;
    return { kind: m.k, desc: { type: m.t, sdp: m.s } };
  } catch {
    return null;
  }
}
