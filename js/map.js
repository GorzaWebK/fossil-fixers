// The expedition map: a sketched map on kraft card, with a pinned paper note
// for every dig site. Built as SVG so it stays sharp at any size.

import { makeRng } from './rng.js';
import { regionUnlocked, siteUnlocked, totalStars } from './save.js';

const VW = 1000;
const VH = 620;
const X = (p) => (p / 100) * VW;
const Y = (p) => (p / 100) * VH;
const INK = '#1d2b4a';

function wobble(points, rng, amt = 3, closed = true) {
  const pts = points.map(([x, y]) => [x + (rng() - 0.5) * amt, y + (rng() - 0.5) * amt]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    d += ` Q${((px + x) / 2 + (rng() - 0.5) * amt).toFixed(1)} ${((py + y) / 2 + (rng() - 0.5) * amt).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return closed ? d + ' Z' : d;
}

function blob(cx, cy, rx, ry, rng, n = 14) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.8 + rng() * 0.35;
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  pts.push(pts[0]);
  return wobble(pts, rng, 4);
}

function regionArt(id, cx, cy, rng) {
  const s = [];
  if (id === 'desert') {
    for (const [dx, dy, w, h] of [[-70, 10, 60, 34], [10, -12, 70, 44], [60, 26, 44, 24]]) {
      s.push(`<path d="${wobble([[cx + dx, cy + dy], [cx + dx + 8, cy + dy - h], [cx + dx + w - 8, cy + dy - h], [cx + dx + w, cy + dy]], rng, 2, false)}" fill="#e2c48a" stroke="${INK}" stroke-width="2.4"/>`);
      s.push(`<path d="M${cx + dx + 10} ${cy + dy - h * 0.5}h${w - 20}" stroke="${INK}" stroke-width="1.2" opacity=".5"/>`);
    }
    s.push(`<path d="M${cx - 10} ${cy + 30}v-26M${cx - 10} ${cy + 14}h-8v-8M${cx - 10} ${cy + 10}h7v-9" fill="none" stroke="#55572b" stroke-width="3" stroke-linecap="round"/>`);
  } else if (id === 'sea') {
    s.push(`<path d="${wobble([[cx - 90, cy - 10], [cx - 40, cy - 30], [cx + 10, cy - 24], [cx + 60, cy - 36], [cx + 60, cy - 6], [cx - 90, cy + 6]], rng, 3)}" fill="#ebe4d0" stroke="${INK}" stroke-width="2.4"/>`);
    for (let k = 0; k < 4; k++) s.push(`<path d="M${cx - 80 + k * 40} ${cy + 26} q10 -8 20 0 t20 0" fill="none" stroke="#3b5f7a" stroke-width="2.2" stroke-linecap="round"/>`);
    s.push(`<path d="M${cx + 76} ${cy - 4}l4 -40h10l4 40z" fill="#f2e8cf" stroke="${INK}" stroke-width="2.2"/><rect x="${cx + 79}" y="${cy - 52}" width="12" height="9" fill="#c25a1c" stroke="${INK}" stroke-width="2"/>`);
  } else if (id === 'jungle') {
    s.push(`<path d="${wobble([[cx - 110, cy + 40], [cx - 50, cy + 14], [cx, cy + 30], [cx + 50, cy + 6], [cx + 110, cy + 20]], rng, 6, false)}" fill="none" stroke="#5d7d8a" stroke-width="10" stroke-linecap="round" opacity=".7"/>`);
    for (const [dx, dy] of [[-70, -20], [-30, -36], [20, -24], [64, -30], [-50, 52], [40, 50]]) {
      s.push(`<path d="M${cx + dx} ${cy + dy + 20}v-16" stroke="${INK}" stroke-width="2.2"/><path d="${blob(cx + dx, cy + dy - 6, 16, 12, rng, 9)}" fill="#8a8a52" stroke="${INK}" stroke-width="2"/>`);
    }
  } else if (id === 'tundra') {
    s.push(`<path d="${wobble([[cx - 110, cy + 30], [cx - 60, cy - 30], [cx - 30, cy + 4], [cx + 10, cy - 46], [cx + 60, cy + 10], [cx + 90, cy - 20], [cx + 120, cy + 30]], rng, 3, false)}" fill="#eef0ea" stroke="${INK}" stroke-width="2.4"/>`);
    s.push(`<path d="M${cx - 6} ${cy - 30}l16 -16 16 18M${cx - 72} ${cy - 18}l12 -12 12 14" fill="none" stroke="${INK}" stroke-width="1.6"/>`);
    for (const [dx, dy] of [[-90, -40], [70, -44], [100, 10]]) s.push(`<path d="M${cx + dx - 7} ${cy + dy}h14M${cx + dx - 4} ${cy + dy - 6}l8 12M${cx + dx + 4} ${cy + dy - 6}l-8 12" stroke="#5d7d8a" stroke-width="2" stroke-linecap="round"/>`);
  } else if (id === 'volcano') {
    for (const [dx, w, h] of [[-50, 90, 60], [40, 70, 42]]) {
      s.push(`<path d="${wobble([[cx + dx - w / 2, cy + 30], [cx + dx - 10, cy + 30 - h], [cx + dx + 10, cy + 30 - h], [cx + dx + w / 2, cy + 30]], rng, 2, false)}" fill="#9c958c" stroke="${INK}" stroke-width="2.4"/>`);
    }
    for (let k = 0; k < 3; k++) s.push(`<circle cx="${cx - 48 + k * 8}" cy="${cy - 42 - k * 12}" r="${6 + k * 3}" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".55"/>`);
  }
  return s.join('');
}

/**
 * Build the map. Returns an SVG string. Site notes carry data-site; regions with no
 * open sites get a masking-tape "closed" label.
 */
export function buildMap(data, save) {
  const rng = makeRng('expedition-map');
  const out = [];
  out.push(`<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Expedition map" preserveAspectRatio="xMidYMid meet">`);
  out.push(`<defs><pattern id="mapgrid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="${INK}" stroke-opacity=".08" stroke-width="1"/></pattern></defs>`);
  // paper with a torn edge
  const edge = [];
  for (let x = 10; x <= VW - 10; x += 25) edge.push([x, 10 + rng() * 6]);
  for (let y = 10; y <= VH - 10; y += 25) edge.push([VW - 10 - rng() * 6, y]);
  for (let x = VW - 10; x >= 10; x -= 25) edge.push([x, VH - 10 - rng() * 6]);
  for (let y = VH - 10; y >= 10; y -= 25) edge.push([10 + rng() * 6, y]);
  const edgeD = 'M' + edge.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ' Z';
  out.push(`<path d="${edgeD}" fill="#dcc093" stroke="#a9834d" stroke-width="2" transform="translate(3 5)" opacity=".7"/>`);
  out.push(`<path d="${edgeD}" fill="#e6cf9f"/><path d="${edgeD}" fill="url(#mapgrid)"/>`);
  // sea along the bottom right
  out.push(`<path d="${wobble([[520, 600], [560, 520], [700, 560], [860, 470], [990, 430], [990, 610], [520, 610]], rng, 8)}" fill="#a9bfc4" opacity=".55"/>`);
  for (let k = 0; k < 7; k++) {
    const x = 640 + k * 50 + rng() * 20;
    const y = 570 - k * 12 + rng() * 14;
    out.push(`<path d="M${x} ${y} q8 -7 16 0 t16 0" fill="none" stroke="#3b5f7a" stroke-width="2" stroke-linecap="round" opacity=".7"/>`);
  }
  // the land outline
  out.push(`<path d="${wobble([[40, 520], [60, 300], [140, 140], [300, 60], [520, 40], [720, 70], [900, 150], [960, 300], [880, 440], [720, 540], [560, 520], [420, 580], [200, 590]], rng, 14)}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-dasharray="1 0" opacity=".85"/>`);
  // coffee ring
  out.push(`<circle cx="880" cy="90" r="52" fill="none" stroke="#6e421c" stroke-opacity=".2" stroke-width="7"/><circle cx="884" cy="93" r="46" fill="none" stroke="#6e421c" stroke-opacity=".1" stroke-width="3"/>`);
  // expedition route
  const route = data.regions.map((r) => [X(r.map.x), Y(r.map.y)]);
  out.push(`<path d="${wobble(route, rng, 10, false)}" fill="none" stroke="#c25a1c" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>`);

  const stars = totalStars(save, data);
  for (const region of data.regions) {
    const cx = X(region.map.x);
    const cy = Y(region.map.y);
    const open = regionUnlocked(save, data, region.id);
    out.push(`<g class="map-region" opacity="${open ? 1 : 0.55}">${regionArt(region.id, cx, cy, rng)}</g>`);
    out.push(`<text x="${cx}" y="${cy + 72}" text-anchor="middle" font-family="Kalam, cursive" font-weight="700" font-size="26" fill="${INK}" stroke="#e6cf9f" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${region.name}</text>`);
    if (!open) {
      out.push(`<g transform="translate(${cx} ${cy}) rotate(-6)"><path d="M-92 -18 L88 -22 L94 18 L-88 22 Z" fill="#f0e2ba" opacity=".95"/><text x="0" y="7" text-anchor="middle" font-family="Courier Prime, monospace" font-weight="700" font-size="17" fill="#8e3f12">CLOSED · NEED ★${region.stars}</text></g>`);
    }
  }
  // the pinned notes
  for (const region of data.regions) {
    region.sites.forEach((site, i) => {
      const x = X(site.map.x);
      const y = Y(site.map.y);
      const can = siteUnlocked(save, data, site.id);
      const rec = save.sites[site.id];
      const rot = ((i * 37 + region.id.length * 11) % 13) - 6;
      const label = site.creature === 'bonebed' ? 'B' : String(i + 1);
      out.push(`<g class="map-note${can ? '' : ' locked'}" data-site="${site.id}" tabindex="${can ? 0 : -1}" role="button" aria-label="${site.name}${can ? '' : ' (locked)'}${rec?.done ? ', dug' : ''}" transform="translate(${x} ${y}) rotate(${rot})">`);
      out.push(`<line x1="0" y1="-18" x2="${(i % 2 ? 1 : -1) * 6}" y2="-30" stroke="${INK}" stroke-width="1" opacity=".5"/>`);
      out.push(`<rect class="note-paper" x="-20" y="-18" width="40" height="38" fill="${can ? '#f2e8cf' : '#cfc3a5'}" stroke="${INK}" stroke-width="1.6"/>`);
      out.push(`<path d="M-14 6h28M-14 12h20" stroke="${INK}" stroke-width="1" opacity=".35"/>`);
      out.push(`<text x="0" y="4" text-anchor="middle" font-family="Kalam, cursive" font-weight="700" font-size="22" fill="${can ? INK : '#6b6455'}">${label}</text>`);
      out.push(`<circle cx="0" cy="-18" r="6" fill="${can ? '#c25a1c' : '#8a8273'}" stroke="${INK}" stroke-width="1.5"/><circle cx="-2" cy="-20" r="1.8" fill="#fff" opacity=".7"/>`);
      if (rec?.done) out.push(`<g transform="translate(14 14) rotate(-14)"><circle r="10" fill="none" stroke="#55572b" stroke-width="2.4"/><path d="M-5 0l3 4 7-8" fill="none" stroke="#55572b" stroke-width="2.6" stroke-linecap="round"/></g>`);
      out.push('</g>');
    });
  }
  out.push(`<text x="40" y="${VH - 30}" font-family="Courier Prime, monospace" font-size="15" fill="${INK}" opacity=".75">Visitors so far: ★ ${stars}</text>`);
  out.push('</svg>');
  return out.join('');
}
