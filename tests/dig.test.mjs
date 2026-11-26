// The dig rules: working only next to open space, tools, cracking, clues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getData } from './helpers.mjs';
import { buildSite } from '../js/sites.js';
import { useTool, isWorkable, showsBump, cloneSite, scoreDig, around } from '../js/dig.js';

const data = await getData();
const T = data.toolById;
const fresh = () => cloneSite(buildSite(data, 'desert-2'));

test('you can only dig the top row or next to open space', () => {
  const s = fresh();
  const deep = 5 * s.cols + 5;
  assert.equal(isWorkable(s, deep), false);
  const ev = useTool(s, T.brush, data.rocks, deep);
  assert.equal(ev.ok, false);
  assert.match(ev.reason, /Dig down/);
  assert.equal(isWorkable(s, 3), true);
});

test('bedrock cannot be dug or tapped', () => {
  const s = fresh();
  const bed = s.cells.findIndex((c) => !Number.isFinite(c.hp));
  assert.ok(bed >= 0);
  assert.equal(isWorkable(s, bed), false);
  for (const t of [T.brush, T.pickaxe, T.tap]) assert.equal(useTool(s, t, data.rocks, bed).ok, false);
});

test('energy is spent and refused when it runs out', () => {
  const s = fresh();
  const e0 = s.energy;
  assert.ok(useTool(s, T.brush, data.rocks, 0).ok);
  assert.equal(s.energy, e0 - T.brush.cost);
  s.energy = 1;
  const ev = useTool(s, T.chisel, data.rocks, 1);
  assert.equal(ev.ok, false);
  assert.match(ev.reason, /energy/);
});

function siteWithBoneNearTop() {
  // find a replay where a bone cell sits in row 2, so it can be reached quickly
  for (let r = 0; r < 50; r++) {
    const s = cloneSite(buildSite(data, 'desert-2', { replay: r }));
    const i = s.cells.findIndex((c, k) => c.bone >= 0 && Math.floor(k / s.cols) === 2);
    if (i >= 0) return { s, i };
  }
  throw new Error('no site found');
}

function openAbove(s, i) {
  // clear the two cells above i with the brush (safe)
  for (const k of [i - 2 * s.cols, i - s.cols]) {
    let g = 20;
    while (s.cells[k].hp > 0 && g--) assert.ok(useTool(s, T.brush, data.rocks, k).ok || s.cells[k].bone >= 0);
  }
}

test('the pickaxe cracks bones in the 3x3 around the hit', () => {
  const { s, i } = siteWithBoneNearTop();
  openAbove(s, i);
  const bi = s.cells[i].bone;
  const above = i - s.cols;
  s.cells[above].hp = 0;
  const ev = useTool(s, T.pickaxe, data.rocks, i);
  assert.ok(ev.ok);
  assert.ok(s.bones[bi].cracked, 'bone cracked');
});

test('the brush never cracks, the chisel cracks only when it overshoots', () => {
  const { s, i } = siteWithBoneNearTop();
  openAbove(s, i);
  s.cells[i - s.cols].hp = 0;
  const bi = s.cells[i].bone;
  s.cells[i].hp = 4;
  assert.ok(useTool(s, T.chisel, data.rocks, i).ok); // 4 -> 1, no overshoot
  assert.equal(s.bones[bi].cracked, false);
  const s2 = cloneSite(s);
  assert.ok(useTool(s2, T.brush, data.rocks, i).ok); // 1 -> 0, safe
  assert.equal(s2.bones[bi].cracked, false);
  assert.ok(useTool(s, T.chisel, data.rocks, i).ok); // 1 left, 3 damage: overshoot
  assert.equal(s.bones[bi].cracked, true);
});

test('tap gives hollow / echo / solid', () => {
  const { s, i } = siteWithBoneNearTop();
  openAbove(s, i);
  s.cells[i - s.cols].hp = 0;
  assert.equal(useTool(s, T.tap, data.rocks, i).tap, 'hollow');
  // a workable non-bone cell with no bone neighbours is solid
  const solid = s.cells.findIndex((c, k) => k < s.cols && c.bone < 0 && around(s, k, 1).every((n) => s.cells[n].bone < 0));
  assert.equal(useTool(s, T.tap, data.rocks, solid).tap, 'solid');
});

test('the scanner marks bones within 2 squares and runs out', () => {
  const { s, i } = siteWithBoneNearTop();
  const n = s.charges.scanner;
  const ev = useTool(s, T.scanner, data.rocks, i);
  assert.ok(ev.ok);
  assert.ok(ev.scanned.includes(i));
  assert.ok(s.cells[i].scanned);
  s.charges.scanner = 0;
  assert.equal(useTool(s, T.scanner, data.rocks, i).ok, false);
  assert.equal(n > 0, true);
});

test('bumps show only once you dig close', () => {
  const s = fresh();
  const deepBone = s.cells.findIndex((c, k) => c.bone >= 0 && Math.floor(k / s.cols) >= 6);
  if (deepBone >= 0) assert.equal(showsBump(s, deepBone), false);
});

test('gadgets only work on their rock types', () => {
  const s = cloneSite(buildSite(data, 'tundra-1'));
  // top row is snow (ice-tagged) -> the heat lamp works there
  assert.ok(useTool(s, T.lamp, data.rocks, 2).ok);
  const d = cloneSite(buildSite(data, 'desert-2'));
  const ev = useTool(d, T.lamp, data.rocks, 2);
  assert.equal(ev.ok, false);
});

test('scoring rewards a perfect dig', () => {
  const s = fresh();
  for (const b of s.bones) b.found = true;
  const sc = scoreDig(s);
  assert.ok(sc.perfect && sc.all);
  assert.equal(sc.bonesPts, s.bones.length * 100);
  s.bones[0].cracked = true;
  assert.equal(scoreDig(s).perfect, false);
});
