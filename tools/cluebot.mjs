// A bot that digs like a careful player: it only uses what you can see on
// screen (rock, bumps, tap results, scanner marks, uncovered bone). It never
// peeks at where bones are hidden. Used to check that reading the clues is
// enough to finish a dig within its energy, so skill matters more than luck.
//
//   node tools/cluebot.mjs            prints a table for every site
//
// Strategy:
//   1. Never swing the pickaxe if a bump, a hollow/echo tap, a scanner mark or
//      uncovered bone is within one square of the hit (that's the crack zone).
//   2. Tap bumpy squares to tell bones from concretions.
//   3. Dig to known bone squares the cheap way, then chisel/brush them free.
//   4. Otherwise explore: shafts and tunnels that bring new rock within sight.
//   5. Use a scanner charge when exploring has gone quiet for a while.

import { useTool, isWorkable, showsBump, neighbours4, around, rowOf, colOf, allFound, canStillDig } from '../js/dig.js';

function visibleBoneHint(site, i) {
  const c = site.cells[i];
  if (c.hp <= 0) return false;
  return c.tap === 'hollow' || c.scanned || c.probed;
}

// Bone cells you can see: uncovered parts of bones still in the ground.
function exposedBone(site, i) {
  const c = site.cells[i];
  return c.hp <= 0 && c.bone >= 0 && !site.bones[c.bone].found;
}

function danger(site, i) {
  // Anything in the 3x3 that looks like it could be bone.
  return around(site, i, 1).some((n) => {
    const c = site.cells[n];
    if (exposedBone(site, n)) return true;
    if (c.hp <= 0) return false;
    return showsBump(site, n) || c.tap === 'hollow' || c.tap === 'echo' || c.scanned || c.probed || site.__suspect.has(n);
  });
}

export function playLikeAPlayer(siteIn, tools, rocks, { useGadgets = false } = {}) {
  const site = siteIn; // caller passes a copy
  site.__suspect = new Set();
  const T = Object.fromEntries(tools.map((t) => [t.id, t]));
  const log = [];
  let quiet = 0;
  const use = (tool, i) => {
    const ev = useTool(site, tool, rocks, i);
    if (ev.ok) log.push(tool.id);
    return ev;
  };

  const clear = (i, careful) => {
    // Clear one cell. Careful = a bone could be in this cell.
    let guard = 30;
    while (site.cells[i].hp > 0 && guard-- > 0) {
      const c = site.cells[i];
      let tool;
      if (careful) tool = c.hp >= 3 ? T.chisel : T.brush;
      else if (!danger(site, i)) tool = T.pickaxe;
      else tool = T.chisel;
      if (site.energy < tool.cost) {
        tool = [T.chisel, T.brush].find((t) => site.energy >= t.cost && (!careful || t === T.brush || c.hp >= 3));
        if (!tool) return false;
      }
      const ev = use(tool, i);
      if (!ev.ok) { if (process.env.BOTDEBUG) console.log('fail', tool.id, i, ev.reason); return false; }
      for (const n of ev.opened) {
        // A newly uncovered bone square means its neighbours are suspects.
        if (exposedBone(site, n)) for (const m of neighbours4(site, n)) if (site.cells[m].hp > 0) site.__suspect.add(m);
      }
    }
    return site.cells[i].hp <= 0;
  };

  // cheapest path (by visible hardness) from the open area to cell t
  const pathTo = (t) => {
    const N = site.cells.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    const cost = (i) => (Number.isFinite(site.cells[i].hp) ? Math.max(0, site.cells[i].hp) + 1 : Infinity);
    for (let i = 0; i < N; i++) if (isWorkable(site, i)) dist[i] = cost(i);
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) return null;
      done[u] = 1;
      if (u === t) break;
      for (const n of neighbours4(site, u)) {
        if (done[n] || site.cells[n].hp <= 0) continue;
        const d = best + cost(n);
        if (d < dist[n]) { dist[n] = d; prev[n] = u; }
      }
    }
    const path = [];
    for (let i = t; i >= 0; i = prev[i]) path.push(i);
    return path.reverse();
  };

  let guard = 600;
  while (!allFound(site) && canStillDig(site, tools) && guard-- > 0) {
    // 1. Known (or strongly suspected) bone squares: dig them out.
    const targets = [];
    for (let i = 0; i < site.cells.length; i++) {
      if (site.cells[i].hp > 0 && Number.isFinite(site.cells[i].hp) && (visibleBoneHint(site, i))) targets.push(i);
    }
    if (targets.length) {
      let bestT = -1, bestP = null;
      for (const t of targets) {
        const p = pathTo(t);
        if (p && (!bestP || p.length < bestP.length)) { bestP = p; bestT = t; }
      }
      if (bestP) {
        let ok = true;
        for (const i of bestP) {
          if (site.cells[i].hp <= 0) continue;
          const careful = i === bestT || visibleBoneHint(site, i) || site.__suspect.has(i) || site.cells[i].tap === 'echo' || showsBump(site, i);
          if (!clear(i, careful)) { ok = false; break; }
        }
        if (!ok) break;
        quiet = 0;
        continue;
      }
    }
    // 2. Tap suspects and bumps you can reach.
    let tapped = false;
    for (let i = 0; i < site.cells.length; i++) {
      const c = site.cells[i];
      if (c.hp > 0 && !c.tap && isWorkable(site, i) && (showsBump(site, i) || site.__suspect.has(i)) && site.energy >= T.tap.cost) {
        use(T.tap, i);
        site.__suspect.delete(i);
        tapped = true;
        break;
      }
    }
    if (tapped) continue;
    // 2b. Echo next to the dig face: tap its unknown neighbours.
    for (let i = 0; i < site.cells.length && !tapped; i++) {
      if (site.cells[i].tap !== 'echo' || site.cells[i].hp <= 0) continue;
      for (const n of neighbours4(site, i)) {
        const c = site.cells[n];
        if (c.hp > 0 && !c.tap && Number.isFinite(c.hp) && isWorkable(site, n) && site.energy >= T.tap.cost) { use(T.tap, n); tapped = true; break; }
      }
      // dig the echo cell carefully to reach the neighbours behind it
      if (!tapped && isWorkable(site, i)) { clear(i, true); tapped = true; }
    }
    if (tapped) continue;
    // 2c. Bumps you can't reach yet: dig toward them carefully.
    let bumpT = -1;
    for (let i = 0; i < site.cells.length; i++) if (site.cells[i].hp > 0 && !site.cells[i].tap && showsBump(site, i)) { bumpT = i; break; }
    if (bumpT >= 0) {
      const p = pathTo(bumpT);
      if (p && p.length > 1) { clear(p[0], showsBump(site, p[0])); continue; }
    }
    // 3. Scanner when exploring has gone quiet.
    if (quiet > 6 && site.charges.scanner > 0) {
      // scan around the deepest open cell
      let best = -1, bestScore = -1;
      for (let i = 0; i < site.cells.length; i++) {
        if (site.cells[i].hp > 0) continue;
        const unknown = around(site, i, 2).filter((n) => site.cells[n].hp > 0 && Number.isFinite(site.cells[n].hp) && !site.cells[n].tap).length;
        if (unknown > bestScore) { bestScore = unknown; best = i; }
      }
      if (best >= 0) { use(T.scanner, best); quiet = 0; continue; }
    }
    // 4. Explore: pick a workable cell that brings the most unseen rock within 2 squares, cheaply.
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < site.cells.length; i++) {
      if (!isWorkable(site, i) || !Number.isFinite(site.cells[i].hp)) continue;
      if (rowOf(site, i) >= site.rows - 1) continue;
      let gain = 0;
      for (const n of around(site, i, 2)) {
        const c = site.cells[n];
        if (c.hp > 0 && Number.isFinite(c.hp) && !around(site, n, 2).some((m) => site.cells[m].hp <= 0)) gain++;
      }
      const score = gain * 3 - site.cells[i].hp - (danger(site, i) ? 3 : 0) + rowOf(site, i) * 0.2 - Math.abs(colOf(site, i) - site.cols / 2) * 0.05;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    if (!clear(best, danger(site, best) && showsBump(site, best))) break;
    quiet++;
  }
  delete site.__suspect;
  const found = site.bones.filter((b) => b.found).length;
  const cracked = site.bones.filter((b) => b.found && b.cracked).length;
  return { found, total: site.bones.length, cracked, energyLeft: site.energy, actions: log.length };
}

// CLI: a table for every site, a few replays each
if (import.meta.url === `file://${process.argv[1]}`) {
  const { getData } = await import('../tests/helpers.mjs');
  const { buildSite, toolsForRegion } = await import('../js/sites.js');
  const { cloneSite } = await import('../js/dig.js');
  const data = await getData();
  let all = 0, tot = 0, cr = 0;
  for (const id of Object.keys(data.siteById)) {
    const rows = [];
    for (let rep = 0; rep < 4; rep++) {
      const s = buildSite(data, id, { replay: rep });
      const r = playLikeAPlayer(cloneSite(s), toolsForRegion(data, data.siteById[id].region), data.rocks);
      rows.push(r);
      all += r.found; tot += r.total; cr += r.cracked;
    }
    const pct = Math.round((rows.reduce((a, r) => a + r.found, 0) / rows.reduce((a, r) => a + r.total, 0)) * 100);
    const full = rows.filter((r) => r.found === r.total).length;
    console.log(`${id.padEnd(10)} found ${String(pct).padStart(3)}%  complete ${full}/4  cracked ${rows.reduce((a, r) => a + r.cracked, 0)}`);
  }
  console.log(`overall ${Math.round((all / tot) * 100)}% of bones, ${cr} cracked`);
}
