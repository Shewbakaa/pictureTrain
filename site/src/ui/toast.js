// The toast: a short, kind note near the top of the screen with an optional button. For the rare moment something
// goes wrong mid-ride ("The ride hiccuped." + Restart when the phone takes the GPU away) it stays until the page
// reloads. A passing note (the tips after her first card, or why tilt could not turn on) leaves by itself, and never
// covers a toast that is waiting for her answer.

import { dismiss, el, reveal, setChildren } from './dom.js';

/** How a passing note leaves: it fades as it rises back the way it came in. */
const LEAVE = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px)' }];

/** Takes the passing note shown now away again; null while none is showing. */
let leaveTimer = null;

/**
 * Shows `text` in #toast, replacing whatever it said before.
 * @param {string} text
 * @param {{ action?: { label: string, onClick: () => void }, hideAfter?: number }} [options]
 *   `action`: a button beside the words. `hideAfter`: a passing note, which leaves after this long (ms).
 */
export function showToast(text, { action, hideAfter } = {}) {
  const toast = document.getElementById('toast'); // role="status" in index.html, so it is read out as it appears
  if (hideAfter && !toast.hidden && toast.querySelector('.toast-action')) return; // Restart outranks a tip
  clearTimeout(leaveTimer);
  leaveTimer = null;
  setChildren(toast, [
    el('span', { class: 'toast-text' }, [text]),
    action ? el('button', { type: 'button', class: 'btn-primary toast-action', onClick: action.onClick }, [action.label]) : null,
  ]);
  reveal(toast);
  if (hideAfter > 0) {
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      dismiss(toast, LEAVE);
    }, hideAfter);
  }
}
