// Painted textures for the dig: rock generated pixel by pixel from noise
// (grain, bedding, pebbles, joints), the shadowy back wall of dug-out holes,
// and the landscape painted above each site.

// ------------------------------------------------------------------ noise
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 17); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}

// nearest feature point in a jittered grid (for pebbles): returns [dist, dx, dy, id]
function worley(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 9, bx = 0, by = 0, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const px = cx + hash2(cx, cy, seed), py = cy + hash2(cx, cy, seed + 1);
    const dx = x - px, dy = y - py;
    const d = dx * dx + dy * dy;
    if (d < best) { best = d; bx = dx; by = dy; id = hash2(cx, cy, seed + 2); }
  }
  return [Math.sqrt(best), bx, by, id];
}

const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// How each rock "pattern" looks when painted.
const LOOK = {
  dots:    { mott: 0.16, grain: 0.16, lam: 0.03, lamF: 3.0, specks: 0.05 },
  lines:   { mott: 0.12, grain: 0.10, lam: 0.07, lamF: 4.2, specks: 0.01 },
  waves:   { mott: 0.14, grain: 0.05, lam: 0.07, lamF: 2.2, wave: 1.6, specks: 0.0 },
  hatch:   { mott: 0.22, grain: 0.12, lam: 0.02, lamF: 2.0, joints: 1.6, specks: 0.02 },
  cross:   { mott: 0.30, grain: 0.06, lam: 0.0, lamF: 1.0, sheen: 1, specks: 0.0 },
  bubbles: { mott: 0.10, grain: 0.10, lam: 0.0, lamF: 1.0, pebbles: 3.2, specks: 0.0 },
  flecks:  { mott: 0.14, grain: 0.10, lam: 0.03, lamF: 3.0, specks: 0.10 },
  blocks:  { mott: 0.18, grain: 0.08, lam: 0.0, lamF: 1.0, joints: 1.1, blocky: 1, specks: 0.0 },
  solid:   { mott: 0.14, grain: 0.10, lam: 0.0, lamF: 1.0, specks: 0.0 },
};

/**
 * Paint the intact rock and the hole back-wall for a whole site.
 * rockAt(col, row) -> rock def ({ color, pattern }) ; returns { rock, cavity } canvases.
 * Layer boundaries are warped by noise so they wander naturally instead of
 * following the grid squares exactly.
 */
export function paintRock({ cols, rows, cellPx, rockAt, seed }) {
  const W = Math.max(1, Math.round(cols * cellPx));
  const H = Math.max(1, Math.round(rows * cellPx));
  const rock = document.createElement('canvas');
  const cav = document.createElement('canvas');
  rock.width = cav.width = W;
  rock.height = cav.height = H;
  const ri = rock.getContext('2d').createImageData(W, H);
  const ci = cav.getContext('2d').createImageData(W, H);
  const R = ri.data, C = ci.data;
  const s = seed >>> 0;
  const cache = new Map();
  const isoCache = new Map();
  const freq = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const d = rockAt(c, r); freq.set(d, (freq.get(d) || 0) + 1); }
  // If a cell's rock differs from at least 3 of its 4 neighbours, return the
  // neighbours' most common rock (to paint around it); otherwise null.
  const isolated = (c, r) => {
    const key = r * cols + c;
    if (isoCache.has(key)) return isoCache.get(key);
    const me = rockAt(c, r);
    const ns = [];
    if (c > 0) ns.push(rockAt(c - 1, r));
    if (c < cols - 1) ns.push(rockAt(c + 1, r));
    if (r > 0) ns.push(rockAt(c, r - 1));
    if (r < rows - 1) ns.push(rockAt(c, r + 1));
    const other = ns.filter((d) => d !== me);
    let res = null;
    if (ns.length >= 3 && other.length >= ns.length - 1 && freq.get(me) < freq.get(other[0]) * 0.6) {
      const count = new Map();
      for (const d of other) count.set(d, (count.get(d) || 0) + 1);
      res = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    isoCache.set(key, res);
    return res;
  };
  const info = (def) => {
    let v = cache.get(def);
    if (!v) { v = { rgb: hexRgb(def.color || '#b09070'), look: LOOK[def.pattern] || LOOK.solid, roots: def.name === 'Root tangle', flint: def.name === 'Flint nodule', ice: (def.tags || []).includes('ice') && def.pattern === 'lines' }; cache.set(def, v); }
    return v;
  };
  for (let py = 0; py < H; py++) {
    const cy = py / cellPx;
    for (let px = 0; px < W; px++) {
      const cx = px / cellPx;
      // domain warp so rock boundaries meander
      const wx = cx + (fbm(cx * 0.8, cy * 0.8, s + 11, 2) - 0.5) * 0.62;
      const wy = cy + (fbm(cx * 0.8 + 40, cy * 0.8, s + 23, 2) - 0.5) * 0.42;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(wx)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(wy)));
      let def = rockAt(col, row);
      // A lone lump of a different rock (a flint nodule, a root ball, a boulder)
      // is painted as a rounded nodule sitting in the surrounding rock.
      const around = isolated(col, row);
      if (around) {
        const dx = cx - (col + 0.5), dy = cy - (row + 0.5);
        const ang = Math.atan2(dy, dx);
        const rad = 0.42 + (vnoise(Math.cos(ang) * 2 + col * 7, Math.sin(ang) * 2 + row * 7, s + 81) - 0.5) * 0.18;
        if (Math.hypot(dx, dy) > rad) def = around;
      }
      const r = info(def);
      const L = r.look;
      const m = fbm(cx * 1.7, cy * 1.7, s + 5, 4) - 0.5;
      let t = 1 + m * L.mott * 2;
      if (L.lam) {
        const bend = (fbm(cx * 0.35, cy * 0.35, s + 7, 2) - 0.5) * (L.wave || 0.8);
        const yy = (cy + bend) * L.lamF;
        // irregular bedding: two out-of-step bands, faded in and out by noise
        const band = Math.sin(yy * Math.PI * 2) * 0.6 + Math.sin(yy * Math.PI * 4.7 + 1.3) * 0.4;
        t += band * L.lam * (0.4 + fbm(cx * 0.5, cy * 2, s + 13, 2));
      }
      const g = hash2(px, py, s + 3) - 0.5;
      t += g * L.grain;
      if (L.specks && hash2(px, py, s + 9) < L.specks * 0.25) t -= 0.25;
      if (L.specks && hash2(px + 7, py, s + 9) < L.specks * 0.12) t += 0.2;
      let tint = 0;
      if (L.pebbles) {
        const [d, dx, dy, id] = worley(cx * L.pebbles, cy * L.pebbles, s + 31);
        const rad = 0.32 + id * 0.12;
        if (d < rad) {
          const k = d / rad;
          t += (id - 0.5) * 0.35 + (-(dx + dy) / rad) * 0.18 - k * k * 0.12;
          tint = (id - 0.5) * 20;
        } else if (d < rad + 0.06) t -= 0.18; // gap shadow around the pebble
      }
      if (L.joints) {
        // fractures: columnar (hatch) or blocky
        const jx = cx * L.joints + (fbm(cx * 0.6, cy * 0.6, s + 41, 2) - 0.5) * 0.8;
        const fx = Math.abs(jx - Math.round(jx));
        let crack = fx < 0.025 ? 1 : 0;
        if (L.blocky) {
          const jy = cy * L.joints * 1.3 + Math.floor(jx) * 0.37;
          const fy = Math.abs(jy - Math.round(jy));
          if (fy < 0.03) crack = 1;
        }
        if (crack) t -= 0.32;
      }
      if (L.sheen) t += Math.pow(Math.max(0, fbm(cx * 3, cy * 3, s + 51, 2) - 0.55), 2) * 3;
      if (r.roots) {
        const f = Math.abs(Math.sin((cx * 2.5 + cy * 1.2 + (fbm(cx, cy, s + 61, 3) - 0.5) * 3) * Math.PI));
        if (f < 0.12) t -= 0.35;
      }
      if (r.ice) t += Math.pow(Math.max(0, fbm(cx * 1.2, cy * 4, s + 71, 2) - 0.5), 2) * 2;
      // light from above, a touch darker with depth
      t *= 1.04 - 0.1 * (cy / rows);
      const o = (py * W + px) * 4;
      const [cr, cg, cb] = r.rgb;
      R[o] = Math.max(0, Math.min(255, cr * t + tint));
      R[o + 1] = Math.max(0, Math.min(255, cg * t + tint * 0.8));
      R[o + 2] = Math.max(0, Math.min(255, cb * t + tint * 0.5));
      R[o + 3] = 255;
      // the back wall of a dug hole: the same rock, in shadow
      const lum = (cr + cg + cb) / 3;
      const dk = 0.46 + m * 0.2 + g * 0.05 - 0.08 * (cy / rows);
      C[o] = (cr * 0.7 + lum * 0.3) * dk * 0.9;
      C[o + 1] = (cg * 0.7 + lum * 0.3) * dk * 0.82;
      C[o + 2] = (cb * 0.7 + lum * 0.3) * dk * 0.72;
      C[o + 3] = 255;
    }
  }
  rock.getContext('2d').putImageData(ri, 0, 0);
  cav.getContext('2d').putImageData(ci, 0, 0);
  return { rock, cavity: cav };
}

/**
 * The outline of the dug-out area: every open cell as a polygon whose corners
 * and edge points are nudged by noise. Neighbouring cells share the same
 * nudged points, so together they make one ragged, natural-looking hole.
 */
export function holePath(site, cell, top, seed, isOpen) {
  const k = 3; // points per cell edge
  const amp = cell * 0.13;
  const P = (gx, gy) => {
    // gx, gy in sub-grid units; borders stay put
    const x = (gx / k) * cell;
    const y = top + (gy / k) * cell;
    const edgeX = gx <= 0 || gx >= site.cols * k;
    const edgeY = gy <= 0 || gy >= site.rows * k;
    const nx = edgeX ? 0 : (vnoise(gx * 0.9, gy * 0.9, seed) - 0.5) * 2 * amp;
    const ny = edgeY ? 0 : (vnoise(gx * 0.9 + 50, gy * 0.9, seed + 3) - 0.5) * 2 * amp;
    return [x + nx, y + ny];
  };
  const p = new Path2D();
  for (let i = 0; i < site.cells.length; i++) {
    if (!isOpen(i)) continue;
    const c = i % site.cols, r = Math.floor(i / site.cols);
    const gx = c * k, gy = r * k;
    const pts = [];
    for (let s = 0; s < k; s++) pts.push(P(gx + s, gy));
    for (let s = 0; s < k; s++) pts.push(P(gx + k, gy + s));
    for (let s = 0; s < k; s++) pts.push(P(gx + k - s, gy + k));
    for (let s = 0; s < k; s++) pts.push(P(gx, gy + k - s));
    p.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < pts.length; j++) p.lineTo(pts[j][0], pts[j][1]);
    p.closePath();
  }
  return p;
}

// ------------------------------------------------------------------ sky
const SKIES = {
  desert:  { top: '#9fc0d6', bottom: '#f1d8ae', sun: '#fff1cf', far: '#c99b74', mid: '#b47a52', near: '#8e5636', shape: 'mesa' },
  sea:     { top: '#9dbbd0', bottom: '#e5e3d6', sun: '#fffbe9', far: '#a9b9bd', mid: '#d9d4c3', near: '#7d96a3', shape: 'sea' },
  jungle:  { top: '#a9c4c0', bottom: '#e3e2c8', sun: '#fff6dc', far: '#8fa38c', mid: '#5f7a52', near: '#3f5536', shape: 'canopy' },
  tundra:  { top: '#aec3d4', bottom: '#eef0ee', sun: '#ffffff', far: '#c4cfd8', mid: '#e8ecef', near: '#8d9aa5', shape: 'peaks' },
  volcano: { top: '#b7aaa4', bottom: '#e9d2b8', sun: '#ffe2bd', far: '#9a8a84', mid: '#6f625e', near: '#4a403d', shape: 'volcano' },
};

function ridge(w, seed, base, rough, step = 4) {
  const pts = [];
  for (let x = 0; x <= w + step; x += step) pts.push([x, base + (fbm(x / (w * 0.18), 0.5, seed, 4) - 0.5) * rough]);
  return pts;
}

/** Paint the landscape above the dig into a w x h box. */
export function paintSky(ctx, w, h, regionId, seed) {
  const k = SKIES[regionId] || SKIES.desert;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, k.top);
  g.addColorStop(1, k.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // soft sun glow
  const sx = w * 0.78, sy = h * 0.32;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.9);
  sg.addColorStop(0, k.sun);
  sg.addColorStop(0.08, k.sun + 'cc');
  sg.addColorStop(0.3, 'rgba(255,240,210,0.25)');
  sg.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  // a few soft clouds
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 0.27 + (seed % 97) / 97) % 1) * w, cy = h * (0.15 + 0.12 * (i % 2));
    for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.ellipse(cx + j * h * 0.12, cy + Math.sin(j * 2) * h * 0.03, h * 0.14, h * 0.05, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  const fill = (pts, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };
  if (k.shape === 'mesa') {
    fill(ridge(w, seed, h * 0.62, h * 0.25).map(([x, y]) => [x, Math.max(h * 0.48, y)]), k.far);
    // flat-topped buttes
    ctx.fillStyle = k.mid;
    for (const [a, b, top] of [[0.05, 0.3, 0.42], [0.55, 0.72, 0.5]]) {
      ctx.beginPath();
      ctx.moveTo(w * (a - 0.05), h);
      ctx.lineTo(w * a, h * top + 2);
      for (let x = a; x <= b; x += 0.01) ctx.lineTo(w * x, h * top + (fbm(x * 30, 1, seed + 5, 2) - 0.5) * 3);
      ctx.lineTo(w * (b + 0.04), h);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = top + 0.06; y < 0.95; y += 0.08) ctx.fillRect(w * a, h * y, w * (b - a), 1.5);
      ctx.fillStyle = k.mid;
    }
    fill(ridge(w, seed + 2, h * 0.88, h * 0.12), k.near);
  } else if (k.shape === 'sea') {
    fill(ridge(w, seed, h * 0.66, h * 0.06), k.far);
    ctx.fillStyle = '#7f9fb0';
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = h * 0.7; y < h; y += 4) ctx.fillRect((fbm(y, 2, seed, 2) * w) % w, y, w * 0.2, 1);
    // chalk headland
    ctx.fillStyle = k.mid;
    ctx.beginPath();
    ctx.moveTo(w * 0.52, h);
    ctx.lineTo(w * 0.6, h * 0.42);
    for (let x = 0.6; x <= 1.01; x += 0.01) ctx.lineTo(w * x, h * (0.4 + (fbm(x * 12, 3, seed + 3, 3) - 0.5) * 0.12));
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let x = 0.62; x < 1; x += 0.03) ctx.fillRect(w * x, h * 0.48, 1.5, h * 0.5);
    ctx.fillStyle = '#7d8f5c';
    ctx.fillRect(w * 0.6, h * 0.38, w * 0.4, 3);
  } else if (k.shape === 'canopy') {
    fill(ridge(w, seed, h * 0.55, h * 0.3), k.far);
    const canopy = (base, size, color, sd) => {
      ctx.fillStyle = color;
      for (let x = -size; x < w + size; x += size * 0.7) {
        const y = base + (hash2(Math.round(x), 1, sd) - 0.5) * size * 0.8;
        ctx.beginPath(); ctx.arc(x, y, size * (0.6 + hash2(Math.round(x), 2, sd) * 0.4), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillRect(0, base, w, h - base);
    };
    canopy(h * 0.62, h * 0.18, k.mid, seed + 1);
    canopy(h * 0.86, h * 0.14, k.near, seed + 2);
  } else if (k.shape === 'peaks') {
    const far = ridge(w, seed, h * 0.5, h * 0.7, 3);
    fill(far, k.far);
    // snow caps on the high points
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, h); for (const [x, y] of far) ctx.lineTo(x, y); ctx.lineTo(w, h); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 0, w, h * 0.42);
    ctx.restore();
    fill(ridge(w, seed + 4, h * 0.82, h * 0.2), k.mid);
    fill(ridge(w, seed + 6, h * 0.94, h * 0.08), k.near);
  } else if (k.shape === 'volcano') {
    fill(ridge(w, seed, h * 0.7, h * 0.2), k.far);
    // the cone, with a lazy plume of steam
    ctx.fillStyle = k.mid;
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h);
    ctx.quadraticCurveTo(w * 0.3, h * 0.55, w * 0.36, h * 0.3);
    ctx.lineTo(w * 0.44, h * 0.3);
    ctx.quadraticCurveTo(w * 0.5, h * 0.55, w * 0.7, h);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(w * (0.4 + i * 0.03), h * (0.24 - i * 0.04), h * (0.05 + i * 0.015), 0, Math.PI * 2); ctx.fill(); }
    fill(ridge(w, seed + 3, h * 0.9, h * 0.1), k.near);
  }
  // haze at the horizon
  const hz = ctx.createLinearGradient(0, h * 0.6, 0, h);
  hz.addColorStop(0, 'rgba(255,245,225,0)');
  hz.addColorStop(1, 'rgba(255,245,225,0.12)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, 0, w, h);
}

/** A small tileable noise canvas, for paper / plaster / felt grain. */
let grainTile = null;
export function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const d = x.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const px = i % 128, py = (i / 128) | 0;
    const v = 128 + (hash2(px, py, 7) - 0.5) * 60 + (vnoise(px / 8, py / 8, 3) - 0.5) * 40;
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
    d.data[i * 4 + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  grainTile = c;
  return c;
}
