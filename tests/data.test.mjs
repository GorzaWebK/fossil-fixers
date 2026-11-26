// The JSON data hangs together (useful when you add a creature or a site).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getData } from './helpers.mjs';
import { BONE_TYPES } from '../js/bones.js';

const data = await getData();

test('creatures are well formed', () => {
  const ids = new Set();
  for (const c of data.creatures) {
    assert.ok(/^[a-z0-9-]+$/.test(c.id), `${c.id}: id is lowercase letters/numbers`);
    assert.ok(!ids.has(c.id), `${c.id}: unique`);
    ids.add(c.id);
    assert.ok(data.regionById[c.region], `${c.id}: region exists`);
    assert.ok(c.bones.length >= 6 && c.bones.length <= 16, `${c.id}: 6-16 bones`);
    const bids = new Set();
    for (const b of c.bones) {
      assert.ok(!bids.has(b.id), `${c.id}/${b.id}: unique bone id`);
      bids.add(b.id);
      assert.ok(BONE_TYPES.includes(b.type), `${c.id}/${b.id}: type ${b.type} exists`);
      for (const k of ['x', 'y', 'len', 'w', 'rot']) assert.equal(typeof b[k], 'number', `${c.id}/${b.id}.${k}`);
      assert.ok(b.x >= 0 && b.x <= 200 && b.y >= 0 && b.y <= 120, `${c.id}/${b.id}: inside the 200x120 frame`);
      assert.ok(b.len > 0 && b.w > 0);
      assert.ok(b.name);
    }
    for (const k of ['period', 'place', 'size', 'diet', 'fact']) assert.ok(c.card?.[k], `${c.id}: card.${k}`);
    assert.ok(c.inspired, `${c.id}: says which real animal inspired it`);
  }
});

test('regions and sites point at things that exist', () => {
  assert.equal(data.regions.length, 5);
  for (const r of data.regions) {
    assert.ok(data.rocks[r.bedrock], `${r.id}: bedrock rock exists`);
    assert.equal(data.rocks[r.bedrock].hp, null, `${r.id}: bedrock is unbreakable`);
    for (const l of r.layers) assert.ok(data.rocks[l.rock]?.hp > 0, `${r.id}: layer rock ${l.rock}`);
    for (const inc of r.inclusions || []) assert.ok(data.rocks[inc.rock], `${r.id}: inclusion ${inc.rock}`);
    assert.ok(data.toolById[r.gadget], `${r.id}: gadget exists`);
    assert.equal(data.toolById[r.gadget].region, r.id, `${r.id}: its gadget belongs to it`);
    assert.ok(r.creatures.length >= 2 && r.creatures.length <= 3, `${r.id}: 2-3 creatures`);
    for (const c of r.creatures) assert.equal(data.creatureById[c]?.region, r.id, `${r.id}: creature ${c}`);
    assert.equal(r.sites.length, 4, `${r.id}: 4 digs`);
    for (const s of r.sites) {
      assert.ok(s.creature === 'bonebed' || r.creatures.includes(s.creature), `${s.id}: creature in region`);
      assert.ok(s.cols >= 10 && s.cols <= 18 && s.rows >= 9 && s.rows <= 14, `${s.id}: grid size`);
      assert.ok(s.slack >= 1.2 && s.slack <= 2.2, `${s.id}: slack`);
      assert.ok(s.note && s.name);
    }
    // every creature in the region has its own site
    for (const c of r.creatures) assert.ok(r.sites.some((s) => s.creature === c), `${r.id}: ${c} has a site`);
  }
  // the 5th region (volcano) may say "Bedrock" in names: rock names are just labels
});

test('tools have a key each and sensible numbers', () => {
  const keys = new Set();
  const letters = new Set();
  for (const t of data.tools) {
    assert.ok(!keys.has(t.key), `${t.id}: key ${t.key} unique`);
    assert.ok(!letters.has(t.letter), `${t.id}: letter ${t.letter} unique`);
    keys.add(t.key); letters.add(t.letter);
    assert.ok(['dig', 'tap', 'scan', 'probe'].includes(t.kind));
    assert.ok(data.regionById[t.region], `${t.id}: region`);
    if (t.kind === 'dig') assert.ok(t.cost > 0 && t.damage > 0);
  }
  for (const id of ['brush', 'chisel', 'pickaxe', 'tap', 'scanner']) assert.equal(data.toolById[id].region, 'desert');
});

test('upgrades cover all four kinds with a free starter each', () => {
  for (const k of ['lighting', 'plaque', 'banner', 'floor']) {
    const list = data.upgrades.filter((u) => u.kind === k);
    assert.ok(list.length >= 3);
    assert.ok(list.some((u) => u.stars === 0), `${k}: free starter`);
  }
});
