// Canvas drawing helpers: rock textures, the sketched skyline over each dig,
// clue markers and the graph-paper background.

import { hashString } from './rng.js';

export const INK = '#1d2b4a';
export const RUST = '#c25a1c';
export const OLIVE = '#77783f';
export const BONE = '#f2e8cf';

/** Small deterministic random numbers for a cell, so textures don't flicker. */
export function cellRand(seed, i) {
  let h = hashString(`${seed}/${i}`);
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}

/** Fill a rock cell with its colour and pattern. */
export function drawRockCell(ctx, x, y, s, rock, rnd, damage01) {
  ctx.fillStyle = rock.color;
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  // gentle mottling
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(0,0,0,0.07)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, s, s);
  rnd(); rnd(); rnd(); rnd(); rnd(); rnd();

  ctx.strokeStyle = 'rgba(29,43,74,0.28)';
  ctx.fillStyle = 'rgba(29,43,74,0.25)';
  ctx.lineWidth = Math.max(1, s / 28);
  const p = rock.pattern;
  if (p === 'dots') {
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x + rnd() * s, y + rnd() * s, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
  } else if (p === 'lines') {
    for (let k = 1; k < 4; k++) { const yy = y + (k / 4) * s + (rnd() - 0.5) * 2; ctx.beginPath(); ctx.moveTo(x + 2, yy); ctx.lineTo(x + s - 2, yy + (rnd() - 0.5) * 2); ctx.stroke(); }
  } else if (p === 'waves') {
    for (let k = 1; k < 3; k++) {
      const yy = y + (k / 3) * s;
      ctx.beginPath(); ctx.moveTo(x + 2, yy);
      ctx.quadraticCurveTo(x + s * 0.25, yy - s * 0.1, x + s * 0.5, yy);
      ctx.quadraticCurveTo(x + s * 0.75, yy + s * 0.1, x + s - 2, yy);
      ctx.stroke();
    }
  } else if (p === 'hatch') {
    for (let k = -1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * s * 0.35, y + s); ctx.lineTo(x + k * s * 0.35 + s * 0.5, y); ctx.stroke(); }
  } else if (p === 'cross') {
    for (let k = 0; k < 3; k++) { const cx = x + rnd() * s, cy = y + rnd() * s, r = s * 0.1; ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); }
  } else if (p === 'bubbles') {
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + s * 0.15 + rnd() * s * 0.7, y + s * 0.15 + rnd() * s * 0.7, s * (0.06 + rnd() * 0.07), 0, Math.PI * 2); ctx.stroke(); }
  } else if (p === 'flecks') {
    for (let k = 0; k < 6; k++) { const cx = x + rnd() * s, cy = y + rnd() * s; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 0.08, cy + s * 0.03); ctx.stroke(); }
  } else if (p === 'blocks') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(x + 2, y + 2, s * 0.55, s * 0.4);
    ctx.strokeRect(x + s * 0.4, y + s * 0.5, s * 0.55, s * 0.45);
  }
  // damage cracks: more as the rock wears down
  if (damage01 > 0) {
    ctx.strokeStyle = `rgba(29,43,74,${0.35 + damage01 * 0.4})`;
    ctx.lineWidth = Math.max(1, s / 22);
    const n = 1 + Math.round(damage01 * 3);
    for (let k = 0; k < n; k++) {
      let cx = x + s * (0.2 + rnd() * 0.6), cy = y + s * (0.2 + rnd() * 0.6);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      for (let j = 0; j < 3; j++) { cx += (rnd() - 0.5) * s * 0.4; cy += (rnd() - 0.5) * s * 0.4; ctx.lineTo(cx, cy); }
      ctx.stroke();
    }
  }
}

/** Raised nodules and pale flecks: the "bump" clue. In colourblind mode a clear + shape is added. */
export function drawBump(ctx, x, y, s, rnd, colourblind) {
  // a warm colour change across the square...
  ctx.fillStyle = 'rgba(214,150,70,0.22)';
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  // ...and raised nodules with a pencil edge, visible on pale and dark rock alike
  for (let k = 0; k < 3; k++) {
    const cx = x + s * (0.25 + rnd() * 0.5);
    const cy = y + s * (0.25 + rnd() * 0.5);
    const r = s * (0.08 + rnd() * 0.05);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(cx + r * 0.4, cy + r * 0.45, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,228,0.9)';
    ctx.strokeStyle = 'rgba(29,43,74,0.55)';
    ctx.lineWidth = Math.max(1, s / 40);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (colourblind) {
    const cx = x + s * 0.78, cy = y + s * 0.22, r = s * 0.13;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, s * 0.11);
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  }
}

/** Tap result markers: hollow = double ring, echo = wave, solid = small cross. Shapes, not just colours. */
export function drawTapMark(ctx, x, y, s, kind, colourblind) {
  const cx = x + s / 2, cy = y + s / 2;
  ctx.save();
  ctx.lineCap = 'round';
  const halo = (draw, w) => {
    ctx.strokeStyle = 'rgba(255,250,235,0.9)'; ctx.lineWidth = w + 3; draw();
    ctx.strokeStyle = kind === 'hollow' ? RUST : kind === 'echo' ? OLIVE : INK; ctx.lineWidth = w; draw();
  };
  const w = Math.max(2, s * 0.08);
  if (kind === 'hollow') {
    halo(() => { ctx.beginPath(); ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2); ctx.stroke(); }, w);
  } else if (kind === 'echo') {
    halo(() => { ctx.beginPath(); ctx.moveTo(cx - s * 0.3, cy); ctx.quadraticCurveTo(cx - s * 0.15, cy - s * 0.2, cx, cy); ctx.quadraticCurveTo(cx + s * 0.15, cy + s * 0.2, cx + s * 0.3, cy); ctx.stroke(); }, w);
  } else {
    halo(() => { const r = s * 0.14; ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); }, w * 0.8);
  }
  if (colourblind) {
    ctx.font = `700 ${Math.round(s * 0.26)}px 'Courier Prime', monospace`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(kind === 'hollow' ? 'H' : kind === 'echo' ? 'E' : 'S', x + s - 2, y + s - 1);
  }
  ctx.restore();
}

/** Pencil outline left by the scanner (and probe). */
export function drawScanMark(ctx, x, y, s, probe = false) {
  ctx.save();
  ctx.strokeStyle = probe ? RUST : INK;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.setLineDash([s * 0.12, s * 0.08]);
  ctx.strokeRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76);
  ctx.setLineDash([]);
  if (probe) {
    ctx.fillStyle = RUST;
    ctx.beginPath(); ctx.moveTo(x + s / 2, y + s * 0.62); ctx.lineTo(x + s * 0.36, y + s * 0.3); ctx.lineTo(x + s * 0.64, y + s * 0.3); ctx.closePath(); ctx.fill();
  } else {
    // a little bone doodle
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + s * 0.35, y + s * 0.62); ctx.lineTo(x + s * 0.65, y + s * 0.38); ctx.stroke();
  }
  ctx.restore();
}

/** The sketched skyline above the dig, different for each region. */
export function drawSkyline(ctx, x, y, w, h, regionId, accent) {
  ctx.save();
  ctx.fillStyle = BONE;
  ctx.fillRect(x, y, w, h);
  // graph grid
  ctx.strokeStyle = 'rgba(29,43,74,0.09)';
  ctx.lineWidth = 1;
  const g = Math.max(10, h / 4);
  for (let gx = x; gx < x + w; gx += g) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
  for (let gy = y; gy < y + h; gy += g) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.4, h / 30);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const base = y + h;
  const sx = (f) => x + f * w;
  const sy = (f) => base - f * h;
  const sun = (fx, fy, r) => {
    ctx.fillStyle = 'rgba(194,90,28,0.25)';
    ctx.beginPath(); ctx.arc(sx(fx), sy(fy), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  ctx.fillStyle = 'rgba(0,0,0,0)';
  if (regionId === 'desert') {
    sun(0.85, 0.7, h * 0.14);
    ctx.beginPath(); ctx.moveTo(sx(0.05), base); ctx.lineTo(sx(0.08), sy(0.55)); ctx.lineTo(sx(0.22), sy(0.55)); ctx.lineTo(sx(0.25), base); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(0.5), base); ctx.lineTo(sx(0.52), sy(0.35)); ctx.lineTo(sx(0.62), sy(0.35)); ctx.lineTo(sx(0.64), base); ctx.stroke();
    // cactus
    const cx = sx(0.36);
    ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, sy(0.6)); ctx.moveTo(cx, sy(0.3)); ctx.lineTo(cx - h * 0.12, sy(0.3)); ctx.lineTo(cx - h * 0.12, sy(0.45)); ctx.moveTo(cx, sy(0.38)); ctx.lineTo(cx + h * 0.1, sy(0.38)); ctx.lineTo(cx + h * 0.1, sy(0.52)); ctx.stroke();
  } else if (regionId === 'sea') {
    ctx.beginPath(); ctx.moveTo(x, sy(0.25));
    for (let i = 0; i <= 12; i++) ctx.quadraticCurveTo(sx((i + 0.5) / 12), sy(0.35), sx((i + 1) / 12), sy(0.25));
    ctx.stroke();
    // gull
    for (const [fx, fy] of [[0.3, 0.75], [0.38, 0.65]]) { ctx.beginPath(); ctx.moveTo(sx(fx) - 8, sy(fy)); ctx.quadraticCurveTo(sx(fx) - 4, sy(fy) - 6, sx(fx), sy(fy)); ctx.quadraticCurveTo(sx(fx) + 4, sy(fy) - 6, sx(fx) + 8, sy(fy)); ctx.stroke(); }
    // lighthouse
    ctx.beginPath(); ctx.moveTo(sx(0.78), base); ctx.lineTo(sx(0.8), sy(0.75)); ctx.lineTo(sx(0.84), sy(0.75)); ctx.lineTo(sx(0.86), base); ctx.stroke();
    ctx.fillStyle = accent; ctx.fillRect(sx(0.8), sy(0.85), sx(0.84) - sx(0.8), h * 0.1); ctx.strokeRect(sx(0.8), sy(0.85), sx(0.84) - sx(0.8), h * 0.1);
  } else if (regionId === 'jungle') {
    for (const [fx, th] of [[0.1, 0.8], [0.3, 0.6], [0.7, 0.9], [0.88, 0.65]]) {
      ctx.beginPath(); ctx.moveTo(sx(fx), base); ctx.quadraticCurveTo(sx(fx) + 6, sy(th * 0.5), sx(fx), sy(th)); ctx.stroke();
      for (const a of [-0.9, -0.3, 0.3, 0.9]) { ctx.beginPath(); ctx.moveTo(sx(fx), sy(th)); ctx.quadraticCurveTo(sx(fx) + Math.sin(a) * h * 0.3, sy(th) - h * 0.15, sx(fx) + Math.sin(a) * h * 0.45, sy(th) + h * 0.05); ctx.stroke(); }
    }
    ctx.strokeStyle = '#5d7d8a';
    ctx.beginPath(); ctx.moveTo(sx(0.4), sy(0.12)); ctx.quadraticCurveTo(sx(0.5), sy(0.2), sx(0.6), sy(0.1)); ctx.stroke();
  } else if (regionId === 'tundra') {
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(sx(0.2), sy(0.75)); ctx.lineTo(sx(0.32), sy(0.45)); ctx.lineTo(sx(0.45), sy(0.85)); ctx.lineTo(sx(0.65), sy(0.3)); ctx.lineTo(sx(0.8), sy(0.6)); ctx.lineTo(x + w, sy(0.2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(0.16), sy(0.66)); ctx.lineTo(sx(0.2), sy(0.6)); ctx.lineTo(sx(0.24), sy(0.66)); ctx.moveTo(sx(0.41), sy(0.75)); ctx.lineTo(sx(0.45), sy(0.68)); ctx.lineTo(sx(0.49), sy(0.75)); ctx.stroke();
    for (const [fx, fy] of [[0.58, 0.8], [0.9, 0.85], [0.08, 0.4]]) { const r = h * 0.06; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.moveTo(sx(fx) - Math.cos(a) * r, sy(fy) - Math.sin(a) * r); ctx.lineTo(sx(fx) + Math.cos(a) * r, sy(fy) + Math.sin(a) * r); } ctx.stroke(); }
  } else if (regionId === 'volcano') {
    ctx.beginPath(); ctx.moveTo(sx(0.15), base); ctx.lineTo(sx(0.35), sy(0.7)); ctx.lineTo(sx(0.45), sy(0.7)); ctx.lineTo(sx(0.68), base); ctx.stroke();
    ctx.strokeStyle = 'rgba(29,43,74,0.5)';
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(sx(0.42 + k * 0.04), sy(0.82 + k * 0.06), h * (0.06 + k * 0.02), 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(sx(0.7), base); ctx.lineTo(sx(0.82), sy(0.4)); ctx.lineTo(sx(0.95), base); ctx.stroke();
  } else {
    sun(0.8, 0.6, h * 0.14);
  }
  // ground line
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, h / 20);
  ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + w, base); ctx.stroke();
  ctx.restore();
}

/** Small canvas with a legend symbol, for the clipboard and help. */
export function legendCanvas(draw, size = 40) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  return c;
}
