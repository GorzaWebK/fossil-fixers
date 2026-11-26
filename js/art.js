// Canvas drawing helpers: clue markers (bumps, chalk tap marks, survey paint)
// and small rock swatches for legends. The rock itself is painted in texture.js.

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

/**
 * The "bump" clue: a few rounded nodules pushing out of the rock face, lit from
 * the top left, with a pale stain around them. In colourblind mode a clear +
 * marker is added so it never depends on colour.
 */
export function drawBump(ctx, x, y, s, rnd, colourblind) {
  const stain = ctx.createRadialGradient(x + s / 2, y + s / 2, 0, x + s / 2, y + s / 2, s * 0.6);
  stain.addColorStop(0, 'rgba(240,225,190,0.32)');
  stain.addColorStop(1, 'rgba(240,225,190,0)');
  ctx.fillStyle = stain;
  ctx.fillRect(x, y, s, s);
  const n = 3 + Math.floor(rnd() * 2);
  for (let k = 0; k < n; k++) {
    const cx = x + s * (0.22 + rnd() * 0.56);
    const cy = y + s * (0.22 + rnd() * 0.56);
    const r = s * (0.06 + rnd() * 0.06);
    ctx.fillStyle = 'rgba(30,18,8,0.35)';
    ctx.beginPath(); ctx.ellipse(cx + r * 0.35, cy + r * 0.45, r * 1.05, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(255,250,236,0.95)');
    g.addColorStop(0.55, 'rgba(226,206,168,0.95)');
    g.addColorStop(1, 'rgba(150,120,82,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  if (colourblind) {
    const cx = x + s * 0.8, cy = y + s * 0.2, r = s * 0.12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(3.5, s * 0.12);
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.6, s * 0.05);
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  }
}

// A wobbly hand-drawn stroke, done a few times with a little jitter like chalk.
function chalk(ctx, draw, color, width, passes = 3) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,12,6,0.45)';
  ctx.lineWidth = width + 2;
  ctx.translate(0.8, 1);
  draw(0);
  ctx.stroke();
  ctx.translate(-0.8, -1);
  for (let p = 0; p < passes; p++) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = p === 0 ? 0.95 : 0.45;
    ctx.lineWidth = p === 0 ? width : width * 0.55;
    draw(p);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Tap results, marked on the rock in field chalk:
 * hollow = an orange ring, echo = a yellow squiggle, solid = a white cross.
 * The shapes differ, so colour isn't needed; colourblind mode adds a letter too.
 */
export function drawTapMark(ctx, x, y, s, kind, colourblind) {
  const cx = x + s / 2, cy = y + s / 2;
  const w = Math.max(2.2, s * 0.085);
  const j = (p) => (p ? (p % 2 ? 1 : -1) * s * 0.02 : 0);
  if (kind === 'hollow') {
    chalk(ctx, (p) => { ctx.beginPath(); ctx.ellipse(cx + j(p), cy - j(p), s * 0.3, s * 0.27, 0.3, 0.2, Math.PI * 2.1); }, '#ff8a3a', w);
  } else if (kind === 'echo') {
    chalk(ctx, (p) => { ctx.beginPath(); ctx.moveTo(cx - s * 0.3, cy + j(p)); ctx.bezierCurveTo(cx - s * 0.12, cy - s * 0.25, cx + s * 0.05, cy + s * 0.25, cx + s * 0.3, cy - s * 0.04 + j(p)); }, '#ffe066', w);
  } else {
    const r = s * 0.17;
    chalk(ctx, (p) => { ctx.beginPath(); ctx.moveTo(cx - r + j(p), cy - r); ctx.lineTo(cx + r, cy + r + j(p)); ctx.moveTo(cx + r, cy - r + j(p)); ctx.lineTo(cx - r + j(p), cy + r); }, '#f4f1ea', w * 0.85);
  }
  if (colourblind) {
    ctx.save();
    ctx.font = `700 ${Math.round(s * 0.28)}px 'Courier Prime', monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111';
    const L = kind === 'hollow' ? 'H' : kind === 'echo' ? 'E' : 'S';
    ctx.strokeText(L, x + s - 2, y + s - 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(L, x + s - 2, y + s - 1);
    ctx.restore();
  }
}

/** Scanner hits: a dashed square of survey spray paint. The probe rod leaves a little red flag. */
export function drawScanMark(ctx, x, y, s, probe = false) {
  ctx.save();
  if (probe) {
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath(); ctx.moveTo(x + s * 0.4, y + s * 0.85); ctx.lineTo(x + s * 0.4, y + s * 0.18); ctx.stroke();
    ctx.fillStyle = '#d8332a';
    ctx.beginPath(); ctx.moveTo(x + s * 0.4, y + s * 0.18); ctx.lineTo(x + s * 0.78, y + s * 0.3); ctx.lineTo(x + s * 0.4, y + s * 0.44); ctx.closePath(); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.lineCap = 'round';
  ctx.setLineDash([s * 0.14, s * 0.09]);
  ctx.strokeStyle = 'rgba(20,12,6,0.4)';
  ctx.lineWidth = Math.max(3, s * 0.1);
  ctx.strokeRect(x + s * 0.14 + 0.8, y + s * 0.14 + 1, s * 0.72, s * 0.72);
  ctx.strokeStyle = '#ff5fa2';
  ctx.lineWidth = Math.max(2.2, s * 0.075);
  ctx.strokeRect(x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,95,162,0.9)';
  ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, Math.max(2, s * 0.06), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A small square of painted rock, for legends and the help page. */
export function rockSwatch(ctx, s, color = '#c08a55') {
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, shade(color, 0.12));
  g.addColorStop(1, shade(color, -0.15));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect((i * 37) % s, (i * 53) % s, 1.5, 1.5);
  }
}

/** Small canvas with a legend symbol, for the clipboard and help. */
export function legendCanvas(draw, size = 40) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  return c;
}
