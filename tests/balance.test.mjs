// Reading the clues should be enough: a bot that only uses what a player can
// see (bumps, taps, scanner marks) finds nearly every bone and cracks none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getData } from './helpers.mjs';
import { buildSite, toolsForRegion } from '../js/sites.js';
import { cloneSite } from '../js/dig.js';
import { playLikeAPlayer } from '../tools/cluebot.mjs';

const data = await getData();

test('a careful clue-reader finds most bones and cracks none', () => {
  let found = 0, total = 0, cracked = 0;
  for (const id of Object.keys(data.siteById)) {
    for (let rep = 0; rep < 3; rep++) {
      const s = buildSite(data, id, { replay: rep });
      const r = playLikeAPlayer(cloneSite(s), toolsForRegion(data, data.siteById[id].region), data.rocks);
      found += r.found; total += r.total; cracked += r.cracked;
    }
  }
  assert.equal(cracked, 0, 'careful play never cracks a bone');
  assert.ok(found / total >= 0.9, `clue reader found ${Math.round((found / total) * 100)}% of bones`);
});

test('the first dig is easy enough to finish', () => {
  for (let rep = 0; rep < 6; rep++) {
    const s = buildSite(data, 'desert-1', { replay: rep });
    const r = playLikeAPlayer(cloneSite(s), toolsForRegion(data, 'desert'), data.rocks);
    assert.equal(r.found, r.total, `desert-1 replay ${rep}`);
  }
});
