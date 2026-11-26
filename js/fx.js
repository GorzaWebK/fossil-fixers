// Little bits of juice drawn on a canvas: dust puffs, crumbling rock chunks
// and sparkles. Reduced motion keeps only a few, slow, short-lived ones.

export class Particles {
  constructor() {
    this.list = [];
    this.reduced = false;
  }

  dust(x, y, color = 'rgba(226, 196, 138, 0.8)', n = 8, size = 6) {
    const count = this.reduced ? Math.ceil(n / 4) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (this.reduced ? 6 : 18) + Math.random() * 30;
      this.list.push({ kind: 'dust', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 12, r: size * (0.5 + Math.random()), grow: size * 1.6, life: 0, max: 0.6 + Math.random() * 0.4, color });
    }
  }

  chunks(x, y, color, n = 6, size = 5) {
    if (this.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 60 + Math.random() * 110;
      const pts = [];
      const k = 4 + Math.floor(Math.random() * 3);
      for (let j = 0; j < k; j++) {
        const ang = (j / k) * Math.PI * 2;
        const rr = size * (0.5 + Math.random() * 0.6);
        pts.push([Math.cos(ang) * rr, Math.sin(ang) * rr]);
      }
      this.list.push({ kind: 'chunk', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, pts, life: 0, max: this.reduced ? 0.4 : 0.9, color });
    }
  }

  sparkle(x, y, n = 10, color = '#fff6d8') {
    if (this.reduced) n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const s = this.reduced ? 10 : 40 + Math.random() * 60;
      this.list.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 3 + Math.random() * 3, life: 0, max: 0.7 + Math.random() * 0.3, color });
    }
  }

  ring(x, y, r, color = 'rgba(194, 90, 28, 0.8)') {
    this.list.push({ kind: 'ring', x, y, r, life: 0, max: 0.7, color });
  }

  get active() { return this.list.length > 0; }

  update(dt) {
    for (const p of this.list) {
      p.life += dt;
      if (p.kind === 'chunk') {
        p.vy += 520 * dt;
        p.rot += p.vr * dt;
      } else if (p.kind === 'dust') {
        p.vx *= 1 - 2.5 * dt;
        p.vy = p.vy * (1 - 2.5 * dt) - 8 * dt;
      } else if (p.kind === 'spark') {
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
      }
      if (p.vx !== undefined) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    this.list = this.list.filter((p) => p.life < p.max);
  }

  draw(ctx) {
    for (const p of this.list) {
      const t = p.life / p.max;
      ctx.save();
      if (p.kind === 'dust') {
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + p.grow * t, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'chunk') {
        ctx.globalAlpha = Math.min(1, (1 - t) * 2);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = 'rgba(30, 18, 8, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = 1 - t;
        ctx.translate(p.x, p.y);
        ctx.rotate(t * 3);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = 'rgba(194, 90, 28, 0.9)';
        ctx.lineWidth = 1;
        const r = p.r * (1 - t * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? r * 0.35 : r;
          const a = (i / 8) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - t) + 0.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.4 + t), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
