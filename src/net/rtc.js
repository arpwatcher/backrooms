// WebRTC between browsers, behind the same endpoint interface as the
// loopback (send(to, message), onMessage(fn(from, text))), so the host and
// peers in session.js run over it unchanged. Two data channels per link: a
// reliable, ordered one for hellos, inputs and events, and an unordered one
// that never retransmits, for snapshots (a late snapshot is a useless one).
// Signalling is by hand: the host's invite code and the joiner's answer code.

import { encode, decode } from "./codes.js";

export const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

// gathering every candidate first means the code carries them all
function gathered(pc, ms = 4000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === "complete") resolve();
    };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, ms);
  });
}

export function link(pc) {
  const channels = {};
  const handlers = [];
  // reliable messages sent before the channel opens wait for it (a peer says
  // hello the moment it exists); snapshots that early are just dropped
  const waiting = [];
  let opened;
  const open = new Promise((resolve) => (opened = resolve));
  const adopt = (channel) => {
    channels[channel.label] = channel;
    channel.onmessage = (e) => handlers.forEach((fn) => fn(e.data));
    channel.onopen = () => {
      if (channels.reliable?.readyState === "open") while (waiting.length) channels.reliable.send(waiting.shift());
      if (channels.reliable?.readyState === "open" && channels.fast?.readyState === "open") opened();
    };
    // the joiner can be handed a channel that is already open, and then the
    // open event never comes
    if (channel.readyState === "open") channel.onopen();
  };
  return {
    pc,
    adopt,
    open,
    send(text, fast = false) {
      const c = fast ? channels.fast : channels.reliable;
      if (c?.readyState === "open") c.send(text);
      else if (!fast) waiting.push(text);
    },
    onMessage(fn) {
      handlers.push(fn);
    },
    get state() {
      return pc.connectionState;
    },
    // for debugging: each channel's state, and how much is still queued
    get channels() {
      return `${channels.reliable?.readyState ?? "none"}/${channels.fast?.readyState ?? "none"}/${waiting.length}`;
    },
    close() {
      pc.close();
    },
  };
}

// host: make an invite; give the code to a friend, then accept their answer
export async function createInvite({ iceServers = ICE } = {}) {
  const pc = new RTCPeerConnection({ iceServers });
  const l = link(pc);
  l.adopt(pc.createDataChannel("reliable", { ordered: true }));
  l.adopt(pc.createDataChannel("fast", { ordered: false, maxRetransmits: 0 }));
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  return {
    code: await encode("invite", pc.localDescription),
    link: l,
    async accept(answerCode) {
      const d = await decode(answerCode);
      if (!d || d.kind !== "answer") throw new Error("that isn't an answer code");
      await pc.setRemoteDescription(d.desc);
      return l.open;
    },
  };
}

// joiner: turn the host's invite into an answer code to send back
export async function answerInvite(inviteCode, { iceServers = ICE } = {}) {
  const d = await decode(inviteCode);
  if (!d || d.kind !== "invite") throw new Error("that isn't an invite code");
  const pc = new RTCPeerConnection({ iceServers });
  const l = link(pc);
  pc.ondatachannel = (e) => l.adopt(e.channel);
  await pc.setRemoteDescription(d.desc);
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { code: await encode("answer", pc.localDescription), link: l };
}

// many links (the host's, one per friend) as one endpoint for session.js
export function rtcEndpoint(name) {
  const links = new Map();
  const handlers = [];
  return {
    name,
    links,
    add(peer, l) {
      links.set(peer, l);
      l.onMessage((text) => handlers.forEach((fn) => fn(peer, text)));
    },
    send(to, message) {
      links.get(to)?.send(JSON.stringify(message), message.type === "snapshot");
    },
    onMessage(fn) {
      handlers.push(fn);
    },
  };
}
