// The tunnel's echo: inside the tunnel the train's sounds come back off the walls, a little darker each time. It is a
// delay with feedback, tapped from the train's own bus (mixer.js `train`) and joining the effects bus, so the chugs,
// the clicks, the steam and the whistle all echo while the music and the ambience do not. How loud it is follows how
// far inside she is, so it comes up as she goes in and dies away as she comes out, with the tail of the last sound
// still ringing for a moment.
//
// It holds its four nodes in the kit's budget only while the train is near the tunnel (sfx.js says when), builds
// them then and cuts them loose, giving the budget back, as the train moves away. With no room in the budget there
// is no echo, and nothing else is the worse for it.

/**
 * The echo. DELAY: s between a sound and its echo. FEEDBACK: how much of each echo is fed round again, so the repeats
 * die away. TONE: Hz of the low-pass in the loop, which darkens every repeat. SEND: how much of the train's sound
 * goes in at full depth, so the wet path is about −10 dB under the dry one. NODES: how many audio nodes the chain
 * holds. NEAR: how close to the tunnel (m, from either mouth) the chain stands built.
 */
export const ECHO = Object.freeze({ DELAY: 0.11, FEEDBACK: 0.38, TONE: 2400, SEND: 0.32, NODES: 4, NEAR: 40 });

/** The send follows how far inside she is with this time constant (s), so a jump into the tunnel does not click. */
const FOLLOW = 0.05;

/**
 * @typedef {{ update: (inside: number, near: boolean) => void, release: () => void, readonly held: boolean }} TunnelEcho
 */

/**
 * The tunnel's echo on `kit`. `update(inside, near)` every frame: `inside` (0 to 1) is how far inside the tunnel the
 * train is, and `near` whether it is within ECHO.NEAR metres of it, which builds the chain if there is room for it
 * and releases it when not. `release()` lets it go at once (a jump, or the sound going off). `held` is whether the
 * chain stands built now.
 * @param {import('./sfx.js').Kit} kit
 * @returns {TunnelEcho}
 */
export function createTunnelEcho(kit) {
  const { ctx } = kit;
  /** The chain, and the depth its send was last set for. @type {{ send: GainNode, nodes: AudioNode[], inside: number }|null} */
  let chain = null;

  /** The train bus into a send, a delay and a low-pass, into the effects bus; the low-pass feeds the delay back too. */
  function build() {
    if (!kit.hold(ECHO.NODES)) return;
    const send = ctx.createGain();
    send.gain.value = 0;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = ECHO.DELAY;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = ECHO.TONE;
    const feedback = ctx.createGain();
    feedback.gain.value = ECHO.FEEDBACK;
    send.connect(delay);
    delay.connect(tone);
    tone.connect(kit.buses.effects);
    tone.connect(feedback);
    feedback.connect(delay);
    kit.buses.train.connect(send);
    chain = { send, nodes: [send, delay, tone, feedback], inside: 0 };
  }

  function release() {
    if (!chain) return;
    // The train bus is shared: only the tap off it is cut. Every node of the chain, the loop included, is cut loose.
    try {
      kit.buses.train.disconnect(chain.send);
    } catch {
      // A browser that cannot cut one connection leaves the send hanging off the bus, cut off from all the rest.
    }
    for (const node of chain.nodes) node.disconnect();
    chain = null;
    kit.release(ECHO.NODES);
  }

  return {
    update(inside, near) {
      if (!near) {
        release();
        return;
      }
      if (!chain) build();
      // Only a change is scheduled: in the open, or deep inside, the frame loop adds nothing to the param.
      if (chain && chain.inside !== inside) {
        chain.inside = inside;
        chain.send.gain.setTargetAtTime(ECHO.SEND * inside, ctx.currentTime, FOLLOW);
      }
    },
    release,
    get held() {
      return chain !== null;
    },
  };
}
