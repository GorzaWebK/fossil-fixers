// The dig screen: draws the rock grid, takes mouse / touch / keyboard input,
// runs tools through dig.js and keeps the clipboard and tool roll up to date.

import { useTool, isWorkable, showsBump, patternCells, around, colOf, rowOf, allFound, canStillDig, bonesLeft } from './dig.js';
import { drawRockCell, drawBump, drawTapMark, drawScanMark, drawSkyline, cellRand, legendCanvas, shade, INK, RUST } from './art.js';
import { drawBoneInBox, drawBoneLocal, boneExtent } from './bones.js';
import { Particles } from './fx.js';
import { sfx } from './audio.js';

const SKY = 1.5; // rows of sky above the rock

export class DigView {
  constructor({ canvas, wrap, data, hud, onEnd }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrap = wrap;
    this.data = data;
    this.hud = hud;
    this.onEnd = onEnd;
    this.fx = new Particles();
    this.layer = document.createElement('canvas');
    this.layerDirty = true;
    this.hover = -1;
    this.cursor = -1;
    this.flyers = [];
    this.flashes = [];
    this.shake = 0;
    this.running = false;
    this.ended = false;
    this.settings = { colourblind: false, reducedMotion: false };

    canvas.addEventListener('pointerdown', (e) => this.onPointer(e, true));
    canvas.addEventListener('pointermove', (e) => this.onPointer(e, false));
    canvas.addEventListener('pointerleave', () => { this.hover = -1; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => this.resize()).observe(wrap);
  }

  start(site, settings) {
    this.site = site;
    this.region = this.data.regionById[site.regionId];
    this.tools = site.tools.map((id) => this.data.toolById[id]);
    this.tool = this.tools[0];
    this.settings = settings;
    this.fx.reduced = settings.reducedMotion;
    this.ended = false;
    this.flyers = [];
    this.flashes = [];
    this.fx.list = [];
    this.hover = -1;
    this.cursor = -1;
    this.layerDirty = true;
    this.buildToolRoll();
    this.buildLegend();
    this.updateHud();
    this.resize();
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  stop() { this.running = false; }

  setSettings(settings) {
    this.settings = settings;
    this.fx.reduced = settings.reducedMotion;
    this.layerDirty = true;
    if (this.site) this.buildLegend();
  }

  // ------------------------------------------------------------- layout
  resize() {
    if (!this.site) return;
    const r = this.wrap.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const { cols, rows } = this.site;
    const cell = Math.max(14, Math.floor(Math.min(r.width / cols, r.height / (rows + SKY))));
    this.cell = cell;
    this.w = cell * cols;
    this.h = Math.round(cell * (rows + SKY));
    this.top = Math.round(cell * SKY);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    for (const c of [this.canvas, this.layer]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
    }
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.layerDirty = true;
  }

  cellAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top - this.top;
    if (x < 0 || y < 0) return -1;
    const c = Math.floor(x / this.cell);
    const rr = Math.floor(y / this.cell);
    if (c >= this.site.cols || rr >= this.site.rows) return -1;
    return rr * this.site.cols + c;
  }

  cellXY(i) {
    return [colOf(this.site, i) * this.cell, this.top + rowOf(this.site, i) * this.cell];
  }

  // ------------------------------------------------------------- input
  onPointer(e, down) {
    if (!this.site || this.ended) return;
    const i = this.cellAt(e.clientX, e.clientY);
    this.hover = e.pointerType === 'mouse' ? i : -1;
    if (down && i >= 0) {
      e.preventDefault();
      this.cursor = -1;
      this.act(i);
    }
  }

  /** Keyboard: arrows move a cursor, Space/Enter uses the tool, number keys / letters pick tools. */
  onKey(e) {
    if (!this.site || this.ended) return false;
    const k = e.key;
    const tool = this.tools.find((t) => t.key === k || t.letter.toLowerCase() === k.toLowerCase());
    if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) { this.selectTool(tool.id); return true; }
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[k]) {
      if (this.cursor < 0) this.cursor = Math.floor(this.site.cols / 2);
      const c = Math.max(0, Math.min(this.site.cols - 1, colOf(this.site, this.cursor) + moves[k][0]));
      const r = Math.max(0, Math.min(this.site.rows - 1, rowOf(this.site, this.cursor) + moves[k][1]));
      this.cursor = r * this.site.cols + c;
      return true;
    }
    if ((k === ' ' || k === 'Enter') && this.cursor >= 0) { this.act(this.cursor); return true; }
    return false;
  }

  selectTool(id) {
    const t = this.tools.find((x) => x.id === id);
    if (!t) return;
    this.tool = t;
    sfx.click();
    for (const b of this.hud.toolroll.querySelectorAll('.pocket')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
  }

  // ------------------------------------------------------------- acting
  act(i) {
    const site = this.site;
    const tool = this.tool;
    const before = site.energy;
    const ev = useTool(site, tool, this.data.rocks, i);
    if (!ev.ok) {
      sfx.deny();
      this.toast(ev.reason);
      return;
    }
    const [x, y] = this.cellXY(i);
    const s = this.cell;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const rockCol = (n) => this.data.rocks[site.cells[n].rock]?.color || '#c9a46c';

    if (tool.kind === 'tap') {
      ({ hollow: sfx.tapHollow, echo: sfx.tapEcho, solid: sfx.tapSolid })[ev.tap]();
      this.toast({ hollow: 'Hollow! There is bone right here.', echo: 'A faint echo: bone is next door.', solid: 'Solid. Nothing here or next door.' }[ev.tap]);
      this.fx.ring(cx, cy, s * 0.8, ev.tap === 'hollow' ? 'rgba(194,90,28,0.9)' : 'rgba(29,43,74,0.6)');
    } else if (tool.kind === 'scan') {
      sfx.scan();
      this.fx.ring(cx, cy, s * 3, 'rgba(119,120,63,0.9)');
      this.flashes.push({ cells: around(site, i, 2), t: 0, max: 0.8, color: 'rgba(119,120,63,0.25)' });
      this.toast(ev.scanned.length ? `The scanner found bone in ${ev.scanned.length} square${ev.scanned.length > 1 ? 's' : ''}.` : 'No bones within 2 squares.');
    } else if (tool.kind === 'probe') {
      sfx.probe();
      const col = ev.probeCol;
      const cells = [];
      for (let r = 0; r < site.rows; r++) cells.push(r * site.cols + col);
      this.flashes.push({ cells, t: 0, max: 0.7, color: 'rgba(194,90,28,0.18)' });
      this.toast(ev.probe >= 0 ? `The probe rod hit bone ${rowOf(site, ev.probe) + 1} squares down.` : 'The probe rod found nothing in this column.');
    } else {
      ({ brush: sfx.brush, pickaxe: sfx.pickaxe }[tool.id] || sfx.chisel)();
      if (ev.opened.length) sfx.crumble();
      for (const n of ev.damaged) {
        const [nx, ny] = this.cellXY(n);
        this.fx.dust(nx + s / 2, ny + s / 2, 'rgba(226,196,138,0.75)', tool.id === 'brush' ? 4 : 6, s * 0.18);
        if (site.cells[n].hp <= 0 || tool.id !== 'brush') this.fx.chunks(nx + s / 2, ny + s / 2, rockCol(n), site.cells[n].hp <= 0 ? 6 : 3, s * 0.12);
      }
      if (tool.id === 'pickaxe' && !this.settings.reducedMotion) this.shake = 0.18;
      if (ev.cracked.length) {
        sfx.crack();
        this.flashes.push({ cells: around(site, i, tool.cracks === 'area' ? 1 : 0), t: 0, max: 0.6, color: 'rgba(194,90,28,0.45)' });
        this.toast(tool.cracks === 'area' ? 'Crack! The pickaxe hit a bone nearby. It still counts, but it scores less.' : 'Crack! Too much force: there was only a little rock left on that bone.');
      }
      for (const bi of ev.found) this.boneFound(bi);
      const conc = ev.opened.filter((n) => site.cells[n].concretion);
      if (conc.length && !ev.found.length) this.toast('Just a hard lump of rock (a concretion). No bone.');
    }
    if (before !== site.energy || tool.kind !== 'dig') this.layerDirty = true;
    this.layerDirty = true;
    this.updateHud();
    this.checkEnd();
  }

  boneFound(bi) {
    const b = this.site.bones[bi];
    sfx.clink();
    const s = this.cell;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ci of b.cells) {
      const [x, y] = this.cellXY(ci);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + s); y1 = Math.max(y1, y + s);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    this.fx.sparkle(cx, cy, 12);
    this.flyers.push({ bone: b.bone, cracked: b.cracked, x: cx, y: cy, w: x1 - x0, h: y1 - y0, t: 0, max: this.settings.reducedMotion ? 0.8 : 1.3 });
    const name = this.boneLabel(b);
    this.toast(b.cracked ? `Found the ${name}, but it's cracked.` : `Found the ${name}! Perfect condition.`);
  }

  boneLabel(b) {
    const c = this.data.creatureById[b.creatureId];
    const multi = new Set(this.site.bones.map((x) => x.creatureId)).size > 1;
    return multi ? `${c.name} ${b.bone.name.toLowerCase()}` : b.bone.name.toLowerCase();
  }

  checkEnd() {
    const site = this.site;
    if (allFound(site)) {
      this.ended = true;
      sfx.fanfare();
      setTimeout(() => this.onEnd('all'), this.settings.reducedMotion ? 700 : 1500);
    } else if (!canStillDig(site, this.tools)) {
      this.ended = true;
      this.toast('Out of energy! Time to pack up.');
      setTimeout(() => this.onEnd('energy'), 1400);
    }
  }

  packUp() {
    if (!this.site || this.ended) return;
    this.ended = true;
    this.onEnd('packed');
  }

  toast(msg) {
    const el = this.hud.toast;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ------------------------------------------------------------- HUD
  buildToolRoll() {
    const roll = this.hud.toolroll;
    roll.innerHTML = '';
    const newTool = this.region.gadget;
    for (const t of this.tools) {
      const b = document.createElement('button');
      b.className = 'pocket' + (t.id === newTool ? ' new' : '');
      b.dataset.tool = t.id;
      b.setAttribute('aria-pressed', String(t === this.tool));
      b.title = `${t.name} (${t.key} or ${t.letter}): ${t.blurb}`;
      const cost = t.kind === 'scan' || t.kind === 'probe' ? 'charges' : `${t.cost} energy`;
      b.innerHTML = `<span class="key">${t.key}</span><svg aria-hidden="true"><use href="#i-${t.id}"/></svg><span class="pocket-name">${t.name}</span><span class="pocket-cost">${cost}</span>`;
      b.addEventListener('click', () => this.selectTool(t.id));
      roll.append(b);
    }
  }

  buildLegend() {
    const L = this.hud.legend;
    L.innerHTML = '';
    const cb = this.settings.colourblind;
    const items = [
      [(c, s) => { c.fillStyle = '#cf9a5c'; c.fillRect(0, 0, s, s); drawBump(c, 0, 0, s, cellRand('legend', 1), cb); }, 'Bumps: maybe bone (or a lump)'],
      [(c, s) => drawTapMark(c, 0, 0, s, 'hollow', cb), 'Tap: hollow = bone here'],
      [(c, s) => drawTapMark(c, 0, 0, s, 'echo', cb), 'Tap: echo = bone next door'],
      [(c, s) => drawTapMark(c, 0, 0, s, 'solid', cb), 'Tap: solid = nothing'],
      [(c, s) => drawScanMark(c, 0, 0, s), 'Scanner: bone here'],
    ];
    for (const [draw, text] of items) {
      L.append(legendCanvas(draw, 40));
      const sp = document.createElement('span');
      sp.textContent = text;
      L.append(sp);
    }
  }

  updateHud() {
    const site = this.site;
    const h = this.hud;
    h.site.textContent = this.siteName || 'Dig site';
    h.energyNum.textContent = `${Math.floor(site.energy)} / ${site.maxEnergy}`;
    const pct = (site.energy / site.maxEnergy) * 100;
    h.energyFill.style.width = pct + '%';
    h.energyFill.classList.toggle('low', pct < 20);
    // charges
    const ch = [];
    if (this.tools.some((t) => t.id === 'scanner')) ch.push(['Scanner', site.charges.scanner, this.scannerMax ?? site.charges.scanner]);
    if (this.tools.some((t) => t.id === 'probe')) ch.push(['Probe rod', site.charges.probe, 3]);
    this.scannerMax = Math.max(this.scannerMax || 0, site.charges.scanner);
    h.charges.innerHTML = ch.map(([n, left, max]) => `<div>${n}<span class="pips">${Array.from({ length: Math.max(left, max) }, (_, k) => `<i class="pip${k < left ? '' : ' used'}"></i>`).join('')}</span></div>`).join('');
    const found = site.bones.filter((b) => b.found).length;
    h.bonesCount.textContent = `${found}/${site.bones.length}`;
    h.boneList.innerHTML = '';
    for (const b of site.bones) {
      const li = document.createElement('li');
      li.className = b.found ? (b.cracked ? 'found cracked' : 'found') : 'hidden';
      li.textContent = this.boneLabel(b);
      h.boneList.append(li);
    }
    for (const p of h.toolroll.querySelectorAll('.pocket')) {
      const t = this.data.toolById[p.dataset.tool];
      let ok = true;
      if (t.kind === 'scan') ok = site.charges.scanner > 0;
      else if (t.kind === 'probe') ok = site.charges.probe > 0;
      else ok = site.energy >= t.cost;
      p.disabled = !ok;
    }
  }

  // ------------------------------------------------------------- drawing
  drawLayer() {
    const site = this.site;
    const ctx = this.layer.getContext('2d');
    const s = this.cell;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    drawSkyline(ctx, 0, 0, this.w, this.top, this.region.id, this.region.accent);
    const cb = this.settings.colourblind;

    // rock and holes
    for (let i = 0; i < site.cells.length; i++) {
      const cell = site.cells[i];
      const [x, y] = this.cellXY(i);
      const rnd = cellRand(site.seed, i);
      if (cell.hp > 0) {
        const rock = this.data.rocks[cell.rock];
        const dmg = Number.isFinite(cell.maxHp) ? 1 - cell.hp / cell.maxHp : 0;
        drawRockCell(ctx, x, y, s, rock, rnd, dmg);
        if (showsBump(site, i)) drawBump(ctx, x, y, s, rnd, cb);
      } else {
        // a dug-out hole: a shadowy hollow
        const g = ctx.createLinearGradient(0, y, 0, y + s);
        g.addColorStop(0, '#3b2a1c');
        g.addColorStop(1, '#5a4330');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, s + 0.5, s + 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        if (rowOf(site, i) > 0 && site.cells[i - site.cols].hp > 0) ctx.fillRect(x, y, s, s * 0.18);
      }
    }
    // uncovered parts of bones not yet free
    for (const b of site.bones) {
      if (b.found) continue;
      const open = b.cells.filter((ci) => site.cells[ci].hp <= 0);
      if (!open.length) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const ci of b.cells) {
        const [x, y] = this.cellXY(ci);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + s); y1 = Math.max(y1, y + s);
      }
      ctx.save();
      ctx.beginPath();
      for (const ci of open) { const [x, y] = this.cellXY(ci); ctx.rect(x, y, s, s); }
      ctx.clip();
      drawBoneInBox(ctx, b.bone, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, { cracked: b.cracked, outline: Math.max(1, s / 22) });
      ctx.restore();
    }
    // layer boundaries: ink lines where the rock type changes
    ctx.strokeStyle = 'rgba(29,43,74,0.55)';
    ctx.lineWidth = Math.max(1, s / 20);
    ctx.beginPath();
    for (let i = 0; i < site.cells.length; i++) {
      const cell = site.cells[i];
      if (cell.hp <= 0) continue;
      const [x, y] = this.cellXY(i);
      const c = colOf(site, i), r = rowOf(site, i);
      if (c < site.cols - 1) { const n = site.cells[i + 1]; if (n.hp > 0 && n.rock !== cell.rock) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); } }
      if (r < site.rows - 1) { const n = site.cells[i + site.cols]; if (n.hp > 0 && n.rock !== cell.rock) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); } }
    }
    ctx.stroke();
    // faint grid, and a light edge on the cells you can work right now
    ctx.strokeStyle = 'rgba(29,43,74,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= site.cols; c++) { ctx.moveTo(c * s + 0.5, this.top); ctx.lineTo(c * s + 0.5, this.h); }
    for (let r = 0; r <= site.rows; r++) { ctx.moveTo(0, this.top + r * s + 0.5); ctx.lineTo(this.w, this.top + r * s + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,235,0.55)';
    ctx.lineWidth = Math.max(1.5, s / 16);
    for (let i = 0; i < site.cells.length; i++) {
      if (!isWorkable(site, i) || !Number.isFinite(site.cells[i].hp)) continue;
      const [x, y] = this.cellXY(i);
      ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
    }
    // marks on top
    for (let i = 0; i < site.cells.length; i++) {
      const cell = site.cells[i];
      if (cell.hp <= 0) continue;
      const [x, y] = this.cellXY(i);
      if (cell.scanned || cell.probed) drawScanMark(ctx, x, y, s, cell.probed && !cell.scanned);
      if (cell.tap) drawTapMark(ctx, x, y, s, cell.tap, cb);
    }
    // frame
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.w - 2, this.h - 2);
    this.layerDirty = false;
  }

  frame(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.site && this.cell) {
      if (this.layerDirty) this.drawLayer();
      this.draw(dt);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  draw(dt) {
    const ctx = this.ctx;
    const s = this.cell;
    const site = this.site;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    if (this.shake > 0) {
      this.shake -= dt;
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    ctx.drawImage(this.layer, 0, 0, this.w, this.h);

    // flashes (scan area, crack zone)
    for (const f of this.flashes) {
      f.t += dt;
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.max);
      for (const ci of f.cells) { const [x, y] = this.cellXY(ci); ctx.fillRect(x, y, s, s); }
      ctx.globalAlpha = 1;
    }
    this.flashes = this.flashes.filter((f) => f.t < f.max);

    // tool preview under the mouse / keyboard cursor
    const at = this.cursor >= 0 ? this.cursor : this.hover;
    if (at >= 0 && !this.ended) {
      const tool = this.tool;
      let cells = [at];
      if (tool.kind === 'dig') cells = patternCells(site, tool, at);
      else if (tool.kind === 'scan') cells = around(site, at, 2);
      else if (tool.kind === 'probe') { cells = []; for (let r = 0; r < site.rows; r++) cells.push(r * site.cols + colOf(site, at)); }
      const usable = tool.kind === 'scan' || tool.kind === 'probe' || isWorkable(site, at);
      if (tool.cracks === 'area' && usable) {
        ctx.fillStyle = 'rgba(194,90,28,0.14)';
        for (const ci of around(site, at, 1)) { const [x, y] = this.cellXY(ci); ctx.fillRect(x, y, s, s); }
      }
      ctx.strokeStyle = usable ? RUST : 'rgba(29,43,74,0.6)';
      ctx.lineWidth = Math.max(2, s / 12);
      ctx.setLineDash(usable ? [] : [4, 4]);
      for (const ci of cells) { const [x, y] = this.cellXY(ci); ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3); }
      ctx.setLineDash([]);
      if (this.cursor >= 0) {
        const [x, y] = this.cellXY(at);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(x - 2, y - 2, s + 4, s + 4);
        ctx.setLineDash([]);
      }
    }

    this.fx.update(dt);
    this.fx.draw(ctx);

    // bones popping out and flying to the clipboard
    for (const f of this.flyers) {
      f.t += dt;
      const k = f.t / f.max;
      const lift = Math.min(1, k * 3);
      const fly = Math.max(0, (k - 0.45) / 0.55);
      const ease = fly * fly * (3 - 2 * fly);
      const tx = this.w - s, ty = s * 0.6;
      const x = f.x + (tx - f.x) * ease;
      const y = f.y - lift * s * 0.6 + (ty - f.y) * ease;
      const scale = (1 + 0.35 * Math.sin(lift * Math.PI / 2)) * (1 - ease * 0.6);
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, (k - 0.85) / 0.15);
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(255,248,225,0.7)';
      ctx.beginPath(); ctx.arc(0, 0, Math.max(f.w, f.h) * 0.55 * scale, 0, Math.PI * 2); ctx.fill();
      drawBoneInBox(ctx, f.bone, 0, 0, f.w * scale, f.h * scale, { cracked: f.cracked, outline: Math.max(1, s / 20) });
      ctx.restore();
    }
    this.flyers = this.flyers.filter((f) => f.t < f.max);
    ctx.restore();
  }
}

export { bonesLeft, boneExtent, drawBoneLocal, shade };
