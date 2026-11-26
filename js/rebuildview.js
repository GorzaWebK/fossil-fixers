// The rebuild workbench: the faint skeleton outline on graph paper, a tray of
// found bones, drag / turn / snap.

import { startRebuild, layoutTray, dropPiece, nearButTurned, isComplete, ROT_STEP, angleDiff } from './rebuild.js';
import { drawBonePlaced, boneExtent, INK } from './bones.js';
import { Particles } from './fx.js';
import { sfx } from './audio.js';

export class RebuildView {
  constructor({ canvas, wrap, status, onPlace, onComplete }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrap = wrap;
    this.status = status;
    this.onPlace = onPlace;
    this.onComplete = onComplete;
    this.fx = new Particles();
    this.sel = null;
    this.drag = null;
    this.hintT = 0;
    this.running = false;
    this.lastTap = { t: 0, piece: null };
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const p = this.pieceAt(...this.toWorld(e));
      if (p) { this.sel = p; this.rotate(1); }
    });
    canvas.addEventListener('wheel', (e) => {
      const p = this.pieceAt(...this.toWorld(e)) || this.sel;
      if (!p) return;
      e.preventDefault();
      this.sel = p;
      this.rotate(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(wrap);
  }

  start(creature, collectedBones, assembled, settings) {
    this.creature = creature;
    this.quality = collectedBones;
    this.settings = settings;
    this.fx.reduced = settings.reducedMotion;
    this.state = startRebuild(creature, collectedBones, assembled);
    this.sel = null;
    this.drag = null;
    this.completeFired = isComplete(this.state);
    this.resize();
    this.say(this.state.pieces.length ? 'Drag each bone onto its outline. Turn it to fit (Turn button, R key, right-click or double-tap).' : (this.completeFired ? 'This skeleton is complete!' : 'No new bones to add. Dig again to find the missing ones.'));
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  stop() { this.running = false; }

  say(msg) { this.status.textContent = msg; }

  resize() {
    if (!this.state) return;
    const r = this.wrap.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cw = r.width;
    this.ch = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    const landscape = r.width / r.height > 1.25;
    this.landscape = landscape;
    // World layout in skeleton units: the 200 x 120 frame plus a tray.
    if (landscape) {
      this.world = { w: 316, h: 130 };
      this.tray = { x0: 208, y0: 2, x1: 314, y1: 126 };
    } else {
      this.world = { w: 206, h: 215 };
      this.tray = { x0: 4, y0: 132, x1: 202, y1: 212 };
    }
    const margin = 12;
    const pad = 6; // world units around everything
    const ww = this.world.w + pad * 2;
    const wh = this.world.h + pad * 2;
    this.scale = Math.min((r.width - margin * 2) / ww, (r.height - margin * 2 - 30) / wh);
    this.ox = (r.width - ww * this.scale) / 2 + pad * this.scale;
    this.oy = 30 + (r.height - 30 - wh * this.scale) / 2 + pad * this.scale;
    if (this.prevLandscape !== landscape) for (const p of this.state.pieces) p.moved = false;
    this.prevLandscape = landscape;
    const unplaced = this.state.pieces.filter((p) => !p.placed && !p.moved);
    const t = this.tray;
    // Bones wait in the tray a bit smaller if they need to, and grow to full size when picked up.
    let s = 1;
    for (; s > 0.4; s *= 0.9) {
      for (const p of unplaced) p.s = s;
      if (layoutTray({ pieces: unplaced }, t.x0 + 3, t.y0 + 11, t.x1 - 3, t.y1 - 3, (p) => this.pieceSize(p))) break;
    }
  }

  /** Width and height of a piece's drawing at its current turn. */
  pieceSize(p) {
    const ext = boneExtent(this.boneOf(p));
    const a = (p.rot * Math.PI) / 180;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const k = p.s ?? 1;
    return { w: (ext.w * c + ext.h * s) * k + 2, h: (ext.w * s + ext.h * c) * k + 2 };
  }

  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left - this.ox) / this.scale, (e.clientY - r.top - this.oy) / this.scale];
  }

  boneOf(p) { return this.creature.bones.find((b) => b.id === p.boneId); }

  pieceAt(wx, wy) {
    const list = this.state.pieces.filter((p) => !p.placed);
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const b = this.boneOf(p);
      const ext = boneExtent(b);
      const a = (-p.rot * Math.PI) / 180;
      const dx = wx - p.x, dy = wy - p.y;
      const k = p.s ?? 1;
      const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / k;
      const ly = (dx * Math.sin(a) + dy * Math.cos(a)) / k;
      const pad = 4;
      if (lx >= ext.x0 - pad && lx <= ext.x1 + pad && ly >= ext.y0 - pad && ly <= ext.y1 + pad) return p;
    }
    return null;
  }

  handlePos(p) {
    const b = this.boneOf(p);
    const ext = boneExtent(b);
    const r = (Math.max(ext.w, ext.h) / 2) * (p.s ?? 1) + 6;
    return [p.x + r * 0.7, p.y - r * 0.7];
  }

  down(e) {
    if (!this.state) return;
    const [wx, wy] = this.toWorld(e);
    if (this.sel && !this.sel.placed) {
      const [hx, hy] = this.handlePos(this.sel);
      if (Math.hypot(wx - hx, wy - hy) < 9) { this.rotate(1); return; }
    }
    const p = this.pieceAt(wx, wy);
    if (!p) { this.sel = null; return; }
    // double tap / double click turns it
    const now = performance.now();
    if (this.lastTap.piece === p && now - this.lastTap.t < 320) {
      this.sel = p;
      this.rotate(1);
      this.lastTap = { t: 0, piece: null };
      return;
    }
    this.lastTap = { t: now, piece: p };
    this.sel = p;
    // bring to front
    this.state.pieces.splice(this.state.pieces.indexOf(p), 1);
    this.state.pieces.push(p);
    this.drag = { p, dx: p.x - wx, dy: p.y - wy, id: e.pointerId, moved: false };
    this.canvas.setPointerCapture?.(e.pointerId);
    sfx.pickup();
  }

  move(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const [wx, wy] = this.toWorld(e);
    const p = this.drag.p;
    p.x = Math.max(0, Math.min(this.world.w, wx + this.drag.dx));
    p.y = Math.max(0, Math.min(this.world.h, wy + this.drag.dy));
    p.moved = true;
    p.s = 1;
    this.drag.moved = true;
  }

  up(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const p = this.drag.p;
    const moved = this.drag.moved;
    this.drag = null;
    if (moved) this.tryDrop(p);
  }

  tryDrop(p) {
    const slot = dropPiece(this.state, p);
    if (slot) {
      sfx.snap();
      const b = this.boneOf(p);
      this.fx.sparkle(this.ox + p.x * this.scale, this.oy + p.y * this.scale, 10);
      this.say(`${b.name}: snapped in!`);
      this.sel = null;
      this.onPlace(slot);
      if (isComplete(this.state) && !this.completeFired) {
        this.completeFired = true;
        setTimeout(() => this.onComplete(), 350);
      } else if (!this.state.pieces.some((q) => !q.placed)) {
        this.say('All your found bones are in place. Dig again to find the rest!');
      }
      return true;
    }
    if (nearButTurned(this.creature, p, this.state.filled)) this.say('So close! Try turning it.');
    sfx.drop();
    return false;
  }

  rotate(dir) {
    const p = this.sel;
    if (!p || p.placed) return;
    p.rot = (((p.rot + dir * ROT_STEP) % 360) + 360) % 360;
    sfx.rotate();
    // turning it into place right on top of its outline snaps it
    this.tryDrop(p);
  }

  hint() {
    const p = this.sel || this.state.pieces.find((q) => !q.placed);
    if (!p) { this.say('Nothing left to place.'); return; }
    this.sel = p;
    this.hintT = 2.2;
    const b = this.boneOf(p);
    const turned = angleDiff(p.rot, b.rot) > 1;
    this.say(`The ${b.name.toLowerCase()} goes in the flashing spot${turned ? ' (and needs turning)' : ''}.`);
  }

  onKey(e) {
    if (!this.state) return false;
    const k = e.key.toLowerCase();
    if (k === 'r' || k === 'e') { this.rotate(1); return true; }
    if (k === 'q') { this.rotate(-1); return true; }
    if (k === 'h') { this.hint(); return true; }
    if (e.key === 'Tab') {
      const list = this.state.pieces.filter((p) => !p.placed);
      if (!list.length) return false;
      const i = list.indexOf(this.sel);
      this.sel = list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length];
      this.say(`Picked: ${this.boneOf(this.sel).name}. Move it with the arrow keys, Enter to drop.`);
      return true;
    }
    const moves = { arrowleft: [-3, 0], arrowright: [3, 0], arrowup: [0, -3], arrowdown: [0, 3] };
    if (moves[k] && this.sel) {
      this.sel.x += moves[k][0];
      this.sel.y += moves[k][1];
      this.sel.moved = true;
      this.sel.s = 1;
      return true;
    }
    if ((k === 'enter' || k === ' ') && this.sel) { this.tryDrop(this.sel); return true; }
    return false;
  }

  frame(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.state && this.scale) this.draw(dt);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  draw(dt) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    const ow = 1.3 / this.scale;
    // skeleton card
    ctx.fillStyle = '#f2e8cf';
    ctx.shadowColor = 'rgba(74,44,24,0.35)';
    ctx.shadowOffsetY = 3 / this.scale;
    ctx.fillRect(-4, -4, 208, 128);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(29,43,74,0.1)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let x = 0; x <= 200; x += 10) { ctx.moveTo(x, -4); ctx.lineTo(x, 124); }
    for (let y = 0; y <= 120; y += 10) { ctx.moveTo(-4, y); ctx.lineTo(204, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(29,43,74,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-4, 112); ctx.lineTo(204, 112); ctx.stroke();
    ctx.font = `700 7px 'Kalam', cursive`;
    ctx.fillStyle = INK;
    ctx.fillText(this.creature.name, 4, 8);
    // body silhouette: a soft wash behind the bones
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#77783f';
    ctx.lineCap = 'round';
    for (const b of this.creature.bones) {
      ctx.lineWidth = b.w * 1.6 + 6;
      const a = (b.rot * Math.PI) / 180;
      const hx = Math.cos(a) * b.len * 0.45, hy = Math.sin(a) * b.len * 0.45;
      ctx.beginPath(); ctx.moveTo(b.x - hx, b.y - hy); ctx.lineTo(b.x + hx, b.y + hy); ctx.stroke();
    }
    ctx.restore();
    // outlines and placed bones
    const hintFor = this.hintT > 0 && this.sel ? this.sel.boneId : null;
    this.hintT -= dt;
    for (const b of this.creature.bones) {
      if (this.state.filled.has(b.id)) {
        drawBonePlaced(ctx, b, b.x, b.y, b.rot, { outline: ow, cracked: this.quality[b.id] === 'c' });
      } else {
        const pulse = hintFor === b.id ? 0.5 + 0.5 * Math.sin(performance.now() / 120) : 0;
        drawBonePlaced(ctx, b, b.x, b.y, b.rot, { ghost: true, dashed: true, paper: '#e6d8b6', outline: ow * (1 + pulse * 1.5), ink: pulse ? '#c25a1c' : 'rgba(29,43,74,0.75)' });
      }
    }
    // tray
    const t = this.tray;
    ctx.fillStyle = '#d8bd86';
    ctx.strokeStyle = 'rgba(74,44,24,0.6)';
    ctx.lineWidth = 1.2 / this.scale * 1.5;
    ctx.fillRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0);
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(t.x0 + 2, t.y0 + 2, t.x1 - t.x0 - 4, t.y1 - t.y0 - 4);
    ctx.setLineDash([]);
    ctx.fillStyle = INK;
    ctx.font = `700 6px 'Courier Prime', monospace`;
    ctx.fillText('FINDS TRAY', t.x0 + 5, t.y0 + 8);
    // pieces
    for (const p of this.state.pieces) {
      if (p.placed) continue;
      const b = this.boneOf(p);
      ctx.save();
      if (p === this.sel) {
        ctx.shadowColor = 'rgba(194,90,28,0.9)';
        ctx.shadowBlur = 8;
      } else {
        ctx.shadowColor = 'rgba(40,24,10,0.35)';
        ctx.shadowOffsetY = 2 / this.scale;
        ctx.shadowBlur = 2;
      }
      const k = p.s ?? 1;
      ctx.translate(p.x, p.y);
      ctx.scale(k, k);
      drawBonePlaced(ctx, b, 0, 0, p.rot, { outline: ow / k, cracked: this.quality[b.id] === 'c' });
      ctx.restore();
      if (p === this.sel) {
        const [hx, hy] = this.handlePos(p);
        ctx.fillStyle = '#f2e8cf';
        ctx.strokeStyle = '#c25a1c';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, hy, 3.2, -Math.PI * 0.9, Math.PI * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 0.2, hy + 3.2); ctx.lineTo(hx - 1.6, hy + 1.8); ctx.lineTo(hx - 1.2, hy + 4.4); ctx.closePath(); ctx.fillStyle = '#c25a1c'; ctx.fill();
      }
    }
    ctx.restore();
    this.fx.update(dt);
    this.fx.draw(ctx);
  }
}
