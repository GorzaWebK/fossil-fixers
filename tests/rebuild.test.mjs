// Every skeleton can be assembled: each bone snaps into its own outline when
// it's in the right place and turned the right way, and not otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getData } from './helpers.mjs';
import { startRebuild, dropPiece, isComplete, findSnap, nearButTurned, layoutTray, ROT_STEP, SNAP_ANGLE } from '../js/rebuild.js';

const data = await getData();
const all = (c) => Object.fromEntries(c.bones.map((b) => [b.id, 'p']));

test('every creature can be fully assembled', () => {
  for (const c of data.creatures) {
    const st = startRebuild(c, all(c), []);
    assert.equal(st.pieces.length, c.bones.length, `${c.id}: one piece per bone`);
    layoutTray(st, 210, 0, 300, 120);
    for (const p of st.pieces) {
      // pieces start turned the wrong way, so you have to turn them
      const b = c.bones.find((x) => x.id === p.boneId);
      assert.ok(Math.abs(((p.rot - b.rot) % 360 + 360) % 360) >= ROT_STEP - 0.01, `${c.id}/${b.id} starts turned`);
      // turning in 45 degree steps reaches the right angle
      let k = 0;
      while (Math.abs(((p.rot - b.rot) % 360 + 360) % 360) > SNAP_ANGLE && k < 8) { p.rot = (p.rot + ROT_STEP) % 360; k++; }
      assert.ok(k < 8, `${c.id}/${b.id} can be turned into place`);
      p.x = b.x + 3; p.y = b.y - 2;
      assert.ok(dropPiece(st, p), `${c.id}/${b.id} snaps`);
    }
    assert.ok(isComplete(st), `${c.id} complete`);
  }
});

test('a bone does not snap far away, or turned the wrong way', () => {
  const c = data.creatureById.dunehorn;
  const st = startRebuild(c, all(c), []);
  const p = st.pieces[0];
  const b = c.bones.find((x) => x.id === p.boneId);
  p.x = b.x + 60; p.y = b.y; p.rot = b.rot;
  assert.equal(findSnap(c, p, st.filled), null);
  p.x = b.x; p.y = b.y; p.rot = b.rot + 90;
  assert.equal(findSnap(c, p, st.filled), null);
  assert.ok(nearButTurned(c, p, st.filled));
});

test('only found bones become pieces, and placed ones are not offered again', () => {
  const c = data.creatureById.rattlerunner;
  const have = { skull: 'p', jaw: 'c', femur: 'p' };
  const st = startRebuild(c, have, ['skull']);
  assert.deepEqual(st.pieces.map((p) => p.boneId).sort(), ['femur', 'jaw']);
});
