// Fossil Fixers: start-up and the glue between screens.

import { loadData, buildSite, buildDaily, scoreDig } from './sites.js';
import { loadSave, storeSave, loadSettings, storeSettings, cleanName, addFinds, creatureStars, creatureQuality, totalStars, maxStars, regionUnlocked, siteUnlocked, recordDaily } from './save.js';
import { getAccount, exportCode, parseCode, importAccount } from './account.js';
import { DigView } from './digview.js';
import { RebuildView } from './rebuildview.js';
import { MuseumView } from './museum.js';
import { buildMap } from './map.js';
import { drawBonePlaced, drawBoneInBox } from './bones.js';
import { drawBump, drawTapMark, drawScanMark, cellRand, legendCanvas } from './art.js';
import { solve } from './solver.js';
import { utcDay } from './rng.js';
import { sfx, setMusic, setVolumes, unlockAudio } from './audio.js';
import { $, esc, showScreen, currentScreen, openModal, closeModal, modalOpen, toast, starsLine } from './ui.js';

let data;
let save;
let settings;
let dig = null;        // { site, siteId, daily }
let rebuildCreature = null;
let digView, rebuildView, museumView;

// ---------------------------------------------------------------- boot
async function boot() {
  data = await loadData(async (p) => {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`Couldn't load ${p}`);
    return r.json();
  });
  save = loadSave();
  settings = loadSettings();
  if (!localStorage.getItem('fossil-fixers-settings') && matchMedia?.('(prefers-reduced-motion: reduce)').matches) settings.reducedMotion = true;
  applySettings();
  getAccount();

  digView = new DigView({
    canvas: $('dig-canvas'), wrap: $('dig-wrap'), data,
    hud: {
      toolroll: $('toolroll'), toast: $('dig-toast'), site: $('clip-site'), energyNum: $('energy-num'), energyFill: $('energy-fill'),
      charges: $('charges'), bonesCount: $('bones-count'), boneList: $('bone-list'), legend: $('legend'),
    },
    onEnd: endDig,
  });
  rebuildView = new RebuildView({ canvas: $('rebuild-canvas'), wrap: $('rebuild-wrap'), status: $('rebuild-status'), onPlace: placeBone, onComplete: skeletonComplete });
  museumView = new MuseumView({ canvas: $('museum-canvas'), wrap: $('museum-wrap'), onOpen: openFact });

  wire();
  refreshCover();
  go('cover');
}

function persist() { storeSave(save); }

function applySettings() {
  document.documentElement.dataset.text = settings.textSize;
  document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
  setVolumes(settings.sfx, settings.music);
  digView?.setSettings(settings);
}

// ---------------------------------------------------------------- navigation
function go(name) {
  closeModal({ silent: true });
  if (currentScreen() === 'dig' && name !== 'dig') digView.stop();
  if (currentScreen() === 'rebuild' && name !== 'rebuild') rebuildView.stop();
  if (currentScreen() === 'museum' && name !== 'museum') museumView.stop();
  showScreen(name);
  if (name === 'cover') { refreshCover(); setMusic('menu'); }
  if (name === 'map') { renderMap(); setMusic('menu'); }
  if (name === 'museum') { $('museum-stars').textContent = totalStars(save, data); museumView.show(data, save, settings); setMusic('museum'); }
}

function refreshCover() {
  $('nickname').value = save.name;
  $('cover-stars').textContent = totalStars(save, data);
}

// ---------------------------------------------------------------- map + briefing
function renderMap() {
  $('map-stars').textContent = totalStars(save, data);
  $('map-board').innerHTML = buildMap(data, save);
  $('brief').hidden = true;
  for (const n of $('map-board').querySelectorAll('.map-note')) {
    const open = () => openBrief(n.dataset.site);
    n.addEventListener('click', open);
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  }
}

function rockSwatches(region) {
  const ids = [...new Set([...region.layers.map((l) => l.rock), ...(region.inclusions || []).map((i) => i.rock), region.bedrock])];
  return ids.map((id) => { const r = data.rocks[id]; return `<span class="swatch"><i style="background:${r.color}"></i>${esc(r.name)}${r.hp ? ` (${r.hp})` : ''}</span>`; }).join('');
}

function openBrief(siteId) {
  const def = data.siteById[siteId];
  const region = data.regionById[def.region];
  const brief = $('brief');
  sfx.page();
  if (!siteUnlocked(save, data, siteId)) {
    const need = !regionUnlocked(save, data, region.id) ? `Get ★${region.stars} visitors to open ${region.name}.` : def.creature === 'bonebed' ? 'Dig the other three sites in this region first.' : 'Dig the site before this one first.';
    brief.className = 'brief card';
    brief.innerHTML = `<button class="close" aria-label="Close">✕</button><h3>${esc(def.name)}</h3><p><span class="stamp navy">Locked</span></p><p>${esc(need)}</p>`;
  } else {
    const rec = save.sites[siteId] || { plays: 0, best: 0 };
    let who;
    if (def.creature === 'bonebed') {
      who = region.creatures.map((cid) => data.creatureById[cid]).map((c) => `${esc(c.name)} ${bonesHave(c)}/${c.bones.length}`).join(' · ');
    } else {
      const c = data.creatureById[def.creature];
      who = rec.plays ? `${esc(c.name)}: ${bonesHave(c)} of ${c.bones.length} bones found` : 'Mystery creature!';
    }
    const gadget = data.toolById[region.gadget];
    brief.className = 'brief card';
    brief.innerHTML = `
      <button class="close" aria-label="Close">✕</button>
      <p class="note" style="margin:0">${esc(region.name)}</p>
      <h3>${esc(def.name)}</h3>
      <p>${esc(def.note)}</p>
      <p><b>Find:</b> ${who}</p>
      <div class="rocks">${rockSwatches(region)}</div>
      <p class="note">Numbers show how many hits each rock takes.</p>
      <p><b>New here:</b> ${esc(gadget.name)}: ${esc(gadget.blurb)}</p>
      ${rec.plays ? `<p>Dug ${rec.plays} time${rec.plays > 1 ? 's' : ''} · best score ${rec.best}</p>` : ''}
      <div class="row"><button class="tag tag-rust" id="btn-start-dig"><span>${rec.plays ? 'Dig again' : 'Start digging'}</span></button></div>
      ${rec.plays ? '<p class="note">Each new dig has a fresh layout. Pristine finds replace cracked ones.</p>' : ''}`;
    brief.querySelector('#btn-start-dig').addEventListener('click', () => startDig(siteId));
  }
  brief.hidden = false;
  brief.querySelector('.close').addEventListener('click', () => { brief.hidden = true; });
}

function bonesHave(c) { return Object.keys(save.collection[c.id]?.bones || {}).length; }

// ---------------------------------------------------------------- digging
function startDig(siteId) {
  unlockAudio();
  let site;
  if (siteId === 'daily') {
    site = buildDaily(data, utcDay());
  } else {
    const plays = save.sites[siteId]?.plays || 0;
    site = buildSite(data, siteId, { replay: plays, collection: save.collection });
  }
  dig = { site, siteId, daily: siteId === 'daily' };
  digView.siteName = siteId === 'daily' ? `Daily Dig · ${site.day}` : data.siteById[siteId].name;
  digView.scannerMax = site.charges.scanner;
  go('dig');
  digView.start(site, settings);
  setMusic(site.regionId);
  if (!save.seen.help) { save.seen.help = true; persist(); openHelp(); }
  else if (!save.seen['gadget-' + site.regionId] && siteId !== 'daily') {
    save.seen['gadget-' + site.regionId] = true;
    persist();
    const g = data.toolById[data.regionById[site.regionId].gadget];
    toast(`New tool in your roll: ${g.name}. ${g.blurb}`, 5000);
  }
}

function endDig(reason) {
  const site = dig.site;
  const sc = scoreDig(site);
  const finds = site.bones.filter((b) => b.found).map((b) => ({ creatureId: b.creatureId, boneId: b.boneId, cracked: b.cracked }));
  const starsBefore = totalStars(save, data);
  let added = [];
  let dailyInfo = null;
  if (dig.daily) {
    const prevBest = save.daily.best[site.day];
    recordDaily(save, site.day, sc.total);
    dailyInfo = { par: site.par, prevBest, best: save.daily.best[site.day], streak: save.daily.streak };
  } else {
    added = addFinds(save, finds);
    const rec = (save.sites[dig.siteId] ||= { plays: 0, best: 0, done: false });
    rec.plays++;
    rec.best = Math.max(rec.best, sc.total);
    rec.done = true;
  }
  persist();
  showReport(reason, sc, added, dailyInfo, starsBefore);
}

function boneThumb(bone, cracked) {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 80;
  const ctx = c.getContext('2d');
  drawBoneInBox(ctx, bone, 80, 40, 150, 70, { cracked, outline: 2 });
  return c;
}

function showReport(reason, sc, added, dailyInfo) {
  const site = dig.site;
  const why = { all: 'Every bone found!', energy: 'Out of energy.', packed: 'Packed up early.' }[reason];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <h2>Dig report</h2>
    <p><b>${esc(digView.siteName)}</b> · ${why}</p>
    <div class="report-bones" id="report-bones"></div>
    <table class="score-table">
      <tr><td>Bones (pristine 100, cracked 60)</td><td>${sc.bonesPts}</td></tr>
      ${sc.all ? `<tr><td>Energy left × 2</td><td>${sc.energyPts}</td></tr><tr><td>Unused charges × 15</td><td>${sc.chargePts}</td></tr>` : '<tr><td colspan="2" class="note">Find every bone to score bonus points for energy and charges left.</td></tr>'}
      ${sc.perfect ? '<tr><td>Perfect dig: nothing cracked</td><td>100</td></tr>' : ''}
      <tr class="total"><td>Score</td><td>${sc.total}</td></tr>
    </table>
    ${dailyInfo ? `<p>Curator's mark: <b>${dailyInfo.par}</b> · ${sc.total >= dailyInfo.par ? '<span class="stamp olive">Beaten!</span>' : 'not beaten yet. Try again!'}</p><p>Your best today: <b>${dailyInfo.best}</b> · Daily streak: <b>${dailyInfo.streak}</b> day${dailyInfo.streak === 1 ? '' : 's'}</p><p class="note">Daily Dig finds are for score only: they don't go into your museum.</p>` : ''}
    ${!dailyInfo && added.length ? `<p>${added.length} new or better bone${added.length > 1 ? 's' : ''} for your collection.</p>` : ''}
    <div class="row" id="report-actions"></div>`;
  const grid = wrap.querySelector('#report-bones');
  for (const b of site.bones) {
    const card = document.createElement('div');
    card.className = 'report-bone' + (b.found ? '' : ' missing');
    card.append(boneThumb(b.bone, b.cracked));
    const label = document.createElement('div');
    label.textContent = b.found ? b.bone.name : `${b.bone.name} (not found)`;
    card.append(label);
    if (b.found) {
      const st = document.createElement('span');
      st.className = 'stamp ' + (b.cracked ? '' : 'olive');
      st.textContent = b.cracked ? 'Cracked' : 'Pristine';
      card.append(st);
    }
    grid.append(card);
  }
  const actions = wrap.querySelector('#report-actions');
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = `<span>${label}</span>`; b.addEventListener('click', fn); actions.append(b); return b; };
  if (!dig.daily) {
    const creatures = [...new Set(site.bones.filter((b) => b.found).map((b) => b.creatureId))].filter((cid) => unplacedCount(cid) > 0);
    for (const cid of creatures) btn(`Rebuild ${data.creatureById[cid].name}`, 'tag tag-rust', () => openRebuild(cid));
    btn('Back to the map', 'tag', () => go('map'));
    btn('Dig here again', 'tape', () => startDig(dig.siteId));
  } else {
    btn('Try again', 'tag tag-rust', () => startDig('daily'));
    btn('Back to the journal', 'tag', () => go('cover'));
  }
  openModal(wrap, { wide: true, onClose: () => { if (currentScreen() === 'dig') go(dig.daily ? 'cover' : 'map'); } });
}

function unplacedCount(cid) {
  const have = save.collection[cid]?.bones || {};
  const placed = new Set(save.assembled[cid] || []);
  return Object.keys(have).filter((b) => !placed.has(b)).length;
}

// ---------------------------------------------------------------- rebuild
function openRebuild(cid) {
  const c = data.creatureById[cid];
  rebuildCreature = c;
  go('rebuild');
  $('rebuild-title').textContent = `Rebuild: ${c.name}`;
  rebuildView.start(c, save.collection[cid]?.bones || {}, save.assembled[cid] || [], settings);
  setMusic('museum');
}

function placeBone(slotId) {
  const cid = rebuildCreature.id;
  const before = totalStars(save, data);
  const list = (save.assembled[cid] ||= []);
  if (!list.includes(slotId)) list.push(slotId);
  persist();
  announceUnlocks(before);
}

function skeletonComplete() {
  const c = rebuildCreature;
  sfx.shutter();
  if (!settings.reducedMotion) {
    const f = $('flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
  const st = document.createElement('div');
  st.className = 'stamp big-stamp';
  st.textContent = 'Catalogued!';
  document.body.append(st);
  sfx.stamp();
  setTimeout(() => st.remove(), 1900);
  setTimeout(() => openFact(c.id, true), 1500);
}

// ---------------------------------------------------------------- facts
function sketch(c, w = 520, h = 312) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.className = 'fact-sketch';
  const ctx = cv.getContext('2d');
  const s = w / 200;
  ctx.scale(s, s);
  ctx.strokeStyle = 'rgba(29,43,74,.1)';
  ctx.lineWidth = 0.3;
  for (let x = 0; x <= 200; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 120); ctx.stroke(); }
  for (let y = 0; y <= 120; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(200, y); ctx.stroke(); }
  const placed = save.assembled[c.id] || [];
  const q = save.collection[c.id]?.bones || {};
  for (const b of c.bones) {
    if (placed.includes(b.id)) drawBonePlaced(ctx, b, b.x, b.y, b.rot, { outline: 0.6, cracked: q[b.id] === 'c' });
    else drawBonePlaced(ctx, b, b.x, b.y, b.rot, { ghost: true, dashed: true, outline: 0.5, ink: 'rgba(29,43,74,.35)' });
  }
  return cv;
}

function openFact(cid, justDone = false) {
  const c = data.creatureById[cid];
  const placed = (save.assembled[cid] || []).length;
  const found = bonesHave(c);
  const region = data.regionById[c.region];
  const wrap = document.createElement('div');
  if (!placed && !found) {
    wrap.innerHTML = `<h2>An empty plinth</h2><p>Something from <b>${esc(region.name)}</b> will stand here once you've dug it up and rebuilt it.</p><div class="row"><button class="tag" id="f-map"><span>To the map</span></button></div>`;
    wrap.querySelector('#f-map').addEventListener('click', () => go('map'));
    openModal(wrap);
    return;
  }
  const stars = creatureStars(save, c);
  const { quality, complete } = creatureQuality(save, c);
  const card = c.card;
  wrap.innerHTML = `
    ${justDone ? '<p><span class="stamp">Catalogued</span></p>' : ''}
    <h2>${esc(c.name)}</h2>
    <p class="note">Our made-up creature, inspired by the real <b>${esc(c.inspired)}</b>. ${starsLine(stars)}</p>
    <div id="f-sketch"></div>
    <dl class="fact-grid">
      <dt>When</dt><dd>${esc(card.period)}</dd>
      <dt>Where</dt><dd>${esc(card.place)}</dd>
      <dt>Size</dt><dd>${esc(card.size)}</dd>
      <dt>Ate</dt><dd>${esc(card.diet)}</dd>
    </dl>
    <div class="fact-box"><b>Real fact:</b> ${esc(card.fact)}</div>
    ${card.fact2 ? `<div class="fact-box"><b>And:</b> ${esc(card.fact2)}</div>` : ''}
    <p>On display: <b>${placed}/${c.bones.length}</b> bones (${Math.round(complete * 100)}% complete) · quality <b>${quality}</b>${found > placed ? ` · <b>${found - placed}</b> found bone${found - placed > 1 ? 's' : ''} waiting to go on` : ''}</p>
    <p class="note">Stars: ★ for half the skeleton, ★ for all of it, ★ if every bone is pristine.</p>
    <div class="row" id="f-actions"></div>`;
  wrap.querySelector('#f-sketch').append(sketch(c));
  const act = wrap.querySelector('#f-actions');
  if (unplacedCount(cid) > 0) {
    const b = document.createElement('button'); b.className = 'tag tag-rust'; b.innerHTML = '<span>Rebuild</span>';
    b.addEventListener('click', () => openRebuild(cid)); act.append(b);
  }
  const m = document.createElement('button'); m.className = 'tag'; m.innerHTML = `<span>${currentScreen() === 'museum' ? 'Close' : 'See it in the museum'}</span>`;
  m.addEventListener('click', () => { if (currentScreen() === 'museum') closeModal(); else { go('museum'); museumView.scrollTo(cid); } });
  act.append(m);
  openModal(wrap, { wide: true });
}

// ---------------------------------------------------------------- unlocks
function announceUnlocks(before) {
  const after = totalStars(save, data);
  if (after <= before) return;
  const msgs = [];
  for (const r of data.regions) if (r.stars > before && r.stars <= after) msgs.push(`New region open: ${r.name}!`);
  for (const u of data.upgrades) if (u.stars > before && u.stars <= after) msgs.push(`New museum decoration: ${u.name}`);
  msgs.unshift(`★ ${after} visitors!`);
  toast(msgs.join(' · '), 4500);
}

// ---------------------------------------------------------------- modals
function openHelp() {
  const toolsHtml = ['brush', 'chisel', 'pickaxe', 'tap', 'scanner'].map((id) => {
    const t = data.toolById[id];
    return `<svg aria-hidden="true"><use href="#i-${t.id}"/></svg><div><b>${esc(t.name)}</b> (key ${t.key}) · ${t.kind === 'scan' ? 'limited charges' : `${t.cost} energy`}<br>${esc(t.blurb)}</div>`;
  }).join('');
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <h2>Field guide</h2>
    <h3>1. Dig</h3>
    <p>Dig down from the surface: you can only work on rock that touches an open space (it has a light edge). Uncover every square of a bone to lift it out. You have limited <b>energy</b>, so plan your digging!</p>
    <div class="help-tools">${toolsHtml}</div>
    <p>Each region adds a new tool too. Soft rock takes 1 hit; hard rock takes more. Bedrock can't be dug.</p>
    <h3>2. Read the clues</h3>
    <div class="help-clues" id="help-clues"></div>
    <p>Cracked bones still count, but they score less and stop a skeleton getting its third star.</p>
    <h3>3. Rebuild and display</h3>
    <p>Drag bones onto the faint outline and turn them to fit. Finished skeletons go in your museum, and stars bring visitors, new regions and decorations.</p>
    <h3>Keys</h3>
    <p>Tools: number keys or letters (B, C, P, T, S…). Arrow keys + Space dig with the keyboard. Rebuild: R turns, Tab picks a bone, arrows move it, Enter drops it, H for a hint. Esc goes back.</p>
    <div class="row"><button class="tag tag-rust" id="help-ok"><span>Got it!</span></button></div>`;
  const clues = wrap.querySelector('#help-clues');
  const cb = settings.colourblind;
  const add = (draw, text) => { const p = document.createElement('p'); p.append(legendCanvas(draw, 36)); p.append(text); clues.append(p); };
  add((c, s) => { c.fillStyle = '#cf9a5c'; c.fillRect(0, 0, s, s); drawBump(c, 0, 0, s, cellRand('help', 2), cb); }, 'Bumps and pale flecks appear when you dig close to a bone. Watch out: hard lumps (concretions) look bumpy too!');
  add((c, s) => drawTapMark(c, 0, 0, s, 'hollow', cb), 'Tap: hollow means a bone is in that square.');
  add((c, s) => drawTapMark(c, 0, 0, s, 'echo', cb), 'Tap: an echo means a bone is right next door.');
  add((c, s) => drawTapMark(c, 0, 0, s, 'solid', cb), 'Tap: solid means no bone here or next door.');
  add((c, s) => drawScanMark(c, 0, 0, s), 'The scanner pencils in every bone within 2 squares. Save its charges for tricky spots.');
  wrap.querySelector('#help-ok').addEventListener('click', closeModal);
  openModal(wrap, { wide: true });
}

function openSettings() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <h2>Settings</h2>
    <div class="setting"><label for="s-music">Music volume</label><input type="range" id="s-music" min="0" max="1" step="0.05" value="${settings.music}"></div>
    <div class="setting"><label for="s-sfx">Sound effects volume</label><input type="range" id="s-sfx" min="0" max="1" step="0.05" value="${settings.sfx}"></div>
    <div class="setting"><label for="s-cb">Colourblind-friendly clue markers<br><span class="note">Adds shapes and letters to bumps and tap marks</span></label><input type="checkbox" id="s-cb" ${settings.colourblind ? 'checked' : ''}></div>
    <div class="setting"><label for="s-rm">Reduced motion<br><span class="note">No screen shake or flash, fewer particles</span></label><input type="checkbox" id="s-rm" ${settings.reducedMotion ? 'checked' : ''}></div>
    <div class="setting"><span><b>Text size</b></span><span class="seg" role="group" aria-label="Text size">
      <button data-size="m" aria-pressed="${settings.textSize === 'm'}">A</button><button data-size="l" aria-pressed="${settings.textSize === 'l'}" style="font-size:1.15em">A</button><button data-size="xl" aria-pressed="${settings.textSize === 'xl'}" style="font-size:1.3em">A</button></span></div>
    <p class="note">Settings are saved in your account code too.</p>
    <div class="row"><button class="tag tag-rust" id="s-done"><span>Done</span></button></div>`;
  const save2 = () => { storeSettings(settings); applySettings(); };
  wrap.querySelector('#s-music').addEventListener('input', (e) => { settings.music = +e.target.value; unlockAudio(); save2(); setMusic(musicFor()); });
  wrap.querySelector('#s-sfx').addEventListener('input', (e) => { settings.sfx = +e.target.value; save2(); });
  wrap.querySelector('#s-sfx').addEventListener('change', () => { unlockAudio(); sfx.clink(); });
  wrap.querySelector('#s-cb').addEventListener('change', (e) => { settings.colourblind = e.target.checked; save2(); });
  wrap.querySelector('#s-rm').addEventListener('change', (e) => { settings.reducedMotion = e.target.checked; save2(); });
  for (const b of wrap.querySelectorAll('[data-size]')) {
    b.addEventListener('click', () => {
      settings.textSize = b.dataset.size;
      for (const x of wrap.querySelectorAll('[data-size]')) x.setAttribute('aria-pressed', String(x === b));
      save2();
    });
  }
  wrap.querySelector('#s-done').addEventListener('click', closeModal);
  openModal(wrap);
}

function musicFor() {
  const s = currentScreen();
  if (s === 'dig' && dig) return dig.site.regionId;
  if (s === 'museum' || s === 'rebuild') return 'museum';
  return 'menu';
}

function openAccount() {
  const acct = getAccount();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <h2>Account code</h2>
    <p>Your explorer ID: <span class="acct-id">${esc(acct.id)}</span></p>
    <p>Your museum, bones, stars, unlocks and settings are saved in this browser. To carry on somewhere else (another Chromebook, home, a tablet), back them up as an <b>account code</b> and paste it in there. No sign-up, no email.</p>
    <h3>Back up</h3>
    <div class="row" style="margin-top:4px">
      <button class="tag tag-small" id="a-copy"><span>Copy account code</span></button>
      <button class="tag tag-small" id="a-download"><span>Download backup file</span></button>
    </div>
    <p class="note">Your code changes as you play, so back up again after you play to keep your newest progress. Keep it to yourself: anyone with it can load your museum.</p>
    <h3>Load a code</h3>
    <textarea id="a-code" rows="3" placeholder="Paste a code that starts FF1." spellcheck="false" autocomplete="off" aria-label="Account code"></textarea>
    <div class="row" style="margin-top:6px">
      <button class="tag tag-small tag-rust" id="a-import"><span>Load code</span></button>
      <button class="tape small" id="a-file">Load from file…</button>
      <input type="file" id="a-file-input" accept=".txt,text/plain" hidden>
    </div>
    <p class="note">Loading swaps this browser over to that account and reloads the game.</p>
    <p class="status" id="a-status" role="status"></p>`;
  const status = (msg, kind) => { const s = wrap.querySelector('#a-status'); s.textContent = msg; s.className = 'status ' + (kind || ''); };
  wrap.querySelector('#a-copy').addEventListener('click', async () => {
    try {
      const code = await exportCode();
      let ok = false;
      try { await navigator.clipboard.writeText(code); ok = true; } catch { /* clipboard blocked */ }
      if (ok) status('Account code copied. Keep it somewhere safe.', 'ok');
      else { wrap.querySelector('#a-code').value = code; wrap.querySelector('#a-code').select(); status('Copying is blocked here: your code is in the box. Select it and copy it.', 'ok'); }
    } catch (e) { status("Couldn't make an account code: " + e.message, 'err'); }
  });
  wrap.querySelector('#a-download').addEventListener('click', async () => {
    try {
      const code = await exportCode();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([code + '\n'], { type: 'text/plain' }));
      a.download = `fossil-fixers-${acct.id}-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      status('Backup file downloaded.', 'ok');
    } catch (e) { status("Couldn't make a backup file: " + e.message, 'err'); }
  });
  const doImport = async (text) => {
    let obj;
    try { obj = await parseCode(text); } catch (e) { status(e.message || "That code couldn't be read.", 'err'); return; }
    const same = obj.id === acct.id;
    const msg = same
      ? `Restore your museum from this code (saved ${String(obj.saved || '').slice(0, 10)})? What's saved here now will be replaced.`
      : `Switch this browser to explorer ${obj.id}? The museum saved here (${acct.id}) will be replaced. Back it up first if you want to keep it.`;
    if (!window.confirm(msg)) return;
    importAccount(obj);
    status('Loaded! Reloading…', 'ok');
    setTimeout(() => location.reload(), 400);
  };
  wrap.querySelector('#a-import').addEventListener('click', () => doImport(wrap.querySelector('#a-code').value));
  const fileInput = wrap.querySelector('#a-file-input');
  wrap.querySelector('#a-file').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (f.size > 500000) { status('That file is too big to be a backup.', 'err'); return; }
    doImport(await f.text());
  });
  openModal(wrap);
}

function openCurator() {
  const stars = totalStars(save, data);
  const kinds = [['lighting', 'Lighting'], ['plaque', 'Plaques'], ['banner', 'Banners'], ['floor', 'Floor']];
  const wrap = document.createElement('div');
  wrap.innerHTML = `<h2>Decorate the museum</h2><p>You have <b>★ ${stars}</b> visitors (of ${maxStars(data)}). More visitors unlock more decorations. Nothing gets used up.</p>` +
    kinds.map(([k, label]) => `<h3>${label}</h3><div class="upgrade-grid">${data.upgrades.filter((u) => u.kind === k).map((u) => `<button class="upgrade" data-up="${u.id}" data-kind="${k}" aria-pressed="${save.upgrades[k] === u.id}" ${stars >= u.stars ? '' : 'disabled'}>${esc(u.name)}<small>${stars >= u.stars ? (save.upgrades[k] === u.id ? 'In use' : 'Tap to use') : `Needs ★${u.stars}`}</small></button>`).join('')}</div>`).join('') +
    '<div class="row"><button class="tag tag-rust" id="c-done"><span>Done</span></button></div>';
  for (const b of wrap.querySelectorAll('.upgrade')) {
    b.addEventListener('click', () => {
      save.upgrades[b.dataset.kind] = b.dataset.up;
      persist();
      sfx.click();
      for (const x of wrap.querySelectorAll(`.upgrade[data-kind="${b.dataset.kind}"]`)) {
        const on = x === b;
        x.setAttribute('aria-pressed', String(on));
        if (!x.disabled) x.querySelector('small').textContent = on ? 'In use' : 'Tap to use';
      }
    });
  }
  wrap.querySelector('#c-done').addEventListener('click', closeModal);
  openModal(wrap, { wide: true });
}

function openDaily() {
  const day = utcDay();
  const site = buildDaily(data, day);
  const region = data.regionById[site.regionId];
  const best = save.daily.best[day];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <h2>Daily Dig</h2>
    <p><span class="stamp navy">${esc(day)}</span></p>
    <p>Everyone gets the same dig site today, somewhere in the <b>${esc(region.name)}</b>. All of that region's tools are in your roll.</p>
    <p>Curator's mark to beat: <b>${site.par}</b></p>
    <p>Your best today: <b>${best ?? 'not played yet'}</b> · Daily streak: <b>${save.daily.streak}</b></p>
    <p class="note">A new site appears every day at midnight (UTC). Play as many times as you like: your best score counts.</p>
    <div class="row"><button class="tag tag-rust" id="d-go"><span>Start the Daily Dig</span></button></div>`;
  wrap.querySelector('#d-go').addEventListener('click', () => startDig('daily'));
  openModal(wrap);
}

// ---------------------------------------------------------------- wiring
function wire() {
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
  $('nickname').addEventListener('input', (e) => {
    const clean = cleanName(e.target.value);
    if (clean !== e.target.value) e.target.value = clean;
    save.name = clean;
    persist();
  });
  $('btn-play').addEventListener('click', () => { sfx.page(); go('map'); });
  $('btn-daily').addEventListener('click', () => { sfx.page(); openDaily(); });
  $('btn-museum').addEventListener('click', () => { sfx.page(); go('museum'); });
  $('btn-help').addEventListener('click', openHelp);
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-account').addEventListener('click', openAccount);
  for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => { sfx.page(); go(b.dataset.go); });
  $('btn-packup').addEventListener('click', () => {
    if (!dig || digView.ended) return;
    if (window.confirm('Pack up and finish this dig? Bones you have found so far are kept.')) digView.packUp();
  });
  $('btn-dig-help').addEventListener('click', openHelp);
  $('btn-rebuild-back').addEventListener('click', () => go('map'));
  $('btn-rotate').addEventListener('click', () => rebuildView.rotate(1));
  $('btn-hint').addEventListener('click', () => rebuildView.hint());
  $('btn-rebuild-done').addEventListener('click', () => { go('museum'); if (rebuildCreature) museumView.scrollTo(rebuildCreature.id); });
  $('btn-curator').addEventListener('click', openCurator);
  $('museum-left').addEventListener('click', () => museumView.nudge(-1));
  $('museum-right').addEventListener('click', () => museumView.nudge(1));
  $('modal-x').addEventListener('click', closeModal);
  $('modal-back').addEventListener('click', (e) => { if (e.target === $('modal-back')) closeModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (modalOpen()) { if (e.key === 'Escape') closeModal(); return; }
    const s = currentScreen();
    if (e.key === 'Escape') {
      if (s === 'dig') $('btn-packup').click();
      else if (s !== 'cover') go(s === 'rebuild' ? 'map' : 'cover');
      return;
    }
    let used = false;
    if (s === 'dig') used = digView.onKey(e);
    else if (s === 'rebuild') used = rebuildView.onKey(e);
    else if (s === 'museum') {
      if (e.key === 'ArrowLeft') { museumView.nudge(-0.5); used = true; }
      if (e.key === 'ArrowRight') { museumView.nudge(0.5); used = true; }
    }
    if (used) e.preventDefault();
  });
  window.addEventListener('storage', (e) => { if (e.key === 'fossil-fixers-save') save = loadSave(); });
}

// Test hooks (used by the automated tests; harmless if someone finds them).
window.__ff = {
  get data() { return data; },
  get save() { return save; },
  get dig() { return dig; },
  screen: () => currentScreen(),
  startDig,
  openRebuild,
  /** Dig the current site perfectly, one tool use at a time, through the real game code. */
  autoDig() {
    const res = solve(dig.site, ['brush', 'chisel', 'pickaxe'].map((id) => data.toolById[id]), data.rocks);
    for (const m of res.moves) {
      if (digView.ended) break;
      digView.selectTool(m.tool);
      digView.act(m.i);
    }
    return { moves: res.moves.length, energyLeft: dig.site.energy, found: dig.site.bones.filter((b) => b.found).length, cracked: dig.site.bones.filter((b) => b.cracked).length };
  },
  rebuildState: () => rebuildView.state,
  dropAllPieces() {
    for (const p of [...rebuildView.state.pieces]) {
      if (p.placed) continue;
      const b = rebuildCreature.bones.find((x) => x.id === p.boneId);
      p.x = b.x; p.y = b.y; p.rot = b.rot; p.moved = true;
      rebuildView.tryDrop(p);
    }
  },
};

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<p class="noscript" style="position:fixed;top:0;left:0;right:0;background:#f2e8cf">Sorry, Fossil Fixers couldn't start: ${esc(e.message)}. Try reloading the page.</p>`);
});
