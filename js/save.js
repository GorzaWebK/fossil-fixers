// Everything this browser remembers: the museum, bones, stars, unlocks and settings.
// Stored in localStorage and carried between computers with an account code (account.js).

export const SAVE_KEY = 'fossil-fixers-save';
export const SETTINGS_KEY = 'fossil-fixers-settings';

export function emptySave() {
  return {
    v: 1,
    name: '',
    collection: {}, // creatureId -> { bones: { boneId: 'p' (pristine) | 'c' (cracked) } }
    assembled: {},  // creatureId -> [boneId placed on the skeleton]
    sites: {},      // siteId -> { plays, best, done }
    daily: { best: {}, streak: 0, last: '' },
    upgrades: { lighting: 'light-lamps', plaque: 'plaque-card', banner: 'banner-none', floor: 'floor-boards' },
    seen: {},       // tutorial flags, facts read
  };
}

export function defaultSettings() {
  return { music: 0.5, sfx: 0.8, colourblind: false, reducedMotion: false, textSize: 'm' };
}

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const ID = /^[a-z0-9-]{1,40}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Only allow characters that are safe and friendly for a nickname. */
export function cleanName(s) {
  return String(s ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

/** Tidy up a save from storage or an account code (drop anything broken or unknown). */
export function cleanSave(raw) {
  const s = emptySave();
  if (!isObj(raw)) return s;
  if (typeof raw.name === 'string') s.name = cleanName(raw.name);
  if (isObj(raw.collection)) {
    for (const [cid, v] of Object.entries(raw.collection)) {
      if (!ID.test(cid) || !isObj(v) || !isObj(v.bones)) continue;
      const bones = {};
      for (const [bid, q] of Object.entries(v.bones)) if (ID.test(bid) && (q === 'p' || q === 'c')) bones[bid] = q;
      s.collection[cid] = { bones };
    }
  }
  if (isObj(raw.assembled)) {
    for (const [cid, list] of Object.entries(raw.assembled)) {
      if (ID.test(cid) && Array.isArray(list)) s.assembled[cid] = [...new Set(list.filter((b) => typeof b === 'string' && ID.test(b)))];
    }
  }
  if (isObj(raw.sites)) {
    for (const [sid, v] of Object.entries(raw.sites)) {
      if (!ID.test(sid) || !isObj(v)) continue;
      s.sites[sid] = { plays: isNum(v.plays) ? Math.max(0, Math.floor(v.plays)) : 0, best: isNum(v.best) ? Math.max(0, Math.floor(v.best)) : 0, done: !!v.done };
    }
  }
  if (isObj(raw.daily)) {
    if (isObj(raw.daily.best)) for (const [d, sc] of Object.entries(raw.daily.best)) if (DAY.test(d) && isNum(sc)) s.daily.best[d] = Math.floor(sc);
    // keep the last 120 days
    s.daily.best = Object.fromEntries(Object.entries(s.daily.best).sort().slice(-120));
    if (isNum(raw.daily.streak)) s.daily.streak = Math.max(0, Math.floor(raw.daily.streak));
    if (typeof raw.daily.last === 'string' && DAY.test(raw.daily.last)) s.daily.last = raw.daily.last;
  }
  if (isObj(raw.upgrades)) for (const k of Object.keys(s.upgrades)) if (typeof raw.upgrades[k] === 'string' && ID.test(raw.upgrades[k])) s.upgrades[k] = raw.upgrades[k];
  if (isObj(raw.seen)) for (const [k, v] of Object.entries(raw.seen)) if (ID.test(k) && (v === true || isNum(v))) s.seen[k] = v;
  return s;
}

export function cleanSettings(raw) {
  const s = defaultSettings();
  if (!isObj(raw)) return s;
  for (const k of ['music', 'sfx']) if (isNum(raw[k])) s[k] = Math.max(0, Math.min(1, raw[k]));
  for (const k of ['colourblind', 'reducedMotion']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
  if (['m', 'l', 'xl'].includes(raw.textSize)) s.textSize = raw.textSize;
  return s;
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const loadSave = () => cleanSave(read(SAVE_KEY));
export const storeSave = (s) => write(SAVE_KEY, s);
export const loadSettings = () => cleanSettings(read(SETTINGS_KEY));
export const storeSettings = (s) => write(SETTINGS_KEY, s);

// ------------------------------------------------------------ progress maths

/** Add the bones from a finished dig. A pristine find replaces a cracked one, never the other way. */
export function addFinds(save, finds) {
  const added = [];
  for (const f of finds) {
    const c = (save.collection[f.creatureId] ||= { bones: {} });
    const old = c.bones[f.boneId];
    const q = f.cracked ? 'c' : 'p';
    if (!old || (old === 'c' && q === 'p')) {
      c.bones[f.boneId] = q;
      added.push({ ...f, upgraded: old === 'c' });
    }
  }
  return added;
}

/** Stars for one creature on display: half placed, all placed, all placed and pristine. */
export function creatureStars(save, creature) {
  const placed = (save.assembled[creature.id] || []).filter((b) => creature.bones.some((x) => x.id === b));
  if (placed.length === 0) return 0;
  const ratio = placed.length / creature.bones.length;
  const bones = save.collection[creature.id]?.bones || {};
  const pristine = placed.every((b) => bones[b] === 'p');
  return (ratio >= 0.5 ? 1 : 0) + (ratio >= 1 ? 1 : 0) + (ratio >= 1 && pristine ? 1 : 0);
}

/** Quality (0-100) and completeness (0-1) of a skeleton on display. */
export function creatureQuality(save, creature) {
  const placed = save.assembled[creature.id] || [];
  const bones = save.collection[creature.id]?.bones || {};
  if (!placed.length) return { quality: 0, complete: 0 };
  const q = placed.reduce((s, b) => s + (bones[b] === 'p' ? 100 : 60), 0) / placed.length;
  return { quality: Math.round(q), complete: placed.length / creature.bones.length };
}

export function totalStars(save, data) {
  return data.creatures.reduce((s, c) => s + creatureStars(save, c), 0);
}

export const maxStars = (data) => data.creatures.length * 3;

export function regionUnlocked(save, data, regionId) {
  return totalStars(save, data) >= data.regionById[regionId].stars;
}

/** Sites open in order: the first of each open region, then each one after you've dug the one before. */
export function siteUnlocked(save, data, siteId) {
  const def = data.siteById[siteId];
  if (!regionUnlocked(save, data, def.region)) return false;
  const sites = data.regionById[def.region].sites;
  const i = sites.findIndex((s) => s.id === siteId);
  if (def.creature === 'bonebed') return sites.slice(0, i).every((s) => save.sites[s.id]?.done);
  return i === 0 || !!save.sites[sites[i - 1].id]?.done;
}

/** Record a finished Daily Dig (best score and the day streak). */
export function recordDaily(save, day, score) {
  const prev = save.daily.best[day];
  if (prev === undefined || score > prev) save.daily.best[day] = score;
  if (save.daily.last !== day) {
    const y = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    save.daily.streak = save.daily.last === y ? save.daily.streak + 1 : 1;
    save.daily.last = day;
  }
}
