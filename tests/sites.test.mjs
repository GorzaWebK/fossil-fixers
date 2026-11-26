// Every dig can be completed: each site (and its replays) and a year of Daily
// Digs is dug by the perfect solver, through the real dig rules, within the
// site's own energy, with every bone found and none cracked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getData } from './helpers.mjs';
import { buildSite, buildDaily, baseTools, perfectScore } from '../js/sites.js';
import { solve } from '../js/solver.js';
import { cloneSite, useTool, allFound } from '../js/dig.js';

const data = await getData();

function replayMoves(site, moves) {
  const s = cloneSite(site);
  for (const m of moves) {
    const ev = useTool(s, data.toolById[m.tool], data.rocks, m.i);
    assert.ok(ev.ok, `move failed: ${m.tool} at ${m.i}: ${ev.reason}`);
  }
  return s;
}

function checkSite(site, label) {
  const res = solve(site, baseTools(data), data.rocks);
  assert.ok(res.ok, `${label}: solver could not finish (${res.reason || 'cracks'})`);
  assert.ok(res.cost <= site.maxEnergy, `${label}: needs ${res.cost} energy but has ${site.maxEnergy}`);
  // Play the same moves on the real site, with its real energy.
  const done = replayMoves(site, res.moves);
  assert.ok(allFound(done), `${label}: not every bone found`);
  assert.equal(done.bones.filter((b) => b.cracked).length, 0, `${label}: bones cracked`);
  assert.ok(done.energy >= 0);
}

test('every map dig site can be completed, including replays', () => {
  for (const id of Object.keys(data.siteById)) {
    for (let replay = 0; replay < 6; replay++) {
      const site = buildSite(data, id, { replay });
      assert.ok(site.bones.length >= 9, `${id}: has bones`);
      checkSite(site, `${id} replay ${replay}`);
    }
  }
});

test('bonebeds favour the bones you are missing', () => {
  const def = data.siteById['desert-4'];
  const region = data.regionById.desert;
  // Pretend we have every Dunehorn bone pristine except the skull (cracked) and tail tip (missing).
  const collection = { dunehorn: { bones: {} } };
  for (const b of data.creatureById.dunehorn.bones) collection.dunehorn.bones[b.id] = 'p';
  collection.dunehorn.bones.skull = 'c';
  delete collection.dunehorn.bones.tail2;
  const site = buildSite(data, 'desert-4', { collection });
  const dune = site.bones.filter((b) => b.creatureId === 'dunehorn').map((b) => b.boneId);
  assert.ok(dune.includes('skull') && dune.includes('tail2'), 'missing and cracked bones are included');
  assert.equal(site.bones.length, region.creatures.length * def.bonesPerCreature);
  checkSite(site, 'bonebed with collection');
});

test('a year of Daily Digs can be completed and is the same for everyone', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const regions = new Set();
  for (let d = 0; d < 365; d++) {
    const day = new Date(start + d * 86400000).toISOString().slice(0, 10);
    const a = buildDaily(data, day);
    regions.add(a.regionId);
    checkSite(a, `daily ${day}`);
    assert.ok(a.par > 0 && a.par < perfectScore(a), 'par is below a perfect score');
    if (d % 30 === 0) {
      const b = buildDaily(data, day);
      assert.equal(JSON.stringify(a.cells), JSON.stringify(b.cells), 'same layout for the same day');
      assert.equal(a.par, b.par);
    }
  }
  assert.equal(regions.size, data.regions.length, 'every region turns up in the Daily Dig');
});

test('different days give different sites', () => {
  const a = buildDaily(data, '2026-03-01');
  const b = buildDaily(data, '2026-03-02');
  assert.notEqual(JSON.stringify(a.cells), JSON.stringify(b.cells));
});
