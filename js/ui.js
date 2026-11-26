// Small DOM helpers: screens, the modal, toasts.

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}

/** Escape text for use inside innerHTML. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let current = 'cover';
export function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === `screen-${name}`);
  current = name;
}
export const currentScreen = () => current;

let modalClose = null;
let lastFocus = null;
export function openModal(html, { wide = false, onClose = null } = {}) {
  const back = $('modal-back');
  const body = $('modal-body');
  lastFocus = document.activeElement;
  if (typeof html === 'string') body.innerHTML = html;
  else { body.innerHTML = ''; body.append(html); }
  $('modal').classList.toggle('wide', wide);
  back.hidden = false;
  modalClose = onClose;
  const first = body.querySelector('button, input, textarea, select, [tabindex="0"]') || $('modal-x');
  $('modal').scrollTop = 0;
  setTimeout(() => { first.focus({ preventScroll: true }); $('modal').scrollTop = 0; }, 30);
  return body;
}
export function closeModal({ silent = false } = {}) {
  const back = $('modal-back');
  if (back.hidden) return;
  back.hidden = true;
  const cb = modalClose;
  modalClose = null;
  if (cb && !silent) cb();
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
}
export const modalOpen = () => !$('modal-back').hidden;

let toastT = 0;
export function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

export function starsLine(n, max = 3) {
  return `<span class="stars-line" aria-label="${n} of ${max} stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(max - n)}</span></span>`;
}
