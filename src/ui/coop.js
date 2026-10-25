// Co-op from the pause screen. Hosting makes an invite code to send to a
// friend; they paste it into "join", get an answer code back, and send that;
// the host pastes the answer and you are in the same level. Up to three
// friends, one invite each.

export function createCoopScreen({ onHost, onJoin, onClose }) {
  const screen = document.createElement("div");
  screen.id = "coop";
  screen.className = "screen hidden";
  screen.innerHTML = `
    <h2>co-op</h2>
    <p class="sub">no server: you swap two codes by any chat</p>
    <div class="row">
      <button id="coop-host">host - invite a friend</button>
      <button id="coop-join">join a friend</button>
    </div>
    <textarea id="coop-out" readonly rows="4" placeholder="your code appears here - copy it and send it"></textarea>
    <textarea id="coop-in" rows="4" placeholder="paste the code your friend sent you"></textarea>
    <div class="row">
      <button id="coop-use">use their code</button>
      <button id="coop-close">back</button>
    </div>
    <p id="coop-status" class="small"></p>`;
  document.body.appendChild(screen);
  const out = screen.querySelector("#coop-out");
  const input = screen.querySelector("#coop-in");
  const status = screen.querySelector("#coop-status");
  let pending = null; // what "use their code" does next
  const say = (text) => (status.textContent = text);
  // the code goes onto the clipboard as well, where the browser allows it
  const offer = (code) => {
    out.value = code;
    out.select();
    navigator.clipboard?.writeText(code).catch(() => {});
  };
  screen.querySelector("#coop-host").onclick = async () => {
    say("making an invite...");
    try {
      const invite = await onHost();
      offer(invite.code);
      pending = async (code) => {
        say("connecting...");
        await invite.accept(code);
        say("connected - they're in your level");
      };
      say("invite copied - send it to a friend, then paste their answer below");
    } catch (e) {
      say(e.message);
    }
  };
  screen.querySelector("#coop-join").onclick = () => {
    out.value = "";
    pending = async (code) => {
      say("answering...");
      const answer = await onJoin(code);
      offer(answer.code);
      say("answer copied - send it back to the host; you join their level when they use it");
      pending = null;
    };
    say("paste the host's invite below, then press use their code");
  };
  screen.querySelector("#coop-use").onclick = async () => {
    if (!pending) return say("host or join first");
    try {
      await pending(input.value);
      input.value = "";
    } catch (e) {
      say(e.message);
    }
  };
  screen.querySelector("#coop-close").onclick = onClose;
  return {
    show() {
      screen.classList.remove("hidden");
    },
    hide() {
      screen.classList.add("hidden");
    },
    get shown() {
      return !screen.classList.contains("hidden");
    },
    say,
  };
}
