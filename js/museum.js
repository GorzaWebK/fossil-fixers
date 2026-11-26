// The museum hall: a long gallery you scroll along, one plinth per creature,
// grouped into a wing per region. Stars bring in visitors (soft
// silhouettes who wander about). Upgrades change the lights, plaques, banners and floor.

import { drawBonePlaced } from './bones.js';
import { grain } from './texture.js';
import { shade as shadeHexRgb } from './art.js';

// darken/lighten a #hex colour (returns rgb())
const shadeHex = (hex, amt) => shadeHexRgb(hex, amt);
import { creatureStars } from './save.js';

const RUST = '#9a4719';
const OLIVE = '#5f6233';

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
    this.u = Math.min(r.height / 100, r.width / 66);
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
    if (!this.grainPat) this.grainPat = ctx.createPattern(grain(), 'repeat');

    // gallery wall: deep painted plaster, darker towards the ceiling
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, '#2c2f27');
    wall.addColorStop(0.5, '#454a3a');
    wall.addColorStop(1, '#3a3e31');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, floorY);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = this.grainPat;
    ctx.translate(-this.scroll % 128, 0);
    ctx.fillRect(0, 0, W + 128, floorY);
    ctx.restore();

    ctx.save();
    ctx.translate(-this.scroll, 0);
    this.drawLighting(ctx, up.lighting, floorY);
    // dado rail and wood panelling
    const dado = floorY - 11 * u;
    const pan = ctx.createLinearGradient(0, dado, 0, floorY);
    pan.addColorStop(0, '#4a3020'); pan.addColorStop(1, '#2e1d12');
    ctx.fillStyle = pan;
    ctx.fillRect(this.scroll - 10, dado, W + 20, floorY - dado);
    const step = 24 * u;
    for (let x = Math.floor(this.scroll / step) * step; x < this.scroll + W + step; x += step) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 2 * u, dado + 2.5 * u, step - 4 * u, floorY - dado - 4 * u);
      ctx.strokeStyle = 'rgba(255,220,170,0.08)';
      ctx.strokeRect(x + 2 * u + 1, dado + 2.5 * u + 1, step - 4 * u, floorY - dado - 4 * u);
    }
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(this.scroll - 10, dado - 1.2 * u, W + 20, 1.6 * u);
    ctx.fillStyle = 'rgba(255,225,180,0.25)';
    ctx.fillRect(this.scroll - 10, dado - 1.2 * u, W + 20, 0.4 * u);
    // cornice
    const cor = ctx.createLinearGradient(0, 0, 0, 5 * u);
    cor.addColorStop(0, '#1d1a14'); cor.addColorStop(1, '#3b352a');
    ctx.fillStyle = cor;
    ctx.fillRect(this.scroll - 10, 0, W + 20, 5 * u);
    this.drawBanners(ctx, up.banner, floorY);
    ctx.restore();

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

    // soft vignette, like a real dim gallery
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (!this.visitors.length) {
      const msg = 'No visitors yet. Put a skeleton on display to bring them in.';
      ctx.font = `${Math.max(13, 2.8 * u)}px 'Courier Prime', monospace`;
      const w = ctx.measureText(msg).width + 28;
      ctx.fillStyle = 'rgba(20,14,8,0.75)';
      ctx.fillRect(W / 2 - w / 2, H - 10 * u, w, 6.5 * u);
      ctx.fillStyle = '#f0e6d2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, W / 2, H - 6.7 * u);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  drawLighting(ctx, kind, floorY) {
    const u = this.u;
    for (const it of this.items) {
      if (it.kind !== 'exhibit') continue;
      if (it.x + it.w < this.scroll - 60 || it.x > this.scroll + this.cw + 60) continue;
      const cx = it.x + it.w / 2;
      const lit = (this.save.assembled[it.creature.id] || []).length > 0;
      // a pool of light on the wall behind every exhibit
      const pool = ctx.createRadialGradient(cx, floorY - 22 * u, 2 * u, cx, floorY - 22 * u, 42 * u);
      const warm = kind === 'light-skylight' ? '255,250,235' : kind === 'light-spots' ? '255,240,205' : '255,214,150';
      pool.addColorStop(0, `rgba(${warm},${lit ? 0.42 : 0.16})`);
      pool.addColorStop(0.55, `rgba(${warm},${lit ? 0.14 : 0.05})`);
      pool.addColorStop(1, `rgba(${warm},0)`);
      ctx.fillStyle = pool;
      ctx.fillRect(cx - 45 * u, 0, 90 * u, floorY);
      if (kind === 'light-spots') {
        const beam = ctx.createLinearGradient(0, 5 * u, 0, floorY);
        beam.addColorStop(0, 'rgba(255,240,205,0.35)'); beam.addColorStop(1, 'rgba(255,240,205,0.02)');
        ctx.fillStyle = beam;
        ctx.beginPath(); ctx.moveTo(cx - 2 * u, 7 * u); ctx.lineTo(cx + 2 * u, 7 * u); ctx.lineTo(cx + 28 * u, floorY); ctx.lineTo(cx - 28 * u, floorY); ctx.fill();
        const can = ctx.createLinearGradient(cx - 3 * u, 0, cx + 3 * u, 0);
        can.addColorStop(0, '#1b1b1b'); can.addColorStop(0.5, '#4a4a48'); can.addColorStop(1, '#151515');
        ctx.fillStyle = can;
        ctx.beginPath(); ctx.moveTo(cx - 2.6 * u, 4 * u); ctx.lineTo(cx + 2.6 * u, 4 * u); ctx.lineTo(cx + 2 * u, 8 * u); ctx.lineTo(cx - 2 * u, 8 * u); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,245,210,0.9)'; ctx.fillRect(cx - 1.8 * u, 7.6 * u, 3.6 * u, 0.6 * u);
      } else if (kind === 'light-skylight') {
        ctx.fillStyle = 'rgba(255,250,232,0.12)';
        ctx.beginPath(); ctx.moveTo(cx - 16 * u, 5 * u); ctx.lineTo(cx, 5 * u); ctx.lineTo(cx + 26 * u, floorY); ctx.lineTo(cx + 8 * u, floorY); ctx.fill();
        const glass = ctx.createLinearGradient(0, 0, 0, 5 * u);
        glass.addColorStop(0, '#dfe9ee'); glass.addColorStop(1, '#9fb4bf');
        ctx.fillStyle = glass; ctx.fillRect(cx - 16 * u, 0, 16 * u, 5 * u);
        ctx.fillStyle = '#1d1a14';
        for (let k = 0; k <= 4; k++) ctx.fillRect(cx - 16 * u + k * 4 * u - 0.3 * u, 0, 0.6 * u, 5 * u);
      } else if (kind === 'light-lanterns') {
        for (const dx of [-26, 26]) {
          const lx = cx + dx * u, ly = 15 * u;
          const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 18 * u);
          g.addColorStop(0, 'rgba(255,190,110,0.55)'); g.addColorStop(1, 'rgba(255,190,110,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 18 * u, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(20,14,8,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, 5 * u); ctx.lineTo(lx, ly - 4 * u); ctx.stroke();
          const lg = ctx.createRadialGradient(lx - u, ly - u, 0.5 * u, lx, ly, 4.5 * u);
          lg.addColorStop(0, '#fff1c8'); lg.addColorStop(0.5, dx < 0 ? '#e7853f' : '#e8b04c'); lg.addColorStop(1, dx < 0 ? '#8e3f12' : '#8a5a1a');
          ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(lx, ly, 3.2 * u, 4.2 * u, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(80,40,10,0.4)';
          for (const ry of [-2, 0, 2]) { ctx.beginPath(); ctx.ellipse(lx, ly + ry * u, 3.2 * u * Math.cos(ry / 5), 0.5 * u, 0, 0, Math.PI * 2); ctx.stroke(); }
        }
      } else {
        // brass wall sconces with warm glass shades
        for (const dx of [-34, 34]) {
          const lx = cx + dx * u, ly = floorY - 34 * u;
          const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 13 * u);
          g.addColorStop(0, 'rgba(255,205,130,0.5)'); g.addColorStop(1, 'rgba(255,205,130,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 13 * u, 0, Math.PI * 2); ctx.fill();
          const br = ctx.createLinearGradient(lx - 1.5 * u, 0, lx + 1.5 * u, 0);
          br.addColorStop(0, '#6b4c1c'); br.addColorStop(0.5, '#d8b36a'); br.addColorStop(1, '#5c3f14');
          ctx.fillStyle = br;
          ctx.fillRect(lx - 0.4 * u, ly + 1 * u, 0.8 * u, 5 * u);
          ctx.fillRect(lx - 1.6 * u, ly + 5.5 * u, 3.2 * u, 1.2 * u);
          const shade = ctx.createLinearGradient(0, ly - 3 * u, 0, ly + 2 * u);
          shade.addColorStop(0, '#fff3d6'); shade.addColorStop(1, '#e7b56a');
          ctx.fillStyle = shade;
          ctx.beginPath(); ctx.moveTo(lx - 1.4 * u, ly - 3 * u); ctx.lineTo(lx + 1.4 * u, ly - 3 * u); ctx.lineTo(lx + 2.6 * u, ly + 1.5 * u); ctx.lineTo(lx - 2.6 * u, ly + 1.5 * u); ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  drawBanners(ctx, kind, floorY) {
    const u = this.u;
    if (kind === 'banner-bunting') {
      const colors = ['#9a4719', '#5f6233', '#2f4a5f', '#b38a3a'];
      const step = 8 * u;
      const s0 = Math.floor(this.scroll / step) * step;
      const yAt = (x) => 9 * u + (1 - Math.cos(((x % (64 * u)) / (64 * u)) * Math.PI * 2)) * 2.2 * u;
      ctx.strokeStyle = 'rgba(230,215,185,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = s0 - step; x < this.scroll + this.cw + step; x += 2) (x === s0 - step ? ctx.moveTo(x, yAt(x)) : ctx.lineTo(x, yAt(x)));
      ctx.stroke();
      let k = Math.floor(s0 / step);
      for (let x = s0 - step; x < this.scroll + this.cw + step; x += step, k++) {
        const y1 = yAt(x + 1), y2 = yAt(x + step - 1);
        const g = ctx.createLinearGradient(x, y1, x + step, y1 + 5 * u);
        const c = colors[((k % 4) + 4) % 4];
        g.addColorStop(0, c); g.addColorStop(1, shadeHex(c, -0.35));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x + 1, y1); ctx.lineTo(x + step - 1, y2); ctx.lineTo(x + step / 2, (y1 + y2) / 2 + 5.5 * u); ctx.closePath(); ctx.fill();
      }
    } else if (kind === 'banner-region' || kind === 'banner-tapestry') {
      for (const it of this.items) {
        if (kind === 'banner-region' && it.kind === 'sign') {
          for (const dx of [5, 23]) {
            const bx = it.x + dx * u, by = 5 * u, bw = 9 * u, bh = 32 * u;
            const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
            g.addColorStop(0, shadeHex(it.region.accent, -0.35)); g.addColorStop(0.45, it.region.accent); g.addColorStop(1, shadeHex(it.region.accent, -0.45));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw / 2, by + bh - 4 * u); ctx.lineTo(bx, by + bh); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#c9a862'; ctx.fillRect(bx - u, by - 0.6 * u, bw + 2 * u, 1.2 * u);
            ctx.strokeStyle = 'rgba(230,200,130,0.7)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(bx + 1.2 * u, by + 2 * u); ctx.lineTo(bx + 1.2 * u, by + bh - 2 * u); ctx.moveTo(bx + bw - 1.2 * u, by + 2 * u); ctx.lineTo(bx + bw - 1.2 * u, by + bh - 2 * u); ctx.stroke();
          }
        } else if (kind === 'banner-tapestry' && it.kind === 'exhibit') {
          const bx = it.x + 14 * u, bw = it.w - 28 * u, by = 7 * u, bh = 11 * u;
          const g = ctx.createLinearGradient(0, by, 0, by + bh);
          g.addColorStop(0, '#6e2a0d'); g.addColorStop(1, '#4a1b07');
          ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = 'rgba(214,180,106,0.6)'; ctx.lineWidth = 1;
          ctx.strokeRect(bx + u, by + u, bw - 2 * u, bh - 2 * u);
          ctx.beginPath();
          for (let k = 2 * u; k < bw - 2 * u; k += 3 * u) { ctx.moveTo(bx + k, by + bh / 2); ctx.lineTo(bx + k + 1.5 * u, by + 2.5 * u); ctx.lineTo(bx + k + 3 * u, by + bh / 2); ctx.lineTo(bx + k + 1.5 * u, by + bh - 2.5 * u); ctx.closePath(); }
          ctx.stroke();
          ctx.fillStyle = '#c9a862'; ctx.fillRect(bx - u, by - 0.8 * u, bw + 2 * u, 1.2 * u);
        }
      }
    }
  }

  drawFloor(ctx, kind, floorY, W, H) {
    const u = this.u;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, floorY, W, H - floorY); ctx.clip();
    if (kind === 'floor-checker') {
      const s = 9 * u;
      const off = this.scroll % (s * 2);
      for (let y = floorY, r = 0; y < H; y += s, r++) for (let x = -off - s * 2, c = 0; x < W + s; x += s, c++) {
        ctx.fillStyle = (r + c) % 2 ? '#d9cfba' : '#2b2f33';
        ctx.fillRect(x, y, s + 0.5, s + 0.5);
      }
    } else if (kind === 'floor-mosaic') {
      ctx.fillStyle = '#b89d72'; ctx.fillRect(0, floorY, W, H - floorY);
      const s = 2.6 * u;
      const off = this.scroll % s;
      for (let y = floorY; y < H; y += s) for (let x = -off; x < W; x += s) {
        const k = Math.floor((x + this.scroll) / s) * 7 + Math.floor(y / s) * 13;
        ctx.fillStyle = ['#c9a06a', '#d8bf92', '#a3693f', '#cbb58f', '#e3d3b2'][((k % 5) + 5) % 5];
        ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
      }
      const step = 60 * u;
      for (let x = -(this.scroll % step) + step / 2; x < W + step; x += step) {
        ctx.strokeStyle = '#3a2412'; ctx.lineWidth = 0.8 * u;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 6; a += 0.15) { const r = 0.55 * u * a; ctx.lineTo(x + Math.cos(a) * r, (floorY + H) / 2 + Math.sin(a) * r * 0.45); }
        ctx.stroke();
      }
    } else if (kind === 'floor-marble') {
      const g = ctx.createLinearGradient(0, floorY, 0, H);
      g.addColorStop(0, '#e9e3d6'); g.addColorStop(1, '#bdb3a0');
      ctx.fillStyle = g; ctx.fillRect(0, floorY, W, H - floorY);
      ctx.strokeStyle = 'rgba(90,90,100,0.25)'; ctx.lineWidth = 1;
      const step = 40 * u;
      for (let x = -(this.scroll % step); x < W + step; x += step) {
        ctx.beginPath(); ctx.moveTo(x, floorY); ctx.bezierCurveTo(x + 10 * u, floorY + 8 * u, x - 6 * u, floorY + 18 * u, x + 14 * u, H); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      for (let x = -(this.scroll % (20 * u)); x < W; x += 20 * u) { ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x - 6 * u, H); ctx.stroke(); }
    } else {
      // polished oak boards
      const boardH = 4.5 * u;
      let row = 0;
      for (let y = floorY; y < H; y += boardH, row++) {
        const step = 34 * u;
        const off = (this.scroll + row * 13 * u) % step;
        for (let x = -off - step; x < W + step; x += step) {
          const k = Math.floor((x + this.scroll + row * 13 * u) / step) + row * 7;
          const tone = 0.85 + (((k * 2654435761) >>> 0) % 100) / 100 * 0.3;
          ctx.fillStyle = `rgb(${Math.round(122 * tone)},${Math.round(82 * tone)},${Math.round(48 * tone)})`;
          ctx.fillRect(x, y, step - 0.8, boardH - 0.8);
        }
      }
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = this.grainPat;
      ctx.translate(-this.scroll % 128, 0);
      ctx.fillRect(0, floorY, W + 128, H - floorY);
      ctx.restore();
    }
    // depth: the floor darkens towards the viewer and has a soft sheen near the wall
    const d = ctx.createLinearGradient(0, floorY, 0, H);
    d.addColorStop(0, 'rgba(255,240,210,0.12)');
    d.addColorStop(0.15, 'rgba(0,0,0,0)');
    d.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = d;
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.restore();
    ctx.fillStyle = '#20150d';
    ctx.fillRect(0, floorY - 1, W, 2);
  }

  drawSign(ctx, it, floorY) {
    const u = this.u;
    const unlocked = this.unlockedRegion(it.region.id);
    const cx = it.x + it.w / 2;
    const sw = 30 * u, sh = 15 * u, sy = floorY - 46 * u;
    // brass chains
    ctx.strokeStyle = '#b39253'; ctx.lineWidth = Math.max(1, 0.4 * u);
    ctx.beginPath(); ctx.moveTo(cx - sw * 0.35, 5 * u); ctx.lineTo(cx - sw * 0.35, sy); ctx.moveTo(cx + sw * 0.35, 5 * u); ctx.lineTo(cx + sw * 0.35, sy); ctx.stroke();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 2 * u; ctx.shadowOffsetY = 1.5 * u;
    const wood = ctx.createLinearGradient(cx - sw / 2, sy, cx + sw / 2, sy + sh);
    wood.addColorStop(0, unlocked ? '#7b5232' : '#4d4238'); wood.addColorStop(1, unlocked ? '#4a2f1b' : '#2f2924');
    ctx.fillStyle = wood;
    ctx.fillRect(cx - sw / 2, sy, sw, sh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(214,180,106,0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - sw / 2 + u, sy + u, sw - 2 * u, sh - 2 * u);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const words = it.region.name.toUpperCase().split(' ');
    ctx.font = `700 ${Math.round(2.6 * u)}px 'Courier Prime', monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(words[0], cx, sy + 5.6 * u + 1); ctx.fillText(words.slice(1).join(' '), cx, sy + 9.4 * u + 1);
    ctx.fillStyle = '#e5c77d';
    ctx.fillText(words[0], cx, sy + 5.6 * u); ctx.fillText(words.slice(1).join(' '), cx, sy + 9.4 * u);
    if (!unlocked) {
      ctx.font = `${Math.round(2.2 * u)}px 'Courier Prime', monospace`;
      ctx.fillStyle = '#e9a27a';
      ctx.fillText(`Wing closed · ★${it.region.stars}`, cx, sy + sh + 3.5 * u);
    }
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
    // stone plinth with a bevelled top and a shadow on the floor
    const pw = 62 * u, ph = 7 * u, py = floorY - ph + 2.5 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, py + ph + 1.5 * u, pw * 0.55, 2.5 * u, 0, 0, Math.PI * 2); ctx.fill();
    const side = ctx.createLinearGradient(0, py, 0, py + ph);
    side.addColorStop(0, '#cbc1ae'); side.addColorStop(1, '#8f8676');
    ctx.fillStyle = side;
    ctx.fillRect(cx - pw / 2, py, pw, ph);
    ctx.fillStyle = '#e4dccb';
    ctx.fillRect(cx - pw / 2 - u, py - 1.2 * u, pw + 2 * u, 1.4 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cx - pw / 2, py + 0.2 * u, pw, 0.5 * u);
    if (placed.length) {
      const sc = (58 * u) / 200;
      ctx.save();
      ctx.translate(cx - 100 * sc, py - 1.2 * u - 112 * sc);
      ctx.scale(sc, sc);
      // steel mounting rods
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.4 / sc;
      ctx.beginPath(); ctx.moveTo(90, 62); ctx.lineTo(90, 112); ctx.moveTo(140, 62); ctx.lineTo(140, 112); ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 4 * u;
      ctx.shadowOffsetX = 2.5 * u;
      ctx.shadowOffsetY = 3 * u;
      for (const b of c.bones) {
        if (placed.includes(b.id)) drawBonePlaced(ctx, b, b.x, b.y, b.rot, { outline: 0.9 / sc, cracked: quality[b.id] === 'c' });
      }
      ctx.restore();
    } else {
      // a dust sheet over the empty plinth
      const cloth = ctx.createLinearGradient(cx - 24 * u, py - 24 * u, cx + 24 * u, py);
      cloth.addColorStop(0, '#d8d0bd'); cloth.addColorStop(1, '#9d9584');
      ctx.fillStyle = cloth;
      ctx.beginPath();
      ctx.moveTo(cx - 25 * u, py);
      ctx.quadraticCurveTo(cx - 22 * u, py - 18 * u, cx - 4 * u, py - 22 * u);
      ctx.quadraticCurveTo(cx + 14 * u, py - 24 * u, cx + 22 * u, py - 8 * u);
      ctx.lineTo(cx + 25 * u, py);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,50,40,0.35)'; ctx.lineWidth = Math.max(1, 0.4 * u);
      ctx.beginPath(); ctx.moveTo(cx - 10 * u, py - 18 * u); ctx.quadraticCurveTo(cx - 8 * u, py - 8 * u, cx - 12 * u, py); ctx.moveTo(cx + 8 * u, py - 20 * u); ctx.quadraticCurveTo(cx + 12 * u, py - 8 * u, cx + 10 * u, py); ctx.moveTo(cx + 1 * u, py - 22 * u); ctx.quadraticCurveTo(cx + 3 * u, py - 10 * u, cx, py); ctx.stroke();
    }
    // plaque on a small lectern in front of the plinth
    const stars = creatureStars(this.save, c);
    const name = placed.length ? c.name : 'Coming soon';
    const qw = 30 * u, qh = 9 * u, qy = floorY + 5 * u;
    const styles = {
      'plaque-card': { a: '#f3ead6', b: '#d9ccb0', fg: '#2a2118', edge: 'rgba(0,0,0,0.25)' },
      'plaque-wood': { a: '#8a5a36', b: '#5a3820', fg: '#f3e6cc', edge: 'rgba(0,0,0,0.4)' },
      'plaque-brass': { a: '#e8cd85', b: '#9c7a33', fg: '#3a2a10', edge: 'rgba(60,40,10,0.6)' },
      'plaque-slate': { a: '#4a4f57', b: '#2a2d33', fg: '#e8c76a', edge: 'rgba(0,0,0,0.6)' },
    };
    const st = styles[plaqueKind] || styles['plaque-card'];
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(cx - qw / 2 + u, qy + qh, qw - 2 * u, 0.8 * u);
    const pg = ctx.createLinearGradient(0, qy, 0, qy + qh);
    pg.addColorStop(0, st.a); pg.addColorStop(1, st.b);
    ctx.fillStyle = pg;
    ctx.fillRect(cx - qw / 2, qy, qw, qh);
    ctx.strokeStyle = st.edge; ctx.lineWidth = 1;
    ctx.strokeRect(cx - qw / 2 + 0.5, qy + 0.5, qw - 1, qh - 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(2.7 * u)}px 'Courier Prime', monospace`;
    ctx.fillStyle = st.fg;
    ctx.fillText(name.toUpperCase(), cx, qy + 3.4 * u);
    ctx.font = `${Math.round(2.4 * u)}px 'Courier Prime', monospace`;
    ctx.fillText(placed.length ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '', cx, qy + 6.6 * u);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  drawVisitors(ctx, dt, floorY, H) {
    const u = this.u;
    const sorted = [...this.visitors].sort((a, b) => a.lane - b.lane);
    for (const v of sorted) {
      if (!this.reduced) {
        if (v.pause > 0) v.pause -= dt;
        else {
          v.x += v.dir * v.speed * u * 1.2 * dt;
          v.phase += dt * 7;
          if (v.x < 10 * u || v.x > this.hallW - 10 * u) v.dir *= -1;
          if (Math.random() < 0.004) v.pause = 1.5 + Math.random() * 3;
          if (Math.random() < 0.002) v.dir *= -1;
        }
      }
      if (v.x < this.scroll - 20 * u || v.x > this.scroll + this.cw + 20 * u) continue;
      // people as soft silhouettes, like the figures on an architect's drawing
      const s = v.size * u * 0.5 * (0.85 + v.lane * 0.3);
      const fy = floorY + 18 * u + v.lane * Math.max(2 * u, H - floorY - 22 * u);
      const walk = v.pause > 0 || this.reduced ? 0 : Math.sin(v.phase);
      const shade = 28 + Math.round(v.lane * 20);
      ctx.save();
      ctx.translate(v.x, fy);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 0, 5 * s, 1.2 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 6},0.88)`;
      // legs
      for (const sgn of [-1, 1]) {
        const swing = sgn * walk * 2.2 * s;
        ctx.beginPath(); ctx.moveTo(-1.6 * s * -sgn * 0.5 - 1.1 * s, -11 * s); ctx.lineTo(swing - 0.9 * s, 0); ctx.lineTo(swing + 0.9 * s, 0); ctx.lineTo(1.1 * s - 1.6 * s * -sgn * 0.5, -11 * s); ctx.fill();
      }
      // body (coat), arms, head
      ctx.beginPath();
      ctx.moveTo(-3.2 * s, -10 * s);
      ctx.quadraticCurveTo(-3.6 * s, -18 * s, -2.4 * s, -21 * s);
      ctx.lineTo(2.4 * s, -21 * s);
      ctx.quadraticCurveTo(3.6 * s, -18 * s, 3.2 * s, -10 * s);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -23.6 * s, 2.2 * s, 2.6 * s, 0, 0, Math.PI * 2); ctx.fill();
      if (v.hat) { ctx.beginPath(); ctx.ellipse(0, -25.4 * s, 3.4 * s, 0.8 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-1.8 * s, -28 * s, 3.6 * s, 2.8 * s); }
      // a touch of colour from the coat, lit by the gallery lights
      ctx.fillStyle = v.shirt;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(-3 * s, -11 * s); ctx.quadraticCurveTo(-3.4 * s, -18 * s, -2.2 * s, -20.5 * s); ctx.lineTo(0, -20.5 * s); ctx.lineTo(0, -11 * s); ctx.fill();
      ctx.restore();
    }
  }
}
