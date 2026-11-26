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

function contours(cx, cy, rx, ry, rng, rings, color) {
  const out = [];
  for (let k = rings; k >= 1; k--) {
    const f = k / rings;
    out.push(`<path d="${blob(cx + (rng() - 0.5) * 6, cy + (rng() - 0.5) * 6, rx * f, ry * f, rng, 18)}" fill="${k === 1 ? color : 'none'}" fill-opacity="${k === 1 ? 0.35 : 0}" stroke="#7a5a36" stroke-opacity="${0.35 + 0.1 * (rings - k) / rings}" stroke-width="${k % 3 === 0 ? 1.2 : 0.7}"/>`);
  }
  return out.join('');
}

function regionArt(id, cx, cy, rng) {
  const s = [];
  const ink = 'stroke="#3a2a1a" stroke-width="1" stroke-opacity=".75" fill="none"';
  if (id === 'desert') {
    s.push(contours(cx, cy, 120, 62, rng, 5, '#d9b277'));
    // stipple for sand
    for (let i = 0; i < 90; i++) s.push(`<circle cx="${(cx + (rng() - 0.5) * 220).toFixed(1)}" cy="${(cy + (rng() - 0.5) * 100).toFixed(1)}" r="${(0.6 + rng() * 0.8).toFixed(1)}" fill="#7a5a36" opacity=".45"/>`);
    // mesas drawn with hachures
    for (const [dx, dy, w] of [[-60, -6, 46], [20, 10, 52]]) {
      s.push(`<path d="M${cx + dx} ${cy + dy}h${w}" ${ink} stroke-width="1.4"/>`);
      for (let k = 0; k <= w; k += 4) s.push(`<path d="M${cx + dx + k} ${cy + dy}l${(k - w / 2) / 6} 9" ${ink} stroke-width=".6"/>`);
    }
  } else if (id === 'sea') {
    s.push(contours(cx, cy - 10, 110, 46, rng, 4, '#e6e0cc'));
    // chalk cliff edge with hachures facing the sea
    s.push(`<path d="${wobble([[cx - 100, cy + 4], [cx - 40, cy - 6], [cx + 20, cy + 2], [cx + 100, cy - 10]], rng, 3, false)}" ${ink} stroke-width="1.5"/>`);
    for (let k = -96; k < 100; k += 5) s.push(`<path d="M${cx + k} ${cy + 2 - k * 0.06}l1 7" ${ink} stroke-width=".6"/>`);
  } else if (id === 'jungle') {
    s.push(contours(cx, cy, 120, 58, rng, 4, '#a7ad74'));
    // tree symbols: little scalloped circles
    for (let i = 0; i < 26; i++) {
      const x = cx + (rng() - 0.5) * 210, y = cy + (rng() - 0.5) * 90, r = 4 + rng() * 3;
      s.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#6f7a45" fill-opacity=".35" stroke="#3a2a1a" stroke-width=".7" stroke-opacity=".7"/>`);
    }
  } else if (id === 'tundra') {
    s.push(contours(cx, cy, 130, 56, rng, 7, '#eef0ec'));
    for (const [dx, dy, h] of [[-50, 6, 22], [-10, -8, 30], [40, 4, 20], [80, -4, 16]]) {
      s.push(`<path d="M${cx + dx - h} ${cy + dy + h * 0.5}L${cx + dx} ${cy + dy - h * 0.5}L${cx + dx + h} ${cy + dy + h * 0.5}" ${ink} stroke-width="1.2"/>`);
      for (let k = 2; k < h; k += 3) s.push(`<path d="M${cx + dx + k} ${cy + dy - h * 0.5 + k}l-3 5" ${ink} stroke-width=".55"/>`);
    }
  } else if (id === 'volcano') {
    s.push(contours(cx, cy, 110, 60, rng, 8, '#b4a89c'));
    s.push(`<ellipse cx="${cx - 8}" cy="${cy - 4}" rx="16" ry="9" ${ink} stroke-width="1.4"/>`);
    for (let a = 0; a < Math.PI * 2; a += 0.35) s.push(`<path d="M${(cx - 8 + Math.cos(a) * 16).toFixed(1)} ${(cy - 4 + Math.sin(a) * 9).toFixed(1)}l${(Math.cos(a) * 7).toFixed(1)} ${(Math.sin(a) * 4).toFixed(1)}" ${ink} stroke-width=".6"/>`);
  }
  return s.join('');
}

/**
 * Build the map. Returns an SVG string. Site notes carry data-site; regions with no
 * open sites get a "closed" label.
 */
export function buildMap(data, save) {
  const rng = makeRng('expedition-map');
  const out = [];
  out.push(`<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Expedition map" preserveAspectRatio="xMidYMid meet">`);
  out.push(`<defs>
    <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="4" result="n"/><feColorMatrix in="n" values="0 0 0 0 0.35 0 0 0 0 0.25 0 0 0 0 0.12 0 0 0 0.22 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in"/><feBlend in2="SourceGraphic" mode="multiply"/></filter>
    <filter id="blotch" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.3 0 0 0 0 0.12 0 0 0 0.35 -0.08"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1.5" dy="3" stdDeviation="2" flood-color="#2a1a0a" flood-opacity=".45"/></filter>
    <radialGradient id="burn" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#5a3a18" stop-opacity="0"/><stop offset="100%" stop-color="#5a3a18" stop-opacity=".45"/></radialGradient>
    <radialGradient id="pin" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ffb08a"/><stop offset=".45" stop-color="#c8401c"/><stop offset="1" stop-color="#5e1a06"/></radialGradient>
    <radialGradient id="pinoff" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#d9d4ca"/><stop offset=".5" stop-color="#8d877c"/><stop offset="1" stop-color="#46423b"/></radialGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9bcb8"/><stop offset="1" stop-color="#7f9aa0"/></linearGradient>
  </defs>`);
  // paper with a torn edge, grain, foxing and a darkened border
  const edge = [];
  for (let x = 10; x <= VW - 10; x += 20) edge.push([x, 10 + rng() * 5]);
  for (let y = 10; y <= VH - 10; y += 20) edge.push([VW - 10 - rng() * 5, y]);
  for (let x = VW - 10; x >= 10; x -= 20) edge.push([x, VH - 10 - rng() * 5]);
  for (let y = VH - 10; y >= 10; y -= 20) edge.push([10 + rng() * 5, y]);
  const edgeD = 'M' + edge.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ' Z';
  out.push(`<path d="${edgeD}" fill="#e7d8b8" filter="url(#paper)"/>`);
  out.push(`<path d="${edgeD}" fill="#e7d8b8" filter="url(#blotch)"/>`);
  // graticule
  const grat = [];
  for (let x = 80; x < VW; x += 120) grat.push(`M${x} 14V${VH - 14}`);
  for (let y = 70; y < VH; y += 110) grat.push(`M14 ${y}H${VW - 14}`);
  out.push(`<path d="${grat.join('')}" stroke="#6a4f30" stroke-opacity=".22" stroke-width=".8" fill="none"/>`);
  for (let x = 80, i = 0; x < VW; x += 120, i++) out.push(`<text x="${x + 3}" y="26" font-family="Courier Prime, monospace" font-size="10" fill="#6a4f30" opacity=".7">${12 + i * 4}°E</text>`);
  // sea
  const seaD = wobble([[520, 610], [560, 520], [700, 560], [860, 470], [990, 430], [990, 610]], rng, 6);
  out.push(`<path d="${seaD}" fill="url(#sea)" opacity=".75"/>`);
  out.push(`<path d="${seaD}" fill="none" stroke="#3e5a66" stroke-width="1" stroke-opacity=".6"/>`);
  out.push(`<text x="820" y="560" font-family="Courier Prime, monospace" font-style="italic" font-size="15" letter-spacing="6" fill="#2f4752" opacity=".8">THE SOUND</text>`);
  // coastline of the land
  out.push(`<path d="${wobble([[40, 520], [60, 300], [140, 140], [300, 60], [520, 40], [720, 70], [900, 150], [960, 300], [880, 440], [720, 540], [560, 520], [420, 580], [200, 590]], rng, 10)}" fill="#e2cfa6" fill-opacity=".35" stroke="#3a2a1a" stroke-width="1.3" stroke-opacity=".7"/>`);
  // a river from the tundra down to the sea
  out.push(`<path d="${wobble([[500, 120], [470, 200], [490, 260], [440, 320], [470, 380], [560, 430], [650, 520], [700, 560]], rng, 12, false)}" fill="none" stroke="#4d6f80" stroke-width="2" stroke-opacity=".8" stroke-linecap="round"/>`);

  const stars = totalStars(save, data);
  // expedition route
  const route = data.regions.map((r) => [X(r.map.x), Y(r.map.y)]);
  for (const region of data.regions) {
    const cx = X(region.map.x);
    const cy = Y(region.map.y);
    const open = regionUnlocked(save, data, region.id);
    out.push(`<g class="map-region" opacity="${open ? 1 : 0.6}">${regionArt(region.id, cx, cy, rng)}</g>`);
  }
  out.push(`<path d="${wobble(route, rng, 8, false)}" fill="none" stroke="#9a3b14" stroke-width="1.6" stroke-dasharray="6 5" stroke-linecap="round" opacity=".8"/>`);
  for (const region of data.regions) {
    const cx = X(region.map.x);
    const cy = Y(region.map.y);
    const open = regionUnlocked(save, data, region.id);
    out.push(`<text x="${cx}" y="${cy + 74}" text-anchor="middle" font-family="Courier Prime, monospace" font-weight="700" font-size="17" letter-spacing="4" fill="#2a1f14" stroke="#e7d8b8" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${region.name.toUpperCase()}</text>`);
    if (!open) {
      out.push(`<g transform="translate(${cx} ${cy - 2}) rotate(-5)"><rect x="-92" y="-15" width="184" height="28" rx="2" fill="none" stroke="#8a2f10" stroke-width="2.4" opacity=".85"/><text x="0" y="5" text-anchor="middle" font-family="Courier Prime, monospace" font-weight="700" font-size="15" letter-spacing="2" fill="#8a2f10" opacity=".9">CLOSED · NEED ★${region.stars}</text></g>`);
    }
  }
  // the pinned paper slips
  for (const region of data.regions) {
    region.sites.forEach((site, i) => {
      const x = X(site.map.x);
      const y = Y(site.map.y);
      const can = siteUnlocked(save, data, site.id);
      const rec = save.sites[site.id];
      const rot = ((i * 37 + region.id.length * 11) % 11) - 5;
      const label = site.creature === 'bonebed' ? 'B' : String(i + 1);
      out.push(`<g class="map-note${can ? '' : ' locked'}" data-site="${site.id}" tabindex="${can ? 0 : -1}" role="button" aria-label="${site.name}${can ? '' : ' (locked)'}${rec?.done ? ', dug' : ''}" transform="translate(${x} ${y}) rotate(${rot})">`);
      out.push(`<g filter="url(#drop)"><rect class="note-paper" x="-19" y="-16" width="38" height="36" rx="1" fill="${can ? '#f6efdf' : '#cfc6b2'}" stroke="#6a4f30" stroke-opacity=".35" stroke-width="1"/></g>`);
      out.push(`<path d="M-13 9h26M-13 14h18" stroke="#6a8aa8" stroke-width=".7" opacity=".6"/>`);
      out.push(`<text x="0" y="5" text-anchor="middle" font-family="Kalam, cursive" font-weight="700" font-size="20" fill="${can ? '#1c2740' : '#6b6455'}">${label}</text>`);
      out.push(`<line x1="0" y1="-16" x2="2.5" y2="-11" stroke="#3a3a3a" stroke-width="1.2"/>`);
      out.push(`<circle cx="0" cy="-17" r="5.2" fill="url(#${can ? 'pin' : 'pinoff'})" filter="url(#drop)"/>`);
      if (rec?.done) out.push(`<g transform="translate(12 13) rotate(-14)" opacity=".85"><circle r="8.5" fill="none" stroke="#4f5129" stroke-width="2"/><path d="M-4 0l2.6 3.6 5.6-7" fill="none" stroke="#4f5129" stroke-width="2.2" stroke-linecap="round"/></g>`);
      out.push('</g>');
    });
  }
  // scale bar and a note in the corner
  out.push(`<g transform="translate(46 ${VH - 40})" font-family="Courier Prime, monospace" font-size="10" fill="#3a2a1a"><rect width="40" height="5" fill="#3a2a1a"/><rect x="40" width="40" height="5" fill="none" stroke="#3a2a1a"/><rect x="80" width="40" height="5" fill="#3a2a1a"/><text y="18">0</text><text x="74" y="18">50 km</text></g>`);
  out.push(`<text x="${VW - 40}" y="${VH - 30}" text-anchor="end" font-family="Courier Prime, monospace" font-size="13" fill="#3a2a1a" opacity=".8">Visitors so far: ★ ${stars}</text>`);
  out.push(`<path d="${edgeD}" fill="url(#burn)" pointer-events="none"/>`);
  out.push('</svg>');
  return out.join('');
}
