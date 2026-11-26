// The museum hall: a long gallery you scroll along, one plinth per creature,
// grouped into a wing per region. Stars bring in visitors (little ink
// sketches who wander about). Upgrades change the lights, plaques, banners and floor.

import { drawBonePlaced, INK } from './bones.js';
import { creatureStars } from './save.js';

const RUST = '#c25a1c';
const OLIVE = '#77783f';

export class MuseumView {
  constructor({ canvas, wrap, onOpen }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrap = wrap;
    this.onOpen = onOpen;
    this.scroll = 0;
    this.vel = 0;
    this.visitors = [];
    this.running = false;
    this.drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, start: this.scroll, moved: 0, id: e.pointerId, t: performance.now() };
      this.vel = 0;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(dx));
      const prev = this.scroll;
      this.scroll = this.clamp(this.drag.start - dx);
      const now = performance.now();
      this.vel = (this.scroll - prev) / Math.max(0.008, (now - this.drag.t) / 1000);
      this.drag.t = now;
    });
    const up = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      if (this.drag.moved < 6) this.click(e);
      if (this.reduced) this.vel = 0;
      this.drag = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.scroll = this.clamp(this.scroll + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(wrap);
  }

  show(data, save, settings) {
    this.data = data;
    this.save = save;
    this.reduced = settings.reducedMotion;
    this.resize();
    this.makeVisitors();
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  stop() { this.running = false; }

  resize() {
    if (!this.data) return;
    const r = this.wrap.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cw = r.width;
    this.ch = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.u = Math.min(r.height / 100, r.width / 80);
    this.layout();
    this.scroll = this.clamp(this.scroll);
  }

  layout() {
    const u = this.u;
    this.items = [];
    let x = 30 * u;
    for (const region of this.data.regions) {
      this.items.push({ kind: 'sign', region, x, w: 36 * u });
      x += 36 * u;
      for (const cid of region.creatures) {
        this.items.push({ kind: 'exhibit', creature: this.data.creatureById[cid], region, x, w: 74 * u });
        x += 74 * u;
      }
      x += 10 * u;
    }
    this.hallW = x + 30 * u;
  }

  clamp(s) { return Math.max(0, Math.min(Math.max(0, (this.hallW || 0) - this.cw), s)); }

  nudge(dir) { this.scroll = this.clamp(this.scroll + dir * this.cw * 0.6); }

  scrollTo(creatureId) {
    const it = this.items?.find((i) => i.creature?.id === creatureId);
    if (it) this.scroll = this.clamp(it.x + it.w / 2 - this.cw / 2);
  }

  click(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left + this.scroll;
    const y = e.clientY - r.top;
    const it = this.items.find((i) => i.kind === 'exhibit' && x >= i.x && x <= i.x + i.w);
    if (it && y > this.ch * 0.1) this.onOpen(it.creature.id);
  }

  makeVisitors() {
    const stars = this.data.creatures.reduce((s, c) => s + creatureStars(this.save, c), 0);
    const n = Math.min(36, stars);
    const shirts = [RUST, OLIVE, '#3b5f7a', '#a9834d', '#8e3f12', '#5d7d8a'];
    this.visitors = [];
    for (let i = 0; i < n; i++) {
      this.visitors.push({
        x: Math.random() * (this.hallW || 1000),
        dir: Math.random() < 0.5 ? -1 : 1,
        speed: 8 + Math.random() * 14,
        size: 0.75 + Math.random() * 0.45,
        shirt: shirts[i % shirts.length],
        pause: Math.random() * 3,
        lane: Math.random(),
        phase: Math.random() * 6,
        hat: Math.random() < 0.25,
      });
    }
  }

  frame(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (!this.drag && Math.abs(this.vel) > 5) {
      this.scroll = this.clamp(this.scroll + this.vel * dt);
      this.vel *= 1 - 4 * dt;
    }
    if (this.u) this.draw(dt);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  draw(dt) {
    const ctx = this.ctx;
    const u = this.u;
    const W = this.cw, H = this.ch;
    const up = this.save.upgrades;
    const floorY = H * 0.68;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // wall
    ctx.fillStyle = '#e9dcbd';
    ctx.fillRect(0, 0, W, floorY);
    ctx.save();
    ctx.translate(-this.scroll, 0);
    const x0 = Math.floor(this.scroll / (12 * u)) * 12 * u;
    ctx.strokeStyle = 'rgba(169,131,77,0.25)';
    ctx.lineWidth = 1;
    for (let x = x0; x < this.scroll + W + 12 * u; x += 12 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, floorY); ctx.stroke(); }
    // wainscot
    ctx.fillStyle = '#8a8a52';
    ctx.fillRect(this.scroll - 10, floorY - 9 * u, W + 20, 9 * u);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(this.scroll - 10, floorY - 9 * u); ctx.lineTo(this.scroll + W + 10, floorY - 9 * u); ctx.stroke();
    // ceiling beam
    ctx.fillStyle = '#6e4428';
    ctx.fillRect(this.scroll - 10, 0, W + 20, 4 * u);

    this.drawLighting(ctx, up.lighting, floorY);
    this.drawBanners(ctx, up.banner, floorY);
    ctx.restore();

    // floor
    this.drawFloor(ctx, up.floor, floorY, W, H);

    ctx.save();
    ctx.translate(-this.scroll, 0);
    for (const it of this.items) {
      if (it.x + it.w < this.scroll - 20 || it.x > this.scroll + W + 20) continue;
      if (it.kind === 'sign') this.drawSign(ctx, it, floorY);
      else this.drawExhibit(ctx, it, floorY, up.plaque);
    }
    this.drawVisitors(ctx, dt, floorY, H);
    ctx.restore();

    if (!this.visitors.length) {
      ctx.fillStyle = 'rgba(242,232,207,0.92)';
      const msg = 'No visitors yet: put a skeleton on display to bring them in!';
      ctx.font = `700 ${Math.max(14, 3.4 * u)}px 'Kalam', cursive`;
      const w = ctx.measureText(msg).width + 24;
      ctx.fillRect(W / 2 - w / 2, H - 9 * u, w, 6 * u);
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, W / 2, H - 6 * u);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  drawLighting(ctx, kind, floorY) {
    const u = this.u;
    for (const it of this.items) {
      if (it.kind !== 'exhibit') continue;
      const cx = it.x + it.w / 2;
      if (it.x + it.w < this.scroll - 50 || it.x > this.scroll + this.cw + 50) continue;
      if (kind === 'light-spots') {
        const g = ctx.createLinearGradient(0, 4 * u, 0, floorY);
        g.addColorStop(0, 'rgba(255,236,180,0.55)');
        g.addColorStop(1, 'rgba(255,236,180,0.05)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx - 3 * u, 5 * u); ctx.lineTo(cx + 3 * u, 5 * u); ctx.lineTo(cx + 30 * u, floorY + 6 * u); ctx.lineTo(cx - 30 * u, floorY + 6 * u); ctx.fill();
        ctx.fillStyle = '#b08a3e'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cx - 3 * u, 4 * u); ctx.lineTo(cx + 3 * u, 4 * u); ctx.lineTo(cx + 2 * u, 8 * u); ctx.lineTo(cx - 2 * u, 8 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (kind === 'light-skylight') {
        ctx.fillStyle = 'rgba(255,248,215,0.35)';
        ctx.beginPath(); ctx.moveTo(cx - 14 * u, 4 * u); ctx.lineTo(cx + 2 * u, 4 * u); ctx.lineTo(cx + 26 * u, floorY); ctx.lineTo(cx + 6 * u, floorY); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(cx - 14 * u, 0, 16 * u, 4 * u);
        ctx.fillStyle = '#bcd0d6'; ctx.fillRect(cx - 13.5 * u, 0.5, 15 * u, 3.5 * u);
      } else if (kind === 'light-lanterns') {
        for (const dx of [-24, 24]) {
          const lx = cx + dx * u, ly = 14 * u;
          const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 16 * u);
          g.addColorStop(0, 'rgba(255,200,120,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 16 * u, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, 4 * u); ctx.lineTo(lx, ly - 4 * u); ctx.stroke();
          ctx.fillStyle = dx < 0 ? RUST : '#d9a03c'; ctx.beginPath(); ctx.ellipse(lx, ly, 3 * u, 4 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(lx - 3 * u, ly); ctx.lineTo(lx + 3 * u, ly); ctx.stroke();
        }
      } else {
        // oil lamps on the wall
        for (const dx of [-33, 33]) {
          const lx = cx + dx * u, ly = floorY - 32 * u;
          const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 12 * u);
          g.addColorStop(0, 'rgba(255,214,140,0.5)'); g.addColorStop(1, 'rgba(255,214,140,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 12 * u, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.fillStyle = '#b08a3e';
          ctx.beginPath(); ctx.moveTo(lx - 1.6 * u, ly + 3 * u); ctx.lineTo(lx + 1.6 * u, ly + 3 * u); ctx.lineTo(lx + 1 * u, ly + 6 * u); ctx.lineTo(lx - 1 * u, ly + 6 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,240,200,0.8)'; ctx.beginPath(); ctx.ellipse(lx, ly, 1.5 * u, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  drawBanners(ctx, kind, floorY) {
    const u = this.u;
    if (kind === 'banner-bunting') {
      const colors = [RUST, OLIVE, '#3b5f7a', '#d9a03c'];
      const step = 8 * u;
      const s0 = Math.floor(this.scroll / step) * step;
      ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = s0 - step; x < this.scroll + this.cw + step; x += step) {
        const y = 8 * u + Math.sin(x / (40 * u) * Math.PI) * 2 * u;
        x === s0 - step ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      let k = Math.floor(s0 / step);
      for (let x = s0 - step; x < this.scroll + this.cw + step; x += step, k++) {
        const y = 8 * u + Math.sin(x / (40 * u) * Math.PI) * 2 * u;
        ctx.fillStyle = colors[((k % 4) + 4) % 4];
        ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + step - 1, y); ctx.lineTo(x + step / 2, y + 5 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (kind === 'banner-region' || kind === 'banner-tapestry') {
      for (const it of this.items) {
        if (it.kind !== 'sign' && kind === 'banner-region') continue;
        if (it.kind !== 'exhibit' && kind === 'banner-tapestry') continue;
        if (kind === 'banner-region') {
          for (const dx of [6, 24]) {
            const bx = it.x + dx * u, by = 5 * u, bw = 9 * u, bh = 30 * u;
            ctx.fillStyle = it.region.accent; ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw / 2, by + bh - 4 * u); ctx.lineTo(bx, by + bh); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = 'rgba(242,232,207,0.7)'; ctx.beginPath(); ctx.arc(bx + bw / 2, by + 11 * u, 2.5 * u, 0, Math.PI * 2); ctx.stroke();
          }
        } else {
          const bx = it.x + 12 * u, bw = it.w - 24 * u, by = 6 * u, bh = 12 * u;
          ctx.fillStyle = '#8e3f12'; ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
          ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
          ctx.strokeStyle = 'rgba(234,211,156,0.8)';
          ctx.beginPath();
          for (let k = 0; k < bw; k += 3 * u) { ctx.moveTo(bx + k, by + bh / 2); ctx.lineTo(bx + k + 1.5 * u, by + 2 * u); ctx.lineTo(bx + k + 3 * u, by + bh / 2); ctx.lineTo(bx + k + 1.5 * u, by + bh - 2 * u); ctx.closePath(); }
          ctx.stroke();
          ctx.strokeStyle = INK;
          for (let k = 0; k <= bw; k += 2 * u) { ctx.beginPath(); ctx.moveTo(bx + k, by + bh); ctx.lineTo(bx + k, by + bh + 2 * u); ctx.stroke(); }
        }
      }
    }
  }

  drawFloor(ctx, kind, floorY, W, H) {
    const u = this.u;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, floorY, W, H - floorY); ctx.clip();
    if (kind === 'floor-checker') {
      const s = 8 * u;
      const off = this.scroll % (s * 2);
      for (let y = floorY, r = 0; y < H; y += s, r++) {
        for (let x = -off - s * 2, c = 0; x < W + s; x += s, c++) {
          ctx.fillStyle = (r + c) % 2 ? '#e9dcbd' : '#3b4a6b';
          ctx.fillRect(x, y, s + 0.5, s + 0.5);
        }
      }
    } else if (kind === 'floor-mosaic') {
      ctx.fillStyle = '#d8c39a'; ctx.fillRect(0, floorY, W, H - floorY);
      const s = 3 * u;
      const off = this.scroll % s;
      for (let y = floorY; y < H; y += s) for (let x = -off; x < W; x += s) {
        const k = Math.floor((x + this.scroll) / s) * 7 + Math.floor(y / s) * 13;
        ctx.fillStyle = ['#cf9a5c', '#e2c48a', '#b46a45', '#d8c39a', '#e9dcbd'][((k % 5) + 5) % 5];
        ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
      }
      // ammonite spirals
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      const step = 60 * u;
      for (let x = -((this.scroll) % step) + step / 2; x < W + step; x += step) {
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 6; a += 0.2) { const r = 0.6 * u * a; ctx.lineTo(x + Math.cos(a) * r, (floorY + H) / 2 + Math.sin(a) * r * 0.5); }
        ctx.stroke();
      }
    } else if (kind === 'floor-marble') {
      const g = ctx.createLinearGradient(0, floorY, 0, H);
      g.addColorStop(0, '#efe7d6'); g.addColorStop(1, '#d9cdb3');
      ctx.fillStyle = g; ctx.fillRect(0, floorY, W, H - floorY);
      ctx.strokeStyle = 'rgba(59,74,107,0.25)'; ctx.lineWidth = 1;
      const step = 40 * u;
      for (let x = -(this.scroll % step); x < W + step; x += step) {
        ctx.beginPath(); ctx.moveTo(x, floorY); ctx.bezierCurveTo(x + 10 * u, floorY + 8 * u, x - 6 * u, floorY + 18 * u, x + 14 * u, H); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.moveTo(0, floorY + 2); ctx.lineTo(W, floorY + 2); ctx.stroke();
    } else {
      ctx.fillStyle = '#a9834d'; ctx.fillRect(0, floorY, W, H - floorY);
      ctx.strokeStyle = 'rgba(74,44,24,0.45)'; ctx.lineWidth = 1;
      for (let y = floorY; y < H; y += 5 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const step = 30 * u;
      let row = 0;
      for (let y = floorY; y < H; y += 5 * u, row++) {
        const off = (this.scroll + row * 11 * u) % step;
        for (let x = -off; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 5 * u); ctx.stroke(); }
      }
    }
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
  }

  drawSign(ctx, it, floorY) {
    const u = this.u;
    const unlocked = this.unlockedRegion(it.region.id);
    const cx = it.x + it.w / 2;
    // post and hanging sign
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillStyle = '#6e4428';
    ctx.fillRect(cx - 1 * u, floorY - 40 * u, 2 * u, 40 * u); ctx.strokeRect(cx - 1 * u, floorY - 40 * u, 2 * u, 40 * u);
    const sw = 32 * u, sh = 16 * u, sy = floorY - 44 * u;
    ctx.fillStyle = unlocked ? '#ead39c' : '#cbbf9f';
    ctx.save(); ctx.translate(cx, sy); ctx.rotate(-0.03);
    ctx.fillRect(-sw / 2, 0, sw, sh); ctx.strokeRect(-sw / 2, 0, sw, sh);
    ctx.fillStyle = it.region.accent; ctx.fillRect(-sw / 2, 0, sw, 3 * u);
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const words = it.region.name.split(' ');
    ctx.font = `700 ${Math.round(3.6 * u)}px 'Kalam', cursive`;
    ctx.fillText(words[0], 0, 7 * u);
    ctx.fillText(words.slice(1).join(' '), 0, 11.5 * u);
    if (!unlocked) {
      ctx.font = `700 ${Math.round(2.6 * u)}px 'Courier Prime', monospace`;
      ctx.fillStyle = RUST;
      ctx.fillText(`WING CLOSED · ★${it.region.stars}`, 0, 18.5 * u);
    }
    ctx.restore();
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  unlockedRegion(id) {
    const stars = this.data.creatures.reduce((s, c) => s + creatureStars(this.save, c), 0);
    return stars >= this.data.regionById[id].stars;
  }

  drawExhibit(ctx, it, floorY, plaqueKind) {
    const u = this.u;
    const c = it.creature;
    const cx = it.x + it.w / 2;
    const placed = this.save.assembled[c.id] || [];
    const quality = this.save.collection[c.id]?.bones || {};
    // plinth
    const pw = 62 * u, ph = 7 * u, py = floorY - ph + 2 * u;
    ctx.fillStyle = '#d6c7a3'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.fillRect(cx - pw / 2, py, pw, ph); ctx.strokeRect(cx - pw / 2, py, pw, ph);
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(cx - pw / 2, py + ph * 0.6, pw, ph * 0.4);
    if (placed.length) {
      const sc = (58 * u) / 200;
      ctx.save();
      ctx.translate(cx - 100 * sc, py - 112 * sc);
      ctx.scale(sc, sc);
      // stand poles
      ctx.strokeStyle = 'rgba(29,43,74,0.6)'; ctx.lineWidth = 1.2 / sc;
      ctx.beginPath(); ctx.moveTo(90, 60); ctx.lineTo(90, 112); ctx.moveTo(140, 60); ctx.lineTo(140, 112); ctx.stroke();
      for (const b of c.bones) {
        if (placed.includes(b.id)) drawBonePlaced(ctx, b, b.x, b.y, b.rot, { outline: 1.1 / sc, cracked: quality[b.id] === 'c' });
        else drawBonePlaced(ctx, b, b.x, b.y, b.rot, { ghost: true, dashed: true, outline: 0.8 / sc, ink: 'rgba(29,43,74,0.3)' });
      }
      ctx.restore();
    } else {
      // dust sheet over an empty plinth
      ctx.fillStyle = '#e8e0cc'; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - 24 * u, py);
      ctx.quadraticCurveTo(cx - 22 * u, py - 18 * u, cx - 4 * u, py - 22 * u);
      ctx.quadraticCurveTo(cx + 14 * u, py - 24 * u, cx + 22 * u, py - 8 * u);
      ctx.lineTo(cx + 25 * u, py);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 10 * u, py - 18 * u); ctx.quadraticCurveTo(cx - 8 * u, py - 8 * u, cx - 12 * u, py); ctx.moveTo(cx + 8 * u, py - 20 * u); ctx.quadraticCurveTo(cx + 12 * u, py - 8 * u, cx + 10 * u, py); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `700 ${Math.round(7 * u)}px 'Kalam', cursive`; ctx.textAlign = 'center';
      ctx.fillText('?', cx, py - 9 * u);
      ctx.textAlign = 'start';
    }
    // plaque
    const stars = creatureStars(this.save, c);
    const name = placed.length ? c.name : 'Not found yet';
    const qw = 34 * u, qh = 10 * u, qx = cx - qw / 2, qy = floorY + 5 * u;
    const styles = {
      'plaque-card': { bg: '#f7efdc', fg: INK, edge: INK },
      'plaque-wood': { bg: '#8a5a36', fg: '#f7efdc', edge: '#4a2c18' },
      'plaque-brass': { bg: '#c9a64e', fg: '#3a2a10', edge: '#7d5f2a' },
      'plaque-slate': { bg: '#3b4048', fg: '#e8c76a', edge: '#1d2b4a' },
    };
    const st = styles[plaqueKind] || styles['plaque-card'];
    ctx.fillStyle = st.bg; ctx.strokeStyle = st.edge; ctx.lineWidth = 1.5;
    ctx.save(); ctx.translate(cx, qy + qh / 2); ctx.rotate(plaqueKind === 'plaque-card' ? -0.03 : 0);
    ctx.fillRect(-qw / 2, -qh / 2, qw, qh); ctx.strokeRect(-qw / 2, -qh / 2, qw, qh);
    ctx.fillStyle = st.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(3.2 * u)}px 'Kalam', cursive`;
    ctx.fillText(name, 0, -1.6 * u);
    ctx.font = `${Math.round(2.6 * u)}px 'Courier Prime', monospace`;
    ctx.fillText(placed.length ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '· · ·', 0, 2.6 * u);
    ctx.restore();
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    void qx;
  }

  drawVisitors(ctx, dt, floorY, H) {
    const u = this.u;
    const sorted = [...this.visitors].sort((a, b) => a.lane - b.lane);
    for (const v of sorted) {
      if (!this.reduced) {
        if (v.pause > 0) v.pause -= dt;
        else {
          v.x += v.dir * v.speed * u * 0.12 * dt * 10;
          v.phase += dt * 8;
          if (v.x < 10 * u || v.x > this.hallW - 10 * u) v.dir *= -1;
          if (Math.random() < 0.004) { v.pause = 1.5 + Math.random() * 3; }
          if (Math.random() < 0.002) v.dir *= -1;
        }
      }
      if (v.x < this.scroll - 20 * u || v.x > this.scroll + this.cw + 20 * u) continue;
      const s = v.size * u * (0.9 + v.lane * 0.25);
      const fy = floorY + 18 * u + v.lane * (H - floorY - 22 * u);
      const walk = v.pause > 0 || this.reduced ? 0 : Math.sin(v.phase);
      ctx.save();
      ctx.translate(v.x, fy);
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.45); ctx.lineCap = 'round';
      // legs
      ctx.beginPath(); ctx.moveTo(0, -8 * s); ctx.lineTo(-2 * s * walk - 1.5 * s, 0); ctx.moveTo(0, -8 * s); ctx.lineTo(2 * s * walk + 1.5 * s, 0); ctx.stroke();
      // body (shirt)
      ctx.fillStyle = v.shirt;
      ctx.beginPath(); ctx.moveTo(-3 * s, -8 * s); ctx.lineTo(3 * s, -8 * s); ctx.lineTo(2.2 * s, -17 * s); ctx.lineTo(-2.2 * s, -17 * s); ctx.closePath(); ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.3); ctx.stroke();
      // head
      ctx.fillStyle = '#f2e8cf';
      ctx.beginPath(); ctx.arc(0, -20.5 * s, 3.2 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (v.hat) { ctx.fillStyle = '#a9834d'; ctx.beginPath(); ctx.ellipse(0, -23 * s, 5 * s, 1.3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillRect(-2.4 * s, -26.5 * s, 4.8 * s, 3.5 * s); ctx.strokeRect(-2.4 * s, -26.5 * s, 4.8 * s, 3.5 * s); }
      ctx.restore();
    }
  }
}
