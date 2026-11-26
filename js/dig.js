// The dig: a side-on grid of rock with fossil bones hidden inside.
// Pure logic, no drawing, so Node tests can run it.
//
// A cell can only be worked if it's in the top row or touches an open cell
// (you dig down from the surface). Bedrock (hp null) can't be broken.

import { makeRng } from './rng.js';

export const PRISTINE = 100;
export const CRACKED = 60;

/** How many grid cells a bone takes up, from its length in the skeleton frame. */
export function footprintSize(bone) {
  if (bone.len <= 18) return 1;
  if (bone.len <= 32) return 2;
  return 3;
}

function isFlat(bone) {
  const r = (((bone.rot % 180) + 180) % 180);
  return r < 45 || r > 135;
}

const SHAPES = {
  1: { flat: [[[0, 0]]], tall: [[[0, 0]]] },
  2: { flat: [[[0, 0], [1, 0]]], tall: [[[0, 0], [0, 1]]] },
  3: {
    flat: [[[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 1], [1, 0]], [[0, 0], [1, 0], [0, 1]]],
    tall: [[[0, 0], [0, 1], [0, 2]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [0, 1]], [[0, 0], [1, 0], [0, 1]]],
  },
};

/**
 * Build a dig site.
 * opts: {
 *   seed, cols, rows,
 *   region: { layers: [{ rock, weight }], bedrock, inclusions: [{ rock, in, chance }], boulders },
 *   rocks: { id: { hp, tags } },
 *   bones: [{ creatureId, bone }],   // the bones hidden in this site
 *   concretions: number of fake bumps,
 *   scannerCharges, probeCharges,
 * }
 * Energy is added afterwards by setEnergy() (from the solver).
 */
export function generateSite(opts) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const site = tryGenerate(opts, attempt);
    if (site) return site;
  }
  throw new Error('Could not generate a dig site for seed ' + opts.seed);
}

function tryGenerate(opts, attempt) {
  const { cols, rows, region, rocks } = opts;
  const rng = makeRng(`${opts.seed}#${attempt}`);
  const N = cols * rows;
  const bedRows = rows >= 11 ? 2 : 1;
  const usable = rows - bedRows;

  // Layer boundaries, each a gentle random walk across the columns.
  const totalW = region.layers.reduce((s, l) => s + (l.weight ?? 1), 0);
  const bounds = [];
  let acc = 0;
  for (let i = 0; i < region.layers.length - 1; i++) {
    acc += region.layers[i].weight ?? 1;
    const base = (acc / totalW) * usable;
    const line = [];
    let off = (rng() - 0.5) * 1.2;
    for (let c = 0; c < cols; c++) {
      off += (rng() - 0.5) * 0.9;
      off = Math.max(-1.2, Math.min(1.2, off));
      line.push(base + off);
    }
    bounds.push(line);
  }
  const bedLine = [];
  {
    let off = 0;
    for (let c = 0; c < cols; c++) {
      off += (rng() - 0.5) * 0.8;
      off = Math.max(-0.6, Math.min(0.4, off));
      bedLine.push(usable + off);
    }
  }

  const cells = new Array(N);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let li = 0;
      while (li < bounds.length && r + 0.5 > bounds[li][c]) li++;
      let rock = region.layers[li].rock;
      if (r + 0.5 > bedLine[c] && r >= 2) rock = region.bedrock;
      const def = rocks[rock];
      cells[r * cols + c] = { rock, hp: def.hp ?? Infinity, maxHp: def.hp ?? Infinity, bone: -1, part: 0, concretion: false, tap: null, scanned: false, probed: false, hits: 0 };
    }
  }

  // Hard lumps inside layers (flint in chalk, roots in mud...).
  for (const inc of region.inclusions || []) {
    for (let i = cols; i < N; i++) {
      const cell = cells[i];
      if ((!inc.in || cell.rock === inc.in) && rng.chance(inc.chance)) {
        const def = rocks[inc.rock];
        Object.assign(cell, { rock: inc.rock, hp: def.hp ?? Infinity, maxHp: def.hp ?? Infinity });
      }
    }
  }

  // A few bedrock boulders below the top rows.
  const boulders = region.boulders ?? 1;
  for (let b = 0; b < boulders; b++) {
    const c = rng.int(1, cols - 3);
    const r = rng.int(3, Math.max(3, usable - 3));
    for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      if (dr === 1 && rng.chance(0.5)) continue;
      const cell = cells[(r + dr) * cols + c + dc];
      Object.assign(cell, { rock: region.bedrock, hp: Infinity, maxHp: Infinity });
    }
  }

  // Hide the bones.
  const fossilTop = 2;
  const fossilBottom = usable - 1; // inclusive row
  const bones = [];
  const order = opts.bones.map((b, i) => ({ ...b, i, size: footprintSize(b.bone) }));
  order.sort((a, b) => b.size - a.size); // big ones first: easier to fit
  for (const item of order) {
    const shapes = SHAPES[item.size][isFlat(item.bone) ? 'flat' : 'tall'];
    let placed = null;
    for (let t = 0; t < 200 && !placed; t++) {
      const shape = rng.pick(shapes);
      const w = Math.max(...shape.map((p) => p[0])) + 1;
      const h = Math.max(...shape.map((p) => p[1])) + 1;
      const c0 = rng.int(0, cols - w);
      const r0 = rng.int(fossilTop, fossilBottom - h + 1);
      const idx = shape.map(([dc, dr]) => (r0 + dr) * cols + c0 + dc);
      if (idx.every((i) => cells[i].bone === -1 && Number.isFinite(cells[i].hp))) placed = idx;
    }
    if (!placed) return null;
    const bi = bones.length;
    placed.forEach((i, part) => { cells[i].bone = bi; cells[i].part = part; });
    bones.push({ creatureId: item.creatureId, boneId: item.bone.id, bone: item.bone, cells: placed, found: false, cracked: false });
  }

  // Fake bumps: concretions look a bit like bones until you tap them.
  const nConc = opts.concretions ?? 3;
  for (let k = 0, tries = 0; k < nConc && tries < 400; tries++) {
    const i = rng.int(fossilTop * cols, (fossilBottom + 1) * cols - 1);
    const cell = cells[i];
    if (cell.bone !== -1 || !Number.isFinite(cell.hp) || cell.concretion) continue;
    cell.concretion = true;
    cell.hp = cell.maxHp = Math.max(3, cell.hp);
    k++;
  }

  const site = {
    seed: opts.seed, cols, rows, cells, bones,
    energy: 0, maxEnergy: 0,
    charges: { scanner: opts.scannerCharges ?? 2, probe: opts.probeCharges ?? 0 },
    log: { taps: 0, scans: 0, actions: 0 },
  };
  // Every bone must be reachable from the surface without crossing bedrock.
  if (!allReachable(site)) return null;
  return site;
}

export const idx = (site, c, r) => r * site.cols + c;
export const colOf = (site, i) => i % site.cols;
export const rowOf = (site, i) => Math.floor(i / site.cols);

export function neighbours4(site, i) {
  const c = colOf(site, i);
  const r = rowOf(site, i);
  const out = [];
  if (c > 0) out.push(i - 1);
  if (c < site.cols - 1) out.push(i + 1);
  if (r > 0) out.push(i - site.cols);
  if (r < site.rows - 1) out.push(i + site.cols);
  return out;
}

export function around(site, i, radius) {
  const c = colOf(site, i);
  const r = rowOf(site, i);
  const out = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc >= 0 && cc < site.cols && rr >= 0 && rr < site.rows) out.push(rr * site.cols + cc);
    }
  }
  return out;
}

export const isOpen = (site, i) => site.cells[i].hp <= 0;

/** Can you work this cell? (Top row, or next to an open cell, and not already open.) */
export function isWorkable(site, i) {
  const cell = site.cells[i];
  if (cell.hp <= 0 || !Number.isFinite(cell.hp)) return false;
  if (rowOf(site, i) === 0) return true;
  return neighbours4(site, i).some((n) => site.cells[n].hp <= 0);
}

function allReachable(site) {
  const seen = new Uint8Array(site.cells.length);
  const q = [];
  for (let c = 0; c < site.cols; c++) {
    if (Number.isFinite(site.cells[c].hp)) { seen[c] = 1; q.push(c); }
  }
  while (q.length) {
    const i = q.pop();
    for (const n of neighbours4(site, i)) {
      if (!seen[n] && Number.isFinite(site.cells[n].hp)) { seen[n] = 1; q.push(n); }
    }
  }
  return site.bones.every((b) => b.cells.every((i) => seen[i]));
}

/** Cells a tool's pattern covers, centred on i. */
export function patternCells(site, tool, i) {
  const c = colOf(site, i);
  const r = rowOf(site, i);
  const offs = {
    single: [[0, 0]],
    plus: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
    row3: [[0, 0], [-1, 0], [1, 0]],
    square3: [[0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    square5: [],
    column: [],
  }[tool.pattern] || [[0, 0]];
  const out = [];
  for (const [dc, dr] of offs) {
    const cc = c + dc;
    const rr = r + dr;
    if (cc >= 0 && cc < site.cols && rr >= 0 && rr < site.rows) out.push(rr * site.cols + cc);
  }
  return out;
}

function affects(tool, rocks, cell) {
  if (!Number.isFinite(cell.hp)) return false;
  if (!tool.affects || tool.affects.length === 0) return true;
  const tags = rocks[cell.rock]?.tags || [];
  return tool.affects.some((t) => tags.includes(t));
}

export const bonesLeft = (site) => site.bones.filter((b) => !b.found).length;
export const allFound = (site) => site.bones.every((b) => b.found);

/**
 * Use a tool on cell i. Changes the site and returns what happened:
 * { ok, reason?, cost, damaged: [i], opened: [i], cracked: [boneIndex], found: [boneIndex], tap?, scanned?: [i], probe? }
 */
export function useTool(site, tool, rocks, i) {
  const ev = { ok: false, cost: 0, damaged: [], opened: [], cracked: [], found: [], tool: tool.id, at: i };
  const cell = site.cells[i];
  if (!cell) return { ...ev, reason: 'nothing there' };

  if (tool.kind === 'scan') {
    if ((site.charges.scanner ?? 0) <= 0) return { ...ev, reason: 'The scanner is out of charge.' };
    site.charges.scanner--;
    ev.scanned = [];
    for (const n of around(site, i, 2)) {
      const nc = site.cells[n];
      if (nc.bone >= 0 && !site.bones[nc.bone].found && nc.hp > 0) {
        nc.scanned = true;
        ev.scanned.push(n);
      }
    }
    site.log.scans++;
    return { ...ev, ok: true };
  }

  if (tool.kind === 'probe') {
    if ((site.charges.probe ?? 0) <= 0) return { ...ev, reason: 'The probe rod has been used up.' };
    site.charges.probe--;
    const c = colOf(site, i);
    ev.probe = -1;
    for (let r = 0; r < site.rows; r++) {
      const n = r * site.cols + c;
      const nc = site.cells[n];
      if (!Number.isFinite(nc.hp)) break; // the rod stops at bedrock
      if (nc.bone >= 0 && nc.hp > 0 && !site.bones[nc.bone].found) {
        nc.probed = true;
        ev.probe = n;
        break;
      }
    }
    ev.probeCol = c;
    return { ...ev, ok: true };
  }

  if (!isWorkable(site, i)) {
    return { ...ev, reason: cell.hp <= 0 ? 'Already dug out.' : !Number.isFinite(cell.hp) ? "That's bedrock: far too hard to dig." : 'Dig down to it first: you can only work rock next to an open space.' };
  }

  if (tool.kind === 'tap') {
    if (site.energy < tool.cost) return { ...ev, reason: 'Not enough energy.' };
    site.energy -= tool.cost;
    ev.cost = tool.cost;
    let res = 'solid';
    if (cell.bone >= 0 && !site.bones[cell.bone].found) res = 'hollow';
    else if (neighbours4(site, i).some((n) => site.cells[n].bone >= 0 && site.cells[n].hp > 0 && !site.bones[site.cells[n].bone].found)) res = 'echo';
    cell.tap = res;
    ev.tap = res;
    site.log.taps++;
    return { ...ev, ok: true };
  }

  // Digging tools
  if (!affects(tool, rocks, cell)) {
    const what = (tool.affects || []).join(' / ');
    return { ...ev, reason: `The ${tool.name.toLowerCase()} only works on ${what} rock.` };
  }
  if (site.energy < tool.cost) return { ...ev, reason: 'Not enough energy.' };
  site.energy -= tool.cost;
  ev.cost = tool.cost;
  site.log.actions++;

  const crack = (bi) => {
    const b = site.bones[bi];
    if (!b.found && !b.cracked) { b.cracked = true; ev.cracked.push(bi); }
  };

  // Pickaxe-style: cracks every hidden bone in the 3x3 around the hit.
  if (tool.cracks === 'area') {
    for (const n of around(site, i, 1)) {
      const nc = site.cells[n];
      if (nc.bone >= 0) crack(nc.bone);
    }
  }
  for (const n of patternCells(site, tool, i)) {
    const nc = site.cells[n];
    if (nc.hp <= 0 || !affects(tool, rocks, nc)) continue;
    const dmg = n === i ? tool.damage : tool.sideDamage;
    if (dmg <= 0) continue;
    if (tool.cracks === 'overshoot' && n === i && nc.bone >= 0 && dmg > nc.hp) crack(nc.bone);
    nc.hp = Math.max(0, nc.hp - dmg);
    nc.hits++;
    ev.damaged.push(n);
    if (nc.hp <= 0) ev.opened.push(n);
  }
  // Any bone now fully uncovered comes out.
  for (const n of ev.opened) {
    const bi = site.cells[n].bone;
    if (bi < 0) continue;
    const b = site.bones[bi];
    if (!b.found && b.cells.every((ci) => site.cells[ci].hp <= 0)) {
      b.found = true;
      ev.found.push(bi);
    }
  }
  ev.ok = true;
  return ev;
}

/** Is there a bump showing on this cell? Bones and concretions show bumps once you've dug close (2 squares). */
export function showsBump(site, i) {
  const cell = site.cells[i];
  if (cell.hp <= 0) return false;
  if (!(cell.concretion || (cell.bone >= 0 && !site.bones[cell.bone].found))) return false;
  if (rowOf(site, i) <= 1) return true;
  return around(site, i, 2).some((n) => site.cells[n].hp <= 0);
}

/** Lowest energy cost of any action still possible. */
export function canStillDig(site, tools) {
  const min = Math.min(...tools.filter((t) => t.kind === 'dig' || t.kind === 'tap').map((t) => t.cost));
  return site.energy >= min;
}

/** Points for a finished dig. */
export function scoreDig(site) {
  let bonesPts = 0;
  for (const b of site.bones) if (b.found) bonesPts += b.cracked ? CRACKED : PRISTINE;
  const all = allFound(site);
  const perfect = all && site.bones.every((b) => !b.cracked);
  const energyPts = all ? Math.floor(site.energy) * 2 : 0;
  const chargePts = all ? ((site.charges.scanner || 0) + (site.charges.probe || 0)) * 15 : 0;
  const bonus = perfect ? 100 : 0;
  return { bonesPts, energyPts, chargePts, bonus, total: bonesPts + energyPts + chargePts + bonus, all, perfect };
}

/** A deep copy of a site (for the solver). */
export function cloneSite(site) {
  return {
    ...site,
    cells: site.cells.map((c) => ({ ...c })),
    bones: site.bones.map((b) => ({ ...b, cells: [...b.cells] })),
    charges: { ...site.charges },
    log: { ...site.log },
  };
}
