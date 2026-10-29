// The message card at the end of the ride: it rises over the evening station once the fireworks have begun. A
// small heart, the eyebrow ("One year of us"), the wish ("Happy 1 year, Maya") large in the display font, his
// message with its line breaks kept, his signoff, and "Ride again", which takes her back to the start. The message
// and the signoff write themselves in ink, in handwriting, as the card settles (ui/handwriting.js); a tap on the card
// finishes it at once. The body scrolls inside the card, so a long message never pushes the button off the screen.
// When content.js has his voice note, a small round button beside "Ride again" plays it and pauses it, with a ring
// round it that fills as it plays (audio/voiceNote.js; the app plays it by itself as the card settles, if her sound
// is on). A voice note that cannot be played has no button. The 2D story's last card has the same button.

import { el, prefersReducedMotion, reveal, setChildren, svgEl } from './dom.js';
import { finishOnTap, writeLetter } from './handwriting.js';

/** The pen touches down this long (s) after the card starts to rise, which takes 1.1 s but is mostly there by then. */
const WRITE_FROM = 1;

/** The voice button's ring: its radius in the button's 48-unit square, and its length round. */
const RING_R = 22.5;
const RING_LENGTH = 2 * Math.PI * RING_R;

/** The voice button's ▶ (nudged right of the middle, where a triangle looks centred) and its ❚❚. */
const PLAY_ICON = 'M20 16.6v14.8c0 .9 1 1.4 1.7.9l10.9-7.4a1.1 1.1 0 0 0 0-1.8l-10.9-7.4c-.7-.5-1.7 0-1.7.9z';
const PAUSE_ICON = 'M18.2 16.5c0-.6.5-1 1-1h2.6c.6 0 1 .4 1 1v15c0 .6-.4 1-1 1h-2.6c-.5 0-1-.4-1-1zM25.2 16.5c0-.6.4-1 1-1h2.6c.5 0 1 .4 1 1v15c0 .6-.5 1-1 1h-2.6c-.6 0-1-.4-1-1z';

/** The voice button on the card now, which hiding the card (or the next card) lets go of its voice note. */
let endVoice = null;

/**
 * A round button that plays his voice note and pauses it, with a ring round it that fills as it plays. It reads
 * "Play my voice note" with a ▶, or "Pause my voice note" with a ❚❚ and pressed while it plays; it goes if the file
 * cannot be played. The ring follows the note every frame while it plays. (The 2D story, fallback.js, uses it too.)
 * @param {import('../audio/voiceNote.js').VoiceNote} voice
 * @returns {{ button: HTMLButtonElement, detach: () => void }}  `detach` stops it following the voice note
 */
export function voiceNoteButton(voice) {
  const ring = svgEl('circle', {
    class: 'voice-note-ring', cx: 24, cy: 24, r: RING_R, transform: 'rotate(-90 24 24)',
    'stroke-dasharray': RING_LENGTH.toFixed(2),
  });
  const icon = svgEl('path', { class: 'voice-note-icon' });
  const button = el('button', { type: 'button', class: 'voice-note' }, [
    svgEl('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true', focusable: 'false' }, [
      svgEl('circle', { class: 'voice-note-track', cx: 24, cy: 24, r: RING_R }),
      ring,
      icon,
    ]),
  ]);
  button.addEventListener('click', () => {
    if (voice.state === 'playing') voice.pause();
    else voice.play();
  });
  let frame = 0;
  const drawRing = () => ring.setAttribute('stroke-dashoffset', (RING_LENGTH * (1 - voice.progress)).toFixed(2));
  const follow = () => {
    drawRing();
    frame = voice.state === 'playing' ? requestAnimationFrame(follow) : 0;
  };
  const show = () => {
    const playing = voice.state === 'playing';
    button.hidden = voice.state === 'failed';
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Pause my voice note' : 'Play my voice note');
    icon.setAttribute('d', playing ? PAUSE_ICON : PLAY_ICON);
    drawRing();
    if (playing && !frame) frame = requestAnimationFrame(follow);
  };
  const stopListening = voice.onChange(show);
  show();
  return {
    button,
    detach() {
      stopListening();
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/** Lets go of the voice note the card's button was following, if any. */
function releaseVoice() {
  if (!endVoice) return;
  const end = endVoice;
  endVoice = null;
  end();
}

/** A small heart over the eyebrow (the same one as the 2D story's). */
function heart() {
  return svgEl('svg', { class: 'finale-heart', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
    svgEl('path', { d: 'M12 21s-7.4-4.5-9.5-9.1C1 8.6 3 5 6.5 5c2.1 0 3.6 1.2 4.6 2.6.4.5.6.5.9 0C13 6.2 14.4 5 16.5 5 20 5 22 8.6 20.5 11.9 18.4 16.5 12 21 12 21z' }),
  ]);
}

/**
 * Shows the card, replacing whatever it showed before. "Ride again" disables itself on its first tap, so a double
 * tap starts one ride.
 * @param {import('../content/normalize.js').Content} content
 * @param {{ onRideAgain: () => void, voice?: import('../audio/voiceNote.js').VoiceNote|null }} handlers  `voice` is
 *   his voice note, for its button (none without one, or once it has failed)
 */
export function showFinaleCard(content, { onRideAgain, voice = null }) {
  releaseVoice();
  const { eyebrow, wish, message, signoff } = content.finale;
  const card = document.getElementById('finale-card');
  const again = el('button', { type: 'button', class: 'btn-primary finale-again' }, ['Ride again']);
  again.addEventListener('click', () => {
    if (again.disabled) return;
    again.disabled = true;
    onRideAgain();
  });
  const messageEl = message ? el('p', { class: 'finale-message' }) : null;
  const signoffEl = signoff ? el('p', { class: 'finale-signoff' }) : null;
  const body = el('div', { class: 'finale-card-body' }, [
    heart(),
    eyebrow ? el('p', { class: 'eyebrow' }, [eyebrow]) : null,
    el('h2', { class: 'finale-wish', id: 'finale-wish' }, [wish]),
    messageEl,
    signoffEl,
  ]);
  const voiceButton = voice && voice.state !== 'failed' ? voiceNoteButton(voice) : null;
  if (voiceButton) endVoice = voiceButton.detach;
  setChildren(card, [body, el('div', { class: 'finale-card-footer' }, [voiceButton && voiceButton.button, again])]);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'finale-wish');

  // The message first, then the signoff a beat after it; with reduced motion, each fades in instead.
  const writing = writeLetter(
    messageEl && { el: messageEl, text: message },
    signoffEl && { el: signoffEl, text: signoff },
    { startAt: WRITE_FROM, reduced: prefersReducedMotion() },
  );
  // A tap on the card finishes the writing at once (see finishOnTap: not a tap on a button or link inside it, and not
  // once it is over).
  finishOnTap(body, () => writing);
  reveal(card);
}

/** Hides the card at once (the app does it under a fade). */
export function hideFinaleCard() {
  releaseVoice();
  document.getElementById('finale-card').hidden = true;
}
