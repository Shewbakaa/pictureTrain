// The toast: a short, kind note near the top of the screen with an optional button, for the rare moment something
// goes wrong mid-ride ("The ride hiccuped." + Restart when the phone takes the GPU away). It stays until the page
// reloads.

import { el, reveal, setChildren } from './dom.js';

/**
 * Shows `text` in #toast, replacing whatever it said before.
 * @param {string} text
 * @param {{ action?: { label: string, onClick: () => void } }} [options]  a button beside the words
 */
export function showToast(text, { action } = {}) {
  const toast = document.getElementById('toast');
  toast.setAttribute('role', 'status');
  setChildren(toast, [
    el('span', { class: 'toast-text' }, [text]),
    action ? el('button', { type: 'button', class: 'btn-primary toast-action', onClick: action.onClick }, [action.label]) : null,
  ]);
  reveal(toast);
}
