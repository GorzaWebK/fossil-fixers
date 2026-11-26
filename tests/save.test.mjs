// Saves, stars, unlocks and account codes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getData } from './helpers.mjs';
import { emptySave, cleanSave, cleanSettings, cleanName, addFinds, creatureStars, totalStars, regionUnlocked, siteUnlocked, recordDaily, maxStars, SAVE_KEY, SETTINGS_KEY } from '../js/save.js';

const data = await getData();

// A tiny localStorage for Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const account = await import('../js/account.js');

test('nicknames are cleaned', () => {
  assert.equal(cleanName('  Rocky   <b>Raptor</b>!! '), 'Rocky bRaptorb');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(cleanName('Zoë_1'), 'Zoë_1');
});

test('junk saves are tidied up', () => {
  const s = cleanSave({ name: 5, collection: { dunehorn: { bones: { skull: 'p', jaw: 'x', '<bad>': 'p' } }, '../x': {} }, sites: { 'desert-1': { plays: -3, best: 'a', done: 1 } }, upgrades: { floor: 7 } });
  assert.deepEqual(s.collection, { dunehorn: { bones: { skull: 'p' } } });
  assert.deepEqual(s.sites['desert-1'], { plays: 0, best: 0, done: true });
  assert.equal(s.upgrades.floor, 'floor-boards');
  assert.deepEqual(cleanSave(null), emptySave());
  assert.deepEqual(cleanSettings({ music: 9, textSize: 'huge' }).music, 1);
});

test('a pristine find replaces a cracked one, never the other way round', () => {
  const s = emptySave();
  addFinds(s, [{ creatureId: 'dunehorn', boneId: 'skull', cracked: true }]);
  assert.equal(s.collection.dunehorn.bones.skull, 'c');
  addFinds(s, [{ creatureId: 'dunehorn', boneId: 'skull', cracked: false }]);
  assert.equal(s.collection.dunehorn.bones.skull, 'p');
  addFinds(s, [{ creatureId: 'dunehorn', boneId: 'skull', cracked: true }]);
  assert.equal(s.collection.dunehorn.bones.skull, 'p');
});

test('stars: half, all, all pristine', () => {
  const c = data.creatureById.dunehorn;
  const s = emptySave();
  for (const b of c.bones) addFinds(s, [{ creatureId: c.id, boneId: b.id, cracked: b.id === 'skull' }]);
  s.assembled[c.id] = c.bones.slice(0, Math.ceil(c.bones.length / 2)).map((b) => b.id);
  assert.equal(creatureStars(s, c), 1);
  s.assembled[c.id] = c.bones.map((b) => b.id);
  assert.equal(creatureStars(s, c), 2);
  s.collection[c.id].bones.skull = 'p';
  assert.equal(creatureStars(s, c), 3);
});

test('regions unlock in order and every region can be reached', () => {
  const s = emptySave();
  assert.ok(regionUnlocked(s, data, 'desert'));
  assert.ok(!regionUnlocked(s, data, 'sea'));
  // stars available from the regions before each one must be enough to open it
  let avail = 0;
  for (const r of data.regions) {
    assert.ok(avail >= r.stars, `${r.id} needs ${r.stars} stars, only ${avail} possible before it`);
    avail += r.creatures.length * 3;
  }
  assert.equal(avail, maxStars(data));
  // the most expensive upgrade can be earned
  for (const u of data.upgrades) assert.ok(u.stars <= maxStars(data), `${u.id} reachable`);
});

test('sites open one after another; the bonebed after the other three', () => {
  const s = emptySave();
  assert.ok(siteUnlocked(s, data, 'desert-1'));
  assert.ok(!siteUnlocked(s, data, 'desert-2'));
  s.sites['desert-1'] = { plays: 1, best: 10, done: true };
  assert.ok(siteUnlocked(s, data, 'desert-2'));
  assert.ok(!siteUnlocked(s, data, 'desert-4'));
  s.sites['desert-2'] = { plays: 1, best: 10, done: true };
  s.sites['desert-3'] = { plays: 1, best: 10, done: true };
  assert.ok(siteUnlocked(s, data, 'desert-4'));
});

test('daily streaks count days in a row', () => {
  const s = emptySave();
  recordDaily(s, '2026-05-01', 500);
  recordDaily(s, '2026-05-01', 400);
  assert.equal(s.daily.best['2026-05-01'], 500);
  recordDaily(s, '2026-05-02', 300);
  assert.equal(s.daily.streak, 2);
  recordDaily(s, '2026-05-05', 300);
  assert.equal(s.daily.streak, 1);
});

test('account codes round-trip everything, and damaged codes are refused', async () => {
  store.clear();
  const a = account.getAccount();
  assert.match(a.id, /^FF-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  const save = emptySave();
  save.name = 'Rocky';
  addFinds(save, [{ creatureId: 'dunehorn', boneId: 'skull', cracked: false }]);
  save.assembled.dunehorn = ['skull'];
  save.upgrades.floor = 'floor-checker';
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: 0.2, sfx: 0.3, colourblind: true, reducedMotion: true, textSize: 'xl' }));
  const code = await account.exportCode();
  assert.match(code, /^FF1\.[zj][A-Za-z0-9_-]+\.[0-9a-f]{8}$/);

  store.clear();
  const other = account.getAccount();
  assert.notEqual(other.id, a.id);
  const obj = await account.parseCode('  ' + code.slice(0, 20) + '\n' + code.slice(20) + ' ');
  account.importAccount(obj);
  assert.equal(account.getAccount().id, a.id);
  assert.deepEqual(JSON.parse(localStorage.getItem(SAVE_KEY)), save);
  assert.equal(JSON.parse(localStorage.getItem(SETTINGS_KEY)).textSize, 'xl');

  const broken = code.slice(0, -3) + (code.endsWith('aaa') ? 'bbb' : 'aaa');
  await assert.rejects(account.parseCode(broken), /damaged|incomplete/);
  await assert.rejects(account.parseCode('FA1.zabc.12345678'), /isn't a Fossil Fixers/);
  await assert.rejects(account.parseCode(''), /Paste/);
});

test('total stars start at zero', () => {
  assert.equal(totalStars(emptySave(), data), 0);
});
