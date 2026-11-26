// Builds playable dig sites from the JSON data. Pure logic (Node tests use it too).

import { generateSite, scoreDig, PRISTINE } from './dig.js';
import { setEnergy } from './solver.js';
import { makeRng, hashString } from './rng.js';

/** Load every data file. getJson(path) returns the parsed JSON (fetch in the browser, fs in Node). */
export async function loadData(getJson) {
  const [rocks, tools, regions, creatures, upgrades] = await Promise.all([
    getJson('data/rocks.json'), getJson('data/tools.json'), getJson('data/regions.json'),
    getJson('data/creatures.json'), getJson('data/upgrades.json'),
  ]);
  return indexData({ rocks: rocks.rocks, tools: tools.tools, regions: regions.regions, creatures: creatures.creatures, upgrades: upgrades.upgrades });
}

export function indexData(d) {
  d.creatureById = Object.fromEntries(d.creatures.map((c) => [c.id, c]));
  d.toolById = Object.fromEntries(d.tools.map((t) => [t.id, t]));
  d.regionById = Object.fromEntries(d.regions.map((r) => [r.id, r]));
  d.siteById = {};
  for (const r of d.regions) for (const s of r.sites) d.siteById[s.id] = { ...s, region: r.id };
  return d;
}

/** Tools you have at a region: every tool from that region and the ones before it. */
export function toolsForRegion(data, regionId) {
  const order = data.regions.map((r) => r.id);
  const upto = order.indexOf(regionId);
  return data.tools.filter((t) => order.indexOf(t.region) <= upto);
}

export const baseTools = (data) => ['brush', 'chisel', 'pickaxe'].map((id) => data.toolById[id]);

/**
 * Which bones go into a site.
 * Normal sites: every bone of the creature.
 * Bonebeds: bonesPerCreature from each creature in the region, picking bones
 * you haven't got (or only have cracked) first.
 */
export function bonesForSite(data, siteDef, collection = {}, seed = siteDef.id) {
  const region = data.regionById[siteDef.region];
  if (siteDef.creature !== 'bonebed') {
    const c = data.creatureById[siteDef.creature];
    return c.bones.map((bone) => ({ creatureId: c.id, bone }));
  }
  const rng = makeRng(`${seed}:bonebed`);
  const out = [];
  for (const cid of region.creatures) {
    const c = data.creatureById[cid];
    const have = collection[cid]?.bones || {};
    const need = rng.shuffle(c.bones.filter((b) => have[b.id] !== 'p'));
    const rest = rng.shuffle(c.bones.filter((b) => have[b.id] === 'p'));
    for (const bone of [...need, ...rest].slice(0, siteDef.bonesPerCreature ?? 3)) out.push({ creatureId: cid, bone });
  }
  return out;
}

/** A ready-to-play site for a dig on the map. replay = how many times you've dug it before (new layout each time). */
export function buildSite(data, siteId, { replay = 0, collection = {} } = {}) {
  const def = data.siteById[siteId];
  const region = data.regionById[def.region];
  const seed = `${def.id}:${replay}`;
  const tools = toolsForRegion(data, region.id);
  const site = generateSite({
    seed, cols: def.cols, rows: def.rows, region, rocks: data.rocks,
    bones: bonesForSite(data, def, collection, seed),
    concretions: def.concretions ?? 3,
    scannerCharges: def.scanner ?? 2,
    probeCharges: tools.some((t) => t.id === 'probe') ? 3 : 0,
  });
  setEnergy(site, baseTools(data), data.rocks, def.slack ?? 1.5);
  site.siteId = def.id;
  site.regionId = region.id;
  site.tools = tools.map((t) => t.id);
  return site;
}

/** Today's Daily Dig: the same for everyone on the same UTC day. */
export function buildDaily(data, day) {
  const seed = `FF-daily-${day}`;
  const rng = makeRng(seed);
  const region = rng.pick(data.regions);
  const cid = rng.pick(region.creatures);
  const c = data.creatureById[cid];
  const tools = toolsForRegion(data, region.id);
  const site = generateSite({
    seed, cols: 14, rows: 11, region, rocks: data.rocks,
    bones: c.bones.map((bone) => ({ creatureId: cid, bone })),
    concretions: 4, scannerCharges: 2,
    probeCharges: tools.some((t) => t.id === 'probe') ? 3 : 0,
  });
  setEnergy(site, baseTools(data), data.rocks, 1.4);
  site.siteId = 'daily';
  site.day = day;
  site.regionId = region.id;
  site.creatureId = cid;
  site.tools = tools.map((t) => t.id);
  site.par = parScore(site);
  return site;
}

/** The score of a perfect dig (every bone pristine, energy left over), and 80% of it as the mark to beat. */
export function perfectScore(site) {
  const n = site.bones.length;
  const left = site.maxEnergy - site.solverCost;
  return n * PRISTINE + 100 + Math.floor(left) * 2 + ((site.charges.scanner || 0) + (site.charges.probe || 0)) * 15;
}

export const parScore = (site) => Math.round(perfectScore(site) * 0.8);

export { scoreDig, hashString };
