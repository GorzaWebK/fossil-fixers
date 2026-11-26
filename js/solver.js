// A perfect-knowledge digger. It knows where every bone is and digs them all
// out without cracking any, using only the brush, chisel and pickaxe.
// Used to (1) set each site's energy so it can always be finished, (2) work
// out the Daily Dig's "Curator's mark", and (3) prove in tests that every
// site can be completed.

import { cloneSite, useTool, isWorkable, neighbours4, around, allFound } from './dig.js';

function estCost(cell) {
  if (cell.hp <= 0) return 0;
  if (!Number.isFinite(cell.hp)) return Infinity;
  if (cell.bone >= 0) {
    // chisel while >= 3 rock is left on the bone, then brush
    const chisels = Math.floor(cell.hp / 3);
    return chisels * 3 + (cell.hp - chisels * 3) * 2;
  }
  return Math.ceil(cell.hp / 3) * 3;
}

function bonesNear(site, i) {
  return around(site, i, 1).some((n) => {
    const c = site.cells[n];
    return c.bone >= 0 && !site.bones[c.bone].found && !site.bones[c.bone].cracked;
  });
}

function clearCell(site, tools, rocks, i, moves) {
  const { brush, chisel, pickaxe } = tools;
  let guard = 50;
  while (site.cells[i].hp > 0 && guard-- > 0) {
    const cell = site.cells[i];
    let tool;
    if (cell.bone >= 0) tool = cell.hp >= chisel.damage ? chisel : brush;
    else if (!bonesNear(site, i)) tool = pickaxe;
    else tool = chisel;
    const ev = useTool(site, tool, rocks, i);
    if (!ev.ok) return false;
    moves.push({ tool: tool.id, i });
  }
  return site.cells[i].hp <= 0;
}

/**
 * Dig a copy of the site perfectly. Returns { ok, cost, cracked, site }.
 * site.energy is set very high for the run, so cost is what it actually used.
 */
export function solve(siteIn, toolList, rocks) {
  const site = cloneSite(siteIn);
  const tools = Object.fromEntries(toolList.map((t) => [t.id, t]));
  site.energy = 1e9;
  const start = site.energy;
  const N = site.cells.length;
  const moves = [];
  let guard = 400;
  while (!allFound(site) && guard-- > 0) {
    // Dijkstra from every workable cell to the nearest hidden bone cell.
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (isWorkable(site, i)) dist[i] = estCost(site.cells[i]);
    let target = -1;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      const cu = site.cells[u];
      if (cu.bone >= 0 && cu.hp > 0 && !site.bones[cu.bone].found) { target = u; break; }
      for (const n of neighbours4(site, u)) {
        if (done[n] || site.cells[n].hp <= 0) continue;
        const d = best + estCost(site.cells[n]);
        if (d < dist[n]) { dist[n] = d; prev[n] = u; }
      }
    }
    if (target < 0) return { ok: false, cost: start - site.energy, cracked: 0, site, moves, reason: 'unreachable bone' };
    const path = [];
    for (let i = target; i >= 0; i = prev[i]) path.push(i);
    path.reverse();
    for (const i of path) {
      if (site.cells[i].hp <= 0) continue;
      if (!clearCell(site, tools, rocks, i, moves)) return { ok: false, cost: start - site.energy, cracked: 0, site, moves, reason: 'stuck' };
    }
  }
  const cracked = site.bones.filter((b) => b.cracked).length;
  return { ok: allFound(site) && cracked === 0, cost: start - site.energy, cracked, site, moves };
}

/** Give a freshly generated site its energy: solver cost x slack, plus a few taps. */
export function setEnergy(site, toolList, rocks, slack = 1.5, tapAllowance = 8) {
  const res = solve(site, toolList, rocks);
  if (!res.ok) throw new Error('Site cannot be solved: ' + (res.reason || 'cracks'));
  site.solverCost = res.cost;
  site.maxEnergy = Math.ceil(res.cost * slack) + tapAllowance;
  site.energy = site.maxEnergy;
  return site;
}
