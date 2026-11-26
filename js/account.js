// Player account: a random player ID, plus export / import of everything this
// browser has saved, as one "account code" (or a backup file). There's no
// server: the code itself carries the data, so pasting it into any browser
// restores the museum there.
//
// This is the same system as Foundry Arena's account codes, so it works the
// same way across Gorza games:
//   Code format:  FF1.<payload>.<8 hex checksum>
//   payload = "z" + base64url(deflate-raw(JSON)) when the browser can compress,
//             "j" + base64url(JSON) when it can't.
//   checksum = FNV-1a of the payload, so a half-copied code is caught.
//   Player ID: FF-XXXX-XXXX from 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (no 0/O/1/I to misread).

import { SAVE_KEY, SETTINGS_KEY } from './save.js';

const ID_KEY = 'fossil-fixers-account';
// every key that belongs to an account (add new saved data here)
const DATA_KEYS = [SAVE_KEY, SETTINGS_KEY];

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_RE = /^FF-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
export const isPlayerId = (s) => typeof s === 'string' && ID_RE.test(s);

function randomId() {
  const b = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32];
  return `FF-${s.slice(0, 4)}-${s.slice(4)}`;
}

function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

/** This browser's account: { id, created }. Made on first visit. */
export function getAccount() {
  try {
    const a = JSON.parse(readStore(ID_KEY) || 'null');
    if (a && ID_RE.test(a.id)) return a;
  } catch { /* corrupt: make a new one */ }
  const a = { id: randomId(), created: new Date().toISOString().slice(0, 10) };
  writeStore(ID_KEY, JSON.stringify(a));
  return a;
}

// ---------------------------------------------------------------- encoding

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** The account code for everything saved in this browser. */
export async function exportCode() {
  const acct = getAccount();
  const data = {};
  for (const k of DATA_KEYS) {
    const v = readStore(k);
    if (v !== null) data[k] = v;
  }
  const json = JSON.stringify({ v: 1, id: acct.id, created: acct.created, saved: new Date().toISOString(), data });
  const raw = new TextEncoder().encode(json);
  const body = canZip() ? 'z' + toB64url(await pipe(raw, new CompressionStream('deflate-raw'))) : 'j' + toB64url(raw);
  return `FF1.${body}.${fnv(body)}`;
}

/** Read an account code. Throws an Error with a message for the player if it's no good. */
export async function parseCode(text) {
  const code = String(text || '').replace(/\s+/g, '');
  if (!code) throw new Error('Paste your account code first.');
  const m = /^FF1\.([zj][A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(code);
  if (!m) throw new Error("That isn't a Fossil Fixers account code. It starts with FF1. Copy all of it.");
  if (fnv(m[1]) !== m[2]) throw new Error('That code is damaged or incomplete. Copy the whole code again.');
  let bytes = fromB64url(m[1].slice(1));
  if (m[1][0] === 'z') {
    if (!canZip()) throw new Error('This browser is too old to read that code. Update it and try again.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  let obj;
  try { obj = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('That code is damaged. Copy the whole code again.'); }
  if (!obj || obj.v !== 1 || !ID_RE.test(obj.id) || typeof obj.data !== 'object') throw new Error('That account code is from an unknown version.');
  return obj;
}

/**
 * Replace this browser's account with the one in `obj` (from parseCode).
 * The page should reload afterwards so everything picks it up.
 */
export function importAccount(obj) {
  for (const k of DATA_KEYS) {
    const v = obj.data[k];
    writeStore(k, typeof v === 'string' && v.length < 200000 ? v : null);
  }
  const created = typeof obj.created === 'string' ? obj.created.slice(0, 10) : new Date().toISOString().slice(0, 10);
  writeStore(ID_KEY, JSON.stringify({ id: obj.id, created }));
}

/** Start completely fresh in this browser (a new player ID, nothing saved). */
export function resetAccount() {
  for (const k of [...DATA_KEYS, ID_KEY]) writeStore(k, null);
}
