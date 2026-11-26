// Draws fossil bones in code. Every bone in data/creatures.json has a `type`
// (skull, jaw, neck, spine, ribs, hip, shoulder, tail, limb, foot, hand, plate,
// spikes, club, flipper, wing) plus a length `len`, a width `w` and optional
// params `p`. A bone is drawn centred on (0, 0) in its own frame, pointing
// along +x, then placed at (x, y) with rotation `rot` (degrees) in the
// creature's 200 x 120 skeleton frame (the creature faces right).
//
// Shapes are built as filled outlines plus thick strokes. They're inked first
// with a wide navy stroke and then filled in bone colour, so overlapping parts
// share one clean outline, like a single sketched shape.

export const INK = '#1d2b4a';
export const BONE = '#f2e8cf';
export const BONE_CRACKED = '#ddcfae';

function makeShape() {
  return { fills: [], strokes: [], details: [] };
}

// Smooth closed outline through points [[x, y], ...] (quadratic curves through midpoints).
function smoothPoly(pts) {
  const p = new Path2D();
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const m = mid(c, pts[(i + 1) % n]);
    p.quadraticCurveTo(c[0], c[1], m[0], m[1]);
  }
  p.closePath();
  return p;
}

// Straight-edged outline with rounded corners: crisper than smoothPoly, more like a sketch.
function roundPoly(pts, r) {
  const p = new Path2D();
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const nx = pts[(i + 1) % n];
    const m = mid(c, nx);
    const rr = Math.min(r, Math.hypot(c[0] - m[0], c[1] - m[1]) * 0.9, Math.hypot(c[0] - m0[0], c[1] - m0[1]) * 0.9);
    p.arcTo(c[0], c[1], m[0], m[1], Math.max(0.01, rr));
  }
  p.closePath();
  return p;
}

function ellipse(cx, cy, rx, ry, rot = 0) {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  return p;
}

function line(pts) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  return p;
}

function curve(a, c, b) {
  const p = new Path2D();
  p.moveTo(a[0], a[1]);
  p.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  return p;
}

// A chain of vertebrae from x0 to x1 along y(t), sizes from s0 to s1.
function vertebrae(sh, L, W, { n, s0, s1, yOf, spine = 0, spineLean = -0.25 }) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = -L / 2 + (L * (i + 0.5)) / n;
    const s = s0 + (s1 - s0) * t;
    const y = yOf(t);
    const bw = (L / n) * 0.46;
    sh.fills.push(ellipse(x, y, bw, s * 0.5));
    if (spine > 0) {
      const h = spine * s * (1 - 0.15 * Math.abs(t - 0.5));
      sh.strokes.push({ path: line([[x, y], [x + spineLean * h, y - h]]), w: Math.max(1.2, bw * 0.55) });
    }
  }
}

const TYPES = {
  limb(L, W) {
    const sh = makeShape();
    const r = W * 0.32;
    sh.fills.push(smoothPoly([[-L / 2 + r, -W * 0.22], [L / 2 - r, -W * 0.2], [L / 2 - r, W * 0.2], [-L / 2 + r, W * 0.22]]));
    for (const sx of [-1, 1]) {
      const ex = sx * (L / 2 - r);
      sh.fills.push(ellipse(ex, -W * 0.16, r, r * 0.95));
      sh.fills.push(ellipse(ex, W * 0.16, r, r * 0.95));
    }
    sh.details.push(line([[-L * 0.25, 0], [L * 0.25, 0]]));
    return sh;
  },

  skull(L, W, p = {}) {
    const sh = makeShape();
    const sn = p.snout ?? 0.5; // 0 short, 1 long
    const u = (x) => x * L;
    const v = (y) => y * W;
    const tip = 0.5;
    const brow = 0.05 - sn * 0.12;
    const pts = [
      [u(-0.5), v(0.2)], [u(-0.48), v(-0.22)], [u(-0.3), v(-0.46)], [u(-0.08), v(-0.5)], [u(brow + 0.08), v(-0.36)],
      [u(tip - 0.03), v(p.beak ? 0.0 : -0.14)], [u(tip), v(p.beak ? 0.22 : 0.08)],
      [u(0.2), v(0.28)], [u(-0.1), v(0.36)], [u(-0.32), v(0.46)],
    ];
    sh.fills.push(roundPoly(pts, Math.min(L, W) * 0.12));
    const crest = p.crest || 'none';
    if (crest === 'tube') {
      sh.strokes.push({ path: curve([u(-0.1), v(-0.38)], [u(-0.55), v(-0.95)], [u(-0.95), v(-0.8)]), w: W * 0.22 });
    } else if (crest === 'dome') {
      sh.fills.push(ellipse(u(-0.18), v(-0.36), u(0.3), v(0.34)));
      for (let i = 0; i < 5; i++) sh.fills.push(ellipse(u(-0.46 + i * 0.06), v(-0.05 - i * 0.07), W * 0.06, W * 0.06));
    } else if (crest === 'fan') {
      sh.fills.push(smoothPoly([[u(-0.15), v(-0.4)], [u(-0.2), v(-0.85)], [u(0.05), v(-0.95)], [u(0.12), v(-0.38)]]));
      for (let i = 0; i < 3; i++) sh.details.push(line([[u(-0.12 + i * 0.08), v(-0.45)], [u(-0.15 + i * 0.1), v(-0.85)]]));
    } else if (crest === 'blade') {
      sh.fills.push(smoothPoly([[u(-0.3), v(-0.4)], [u(-0.95), v(-0.75)], [u(-0.85), v(-0.55)], [u(-0.4), v(-0.1)]]));
    } else if (crest === 'frill' || crest === 'horns' || crest === 'boss') {
      // Neck frill behind the skull
      sh.fills.push(smoothPoly([[u(-0.25), v(-0.1)], [u(-0.62), v(-0.75)], [u(-0.4), v(-1.0)], [u(-0.05), v(-0.75)], [u(0.0), v(-0.3)]]));
      for (let i = 0; i < 4; i++) sh.fills.push(ellipse(u(-0.6 + i * 0.16), v(-0.82 - (i % 2) * 0.1), W * 0.06, W * 0.06));
      sh.details.push(ellipse(u(-0.33), v(-0.6), u(0.08), v(0.14)));
    }
    if (crest === 'horns') {
      sh.fills.push(roundPoly([[u(-0.1), v(-0.34)], [u(0.34), v(-1.15)], [u(0.1), v(-0.3)]], W * 0.04));
      sh.fills.push(roundPoly([[u(0.3), v(-0.1)], [u(0.43), v(-0.62)], [u(0.46), v(-0.06)]], W * 0.03));
    }
    if (crest === 'boss') {
      sh.fills.push(ellipse(u(0.22), v(-0.25), u(0.14), v(0.16)));
    }
    if (crest === 'spikes') {
      // Armoured skull: little horn knobs at the back corners
      sh.fills.push(smoothPoly([[u(-0.42), v(-0.3)], [u(-0.62), v(-0.5)], [u(-0.35), v(-0.42)]]));
      sh.fills.push(smoothPoly([[u(-0.45), v(0.2)], [u(-0.66), v(0.38)], [u(-0.38), v(0.32)]]));
    }
    // eye socket, window, nostril
    const eye = p.eye ?? 0.13;
    sh.details.push(ellipse(u(-0.18), v(-0.14), W * eye * 1.1, W * eye));
    if (p.window !== false) sh.details.push(ellipse(u(0.08 + sn * 0.05), v(-0.02), u(0.08), v(0.1)));
    sh.details.push(ellipse(u(0.4), v(-0.03), W * 0.04, W * 0.03));
    if (p.teeth) {
      const pts2 = [];
      const n = Math.max(3, Math.round(L / 6));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = u(-0.05 + t * 0.52);
        const y = v(0.32 - t * 0.18);
        pts2.push([x, y], [x + L * 0.25 / n, y + W * 0.12]);
      }
      sh.details.push(line(pts2));
    }
    return sh;
  },

  jaw(L, W, p = {}) {
    const sh = makeShape();
    sh.fills.push(roundPoly([[-L / 2, -W * 0.35], [L / 2, -W * 0.15], [L / 2, W * 0.12], [L * 0.1, W * 0.38], [-L * 0.3, W * 0.5], [-L / 2, W * 0.3]], W * 0.2));
    if (p.teeth) {
      const pts = [];
      const n = Math.max(3, Math.round(L / 6));
      for (let i = 0; i <= n; i++) {
        const x = -L * 0.3 + (L * 0.75 * i) / n;
        pts.push([x, -W * 0.22], [x + (L * 0.37) / n, -W * 0.62]);
      }
      sh.strokes.push({ path: line(pts), w: 1.2 });
    }
    sh.details.push(line([[-L * 0.35, W * 0.1], [L * 0.3, 0]]));
    return sh;
  },

  neck(L, W, p = {}) {
    const sh = makeShape();
    const bend = p.bend ?? 0.15;
    const n = Math.max(3, Math.round(L / 9));
    vertebrae(sh, L, W, { n, s0: W * 0.75, s1: W * 0.55, yOf: (t) => -bend * W * Math.sin(Math.PI * t), spine: 0.35 });
    return sh;
  },

  spine(L, W, p = {}) {
    const sh = makeShape();
    const n = Math.max(3, Math.round(L / 8));
    const sail = p.sail ?? 0.5;
    vertebrae(sh, L, W, { n, s0: W * 0.4, s1: W * 0.4, yOf: () => W * 0.28, spine: 0.9 + sail * 2.4, spineLean: -0.1 });
    return sh;
  },

  tail(L, W, p = {}) {
    const sh = makeShape();
    const n = Math.max(3, Math.round(L / 7));
    const droop = p.droop ?? 0;
    vertebrae(sh, L, W, { n, s0: W * (p.thin ?? 0.35), s1: W * 0.85, yOf: (t) => droop * W * (1 - t), spine: 0.45, spineLean: -0.3 });
    return sh;
  },

  ribs(L, W, p = {}) {
    const sh = makeShape();
    const n = p.n ?? Math.max(4, Math.round(L / 7));
    sh.strokes.push({ path: line([[-L / 2, -W / 2 + 1], [L / 2, -W / 2 + 1]]), w: 2.4 });
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 3 + ((L - 6) * i) / (n - 1);
      const depth = W * (0.55 + 0.45 * Math.sin(Math.PI * ((i + 0.5) / n)));
      sh.strokes.push({ path: curve([x, -W / 2 + 1], [x + L * 0.12, -W / 2 + depth * 0.6], [x - L * 0.04, -W / 2 + depth]), w: Math.max(1.6, L / n * 0.28) });
    }
    return sh;
  },

  hip(L, W) {
    const sh = makeShape();
    sh.fills.push(smoothPoly([[-L / 2, -W * 0.1], [-L * 0.35, -W * 0.5], [L * 0.35, -W * 0.5], [L / 2, -W * 0.1], [L * 0.1, W * 0.05], [-L * 0.1, W * 0.05]]));
    sh.strokes.push({ path: line([[L * 0.1, 0], [L * 0.42, W * 0.48]]), w: W * 0.16 });
    sh.strokes.push({ path: line([[-L * 0.1, 0], [-L * 0.35, W * 0.45]]), w: W * 0.16 });
    sh.details.push(ellipse(0, -W * 0.05, W * 0.14, W * 0.14));
    return sh;
  },

  shoulder(L, W) {
    const sh = makeShape();
    sh.fills.push(smoothPoly([[-L / 2, -W * 0.3], [L * 0.2, -W * 0.18], [L * 0.2, W * 0.18], [-L / 2, W * 0.3]]));
    sh.fills.push(ellipse(L * 0.3, 0, L * 0.2, W * 0.42));
    sh.details.push(ellipse(L * 0.32, 0, W * 0.1, W * 0.1));
    return sh;
  },

  foot(L, W, p = {}) {
    const sh = makeShape();
    const toes = p.toes ?? 3;
    sh.fills.push(ellipse(-L * 0.32, 0, L * 0.18, W * 0.35));
    for (let i = 0; i < toes; i++) {
      const spread = toes === 1 ? 0 : (i / (toes - 1) - 0.5) * W * 0.7;
      sh.strokes.push({ path: curve([-L * 0.25, 0], [L * 0.1, spread], [L * 0.34, spread * 0.8 + W * 0.15]), w: W * 0.2 });
      sh.fills.push(smoothPoly([[L * 0.3, spread * 0.8 + W * 0.02], [L * 0.5, spread * 0.8 + W * 0.3], [L * 0.32, spread * 0.8 + W * 0.3]]));
    }
    return sh;
  },

  hand(L, W, p = {}) {
    const sh = makeShape();
    const fingers = p.fingers ?? 2;
    sh.strokes.push({ path: line([[-L / 2, 0], [-L * 0.05, 0]]), w: W * 0.3 });
    for (let i = 0; i < fingers; i++) {
      const s = fingers === 1 ? 0 : (i / (fingers - 1) - 0.5) * W * 0.8;
      sh.strokes.push({ path: curve([-L * 0.05, 0], [L * 0.2, s], [L * 0.32, s + W * 0.1]), w: W * 0.18 });
      sh.fills.push(smoothPoly([[L * 0.28, s - W * 0.05], [L * 0.5, s + W * 0.35], [L * 0.3, s + W * 0.22]]));
    }
    return sh;
  },

  plate(L, W) {
    const sh = makeShape();
    sh.fills.push(roundPoly([[-L / 2, W * 0.4], [-L * 0.2, -W * 0.1], [L * 0.05, -W * 0.5], [L * 0.3, -W * 0.05], [L / 2, W * 0.4]], W * 0.08));
    sh.details.push(line([[0, W * 0.35], [L * 0.04, -W * 0.3]]));
    return sh;
  },

  spikes(L, W, p = {}) {
    const sh = makeShape();
    const n = p.n ?? 3;
    sh.strokes.push({ path: line([[-L / 2, W * 0.35], [L / 2, W * 0.35]]), w: W * 0.2 });
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (L * (i + 0.5)) / n;
      sh.fills.push(smoothPoly([[x - L / n * 0.3, W * 0.35], [x + L / n * 0.25, -W * 0.5], [x + L / n * 0.3, W * 0.35]]));
    }
    return sh;
  },

  club(L, W) {
    const sh = makeShape();
    sh.strokes.push({ path: line([[-L / 2, 0], [L * 0.1, 0]]), w: W * 0.28 });
    sh.fills.push(ellipse(L * 0.25, -W * 0.18, L * 0.22, W * 0.32));
    sh.fills.push(ellipse(L * 0.25, W * 0.18, L * 0.22, W * 0.32));
    sh.details.push(line([[L * 0.08, 0], [L * 0.45, 0]]));
    return sh;
  },

  flipper(L, W) {
    const sh = makeShape();
    sh.fills.push(smoothPoly([[-L / 2, -W * 0.3], [-L * 0.1, -W * 0.5], [L * 0.35, -W * 0.25], [L / 2, 0], [L * 0.3, W * 0.25], [-L * 0.2, W * 0.45], [-L / 2, W * 0.3]]));
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) {
        sh.details.push(ellipse(-L * 0.15 + i * L * 0.14, (r - 1) * W * 0.22, L * 0.035, W * 0.07));
      }
    }
    return sh;
  },

  wing(L, W) {
    const sh = makeShape();
    sh.strokes.push({ path: curve([-L / 2, 0], [0, -W * 0.5], [L / 2, -W * 0.1]), w: W * 0.35 });
    sh.fills.push(ellipse(-L / 2 + W * 0.3, 0, W * 0.38, W * 0.38));
    sh.details.push(line([[-L * 0.3, -W * 0.1], [L * 0.2, -W * 0.25]]));
    return sh;
  },
};

export const BONE_TYPES = Object.keys(TYPES);

// Shapes are cached by type + size + params, since the same bone is drawn every frame.
const cache = new Map();
function shapeFor(b) {
  const key = `${b.type}|${b.len}|${b.w}|${JSON.stringify(b.p || {})}`;
  let sh = cache.get(key);
  if (!sh) {
    const fn = TYPES[b.type] || TYPES.limb;
    sh = fn(b.len, b.w, b.p || {});
    cache.set(key, sh);
  }
  return sh;
}

/**
 * Draw one bone in its own frame (centred, unrotated).
 * opts: { fill, ink, outline (px), cracked, ghost, dashed, alpha }
 */
export function drawBoneLocal(ctx, b, opts = {}) {
  const sh = shapeFor(b);
  const ink = opts.ink || INK;
  const ow = opts.outline ?? 1.2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (opts.ghost) {
    // A faint sketch of the outline you build onto: ink edge, paper inside.
    const paper = opts.paper || BONE;
    ctx.strokeStyle = ink;
    ctx.lineWidth = ow * 2;
    for (const f of sh.fills) ctx.stroke(f);
    for (const s of sh.strokes) { ctx.lineWidth = s.w + ow * 2; ctx.stroke(s.path); }
    ctx.fillStyle = paper;
    ctx.strokeStyle = paper;
    for (const f of sh.fills) ctx.fill(f);
    for (const s of sh.strokes) { ctx.lineWidth = s.w; ctx.stroke(s.path); }
    if (opts.dashed) {
      // knock gaps into the edge so it reads as a dashed pencil outline
      ctx.setLineDash([1.2 * ow, 2.8 * ow]);
      ctx.strokeStyle = paper;
      ctx.lineWidth = ow * 2.2;
      for (const f of sh.fills) ctx.stroke(f);
      ctx.setLineDash([]);
    }
    ctx.restore();
    return;
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = ow * 2;
  for (const f of sh.fills) ctx.stroke(f);
  for (const s of sh.strokes) {
    ctx.lineWidth = s.w + ow * 2;
    ctx.stroke(s.path);
  }
  const fill = opts.fill || (opts.cracked ? BONE_CRACKED : BONE);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  for (const f of sh.fills) ctx.fill(f);
  for (const s of sh.strokes) {
    ctx.lineWidth = s.w;
    ctx.stroke(s.path);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(0.6, ow * 0.6);
  ctx.globalAlpha *= 0.7;
  for (const d of sh.details) ctx.stroke(d);
  if (opts.cracked) {
    // A jagged crack across the middle
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.5);
    ctx.lineWidth = Math.max(0.8, ow * 0.8);
    const L = b.len;
    const W = b.w;
    ctx.stroke(line([[-L * 0.05, -W * 0.45], [L * 0.04, -W * 0.15], [-L * 0.04, W * 0.05], [L * 0.06, W * 0.25], [0, W * 0.45]]));
  }
  ctx.restore();
}

/** Draw a bone placed in a skeleton frame: at (b.x, b.y) rotated by rot degrees. */
export function drawBonePlaced(ctx, b, x, y, rotDeg, opts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotDeg * Math.PI) / 180);
  drawBoneLocal(ctx, b, opts);
  ctx.restore();
}

/** Draw a bone scaled to fit a w x h box centred at (cx, cy). Turns it 90 degrees if the box is tall. */
export function drawBoneInBox(ctx, b, cx, cy, w, h, opts = {}) {
  const tall = h > w * 1.2;
  const bw = tall ? h : w;
  const bh = tall ? w : h;
  const ext = boneExtent(b);
  const s = Math.min(bw / ext.w, bh / ext.h) * 0.9;
  ctx.save();
  ctx.translate(cx, cy);
  if (tall) ctx.rotate(Math.PI / 2);
  ctx.scale(s, s);
  ctx.translate(-ext.cx, -ext.cy);
  drawBoneLocal(ctx, b, { ...opts, outline: (opts.outline ?? 1.2) / s });
  ctx.restore();
}

/** Rough size of a bone's drawing (some shapes, like crests, stick out past len x w). */
export function boneExtent(b) {
  let x0 = -b.len / 2;
  let x1 = b.len / 2;
  let y0 = -b.w / 2;
  let y1 = b.w / 2;
  const c = b.p?.crest;
  if (b.type === 'skull') {
    if (c === 'tube' || c === 'blade') { x0 = -b.len * 0.95; y0 = -b.w * 0.95; }
    if (c === 'frill' || c === 'horns' || c === 'boss') { x0 = -b.len * 0.65; y0 = -b.w * 1.05; }
    if (c === 'fan') y0 = -b.w * 0.95;
    if (c === 'dome') y0 = -b.w * 0.7;
    if (c === 'spikes') x0 = -b.len * 0.68;
  }
  if (b.type === 'jaw' && b.p?.teeth) y0 = -b.w * 0.65;
  if (b.type === 'spine') y0 = -b.w * (0.5 + 0.6 * (b.p?.sail ?? 0.5));
  return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, x1, y0, y1 };
}
