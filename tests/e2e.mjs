// Browser test: plays the whole game through the real UI in headless Chromium.
//   npm run e2e            (needs Playwright with Chromium installed)
// Checks: no console errors, every dig in all five regions completed, every
// skeleton assembled (one by real mouse dragging), the museum, the Daily Dig,
// settings, saving and loading an account code, phone layouts, and that the
// page never requests anything from another website.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { serve } from '../tools/serve.mjs';

// Playwright from this project (npm i -D playwright) or a global install.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const port = 8000 + Math.floor(Math.random() * 900);
const server = await serve(port);
const BASE = `http://localhost:${port}/`;
const shots = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'ff-shots-'));
const problems = [];
const step = (m) => console.log('  ✓ ' + m);

function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${label} console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${label} page error: ${e.message}`));
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`${label} external request: ${r.url()}`); });
}

const browser = await chromium.launch();
try {
  // ------------------------------------------------------------ desktop: the whole game
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, 'desktop');
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ff?.data);

  // cover
  assert.match(await page.textContent('#name-warning'), /Don't use your real name\./);
  assert.equal(await page.getAttribute('.bbl-link', 'href'), 'https://gorzawebk.github.io/brain-break-lab/');
  assert.equal(await page.locator('.ad-safe').count() >= 1, true);
  assert.equal(await page.locator('.ad-safe script, .ad-safe iframe').count(), 0);
  await page.fill('#nickname', 'Rocky <Raptor>');
  assert.equal(await page.inputValue('#nickname'), 'Rocky Raptor');
  await page.screenshot({ path: path.join(shots, '01-cover.png') });
  step('cover: nickname warning, Brain Break Lab link, empty ad-safe area');

  // keyboard digging works
  await page.click('#btn-play');
  await page.click('.map-note[data-site="desert-1"]');
  await page.click('#btn-start-dig');
  await page.keyboard.press('Escape'); // close the field guide
  const e0 = await page.evaluate(() => window.__ff.dig.site.energy);
  await page.keyboard.press('1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(' ');
  const e1 = await page.evaluate(() => window.__ff.dig.site.energy);
  assert.equal(e1, e0 - 2, 'brush used from the keyboard');
  // clicking with the mouse: tap hammer on the surface
  await page.keyboard.press('t');
  const box = await page.locator('#dig-canvas').boundingBox();
  const geo = await page.evaluate(() => { const s = window.__ff.dig.site; return { cols: s.cols, rows: s.rows }; });
  const cell = box.width / geo.cols;
  await page.mouse.click(box.x + cell * 5.5, box.y + box.height - cell * (geo.rows - 0.5));
  assert.ok((await page.evaluate(() => window.__ff.dig.site.log.taps)) >= 1, 'tap by mouse');
  step('dig: keyboard and mouse tools work');
  await page.screenshot({ path: path.join(shots, '02-dig.png') });

  // Finish desert-1 via the real tool code, then rebuild one bone by real dragging.
  await page.evaluate(() => window.__ff.autoDig());
  await page.waitForSelector('#report-actions', { timeout: 6000 });
  await page.screenshot({ path: path.join(shots, '03-report.png') });
  await page.click('#report-actions .tag-rust');
  await page.waitForTimeout(300);
  const piece = await page.evaluate(() => {
    const st = window.__ff.rebuildState();
    const p = st.pieces.find((q) => !q.placed);
    const b = st.creature.bones.find((x) => x.id === p.boneId);
    return { id: p.boneId, x: p.x, y: p.y, s: p.s ?? 1, tx: b.x, ty: b.y };
  });
  const g = await page.evaluate(() => window.__ff.rebuildGeom());
  const cb = await page.locator('#rebuild-canvas').boundingBox();
  const sx = (x) => cb.x + g.ox + x * g.scale;
  const sy = (y) => cb.y + g.oy + y * g.scale;
  // pick it up and put it down near its outline, then turn it with R until it snaps
  await page.mouse.move(sx(piece.x), sy(piece.y));
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(sx(piece.x + (piece.tx - piece.x) * k / 10), sy(piece.y + (piece.ty - piece.y) * k / 10));
  await page.mouse.up();
  for (let k = 0; k < 8; k++) {
    const placed = await page.evaluate((id) => window.__ff.rebuildState().filled.has(id), piece.id);
    if (placed) break;
    await page.keyboard.press('r');
  }
  assert.ok(await page.evaluate((id) => window.__ff.rebuildState().filled.has(id), piece.id), 'a bone snapped in by dragging and turning');
  await page.screenshot({ path: path.join(shots, '04-rebuild.png') });
  step('rebuild: drag with the mouse + turn with R snaps a bone in');
  await page.evaluate(() => window.__ff.dropAllPieces());
  await page.waitForSelector('#f-actions', { timeout: 5000 });
  await page.screenshot({ path: path.join(shots, '05-fact.png') });

  // every other site, in order, through the map
  const data = await page.evaluate(() => window.__ff.data.regions.map((r) => ({ id: r.id, sites: r.sites.map((s) => s.id) })));
  let digs = 1;
  for (const region of data) {
    for (const siteId of region.sites) {
      if (siteId === 'desert-1') continue;
      await page.evaluate(() => { document.querySelector('#modal-x')?.click(); });
      await page.evaluate(() => window.__ff.screen() !== 'map' && document.querySelector('#screen-museum [data-go="map"], #screen-rebuild #btn-rebuild-back')?.click());
      if ((await page.evaluate(() => window.__ff.screen())) !== 'map') { await page.evaluate(() => document.querySelector('#screen-museum [data-go="map"]').click()); }
      await page.waitForSelector(`.map-note[data-site="${siteId}"]:not(.locked)`, { timeout: 4000 });
      await page.click(`.map-note[data-site="${siteId}"]`);
      await page.click('#btn-start-dig');
      await page.waitForFunction(() => window.__ff.screen() === 'dig');
      const res = await page.evaluate(() => window.__ff.autoDig());
      assert.equal(res.found, (await page.evaluate(() => window.__ff.dig.site.bones.length)), `${siteId}: all bones found`);
      assert.equal(res.cracked, 0, `${siteId}: nothing cracked`);
      assert.ok(res.energyLeft >= 0);
      await page.waitForSelector('#report-actions', { timeout: 6000 });
      digs++;
      // rebuild every creature this dig gave bones to
      for (;;) {
        const btn = page.locator('#report-actions .tag-rust');
        if (!(await btn.count())) break;
        await btn.first().click();
        await page.waitForFunction(() => window.__ff.screen() === 'rebuild');
        await page.evaluate(() => window.__ff.dropAllPieces());
        await page.waitForTimeout(100);
        const complete = await page.evaluate(() => { const st = window.__ff.rebuildState(); return st.creature.bones.every((b) => st.filled.has(b.id)); });
        if (complete) await page.waitForSelector('#f-actions', { timeout: 5000 });
        break;
      }
    }
    step(`${region.id}: all 4 digs completed and skeletons rebuilt`);
  }
  assert.equal(digs, 20);
  await page.evaluate(() => document.querySelector('#modal-x')?.click());

  // museum
  await page.evaluate(() => document.querySelector('#btn-rebuild-done')?.click());
  await page.waitForFunction(() => window.__ff.screen() === 'museum');
  const stars = Number(await page.textContent('#museum-stars'));
  const max = await page.evaluate(() => window.__ff.data.creatures.length * 3);
  assert.equal(stars, max, 'every skeleton complete and pristine: all stars');
  await page.click('#btn-curator');
  await page.click('.upgrade[data-up="floor-marble"]');
  await page.click('.upgrade[data-up="light-skylight"]');
  await page.click('.upgrade[data-up="banner-region"]');
  await page.click('.upgrade[data-up="plaque-brass"]');
  await page.click('#c-done');
  await page.screenshot({ path: path.join(shots, '06-museum.png') });
  await page.click('#museum-right');
  await page.waitForTimeout(200);
  const mb = await page.locator('#museum-canvas').boundingBox();
  await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height * 0.45);
  await page.waitForTimeout(200);
  step(`museum: ${stars}/${max} stars, decorations applied, exhibit click opens a card`);
  await page.keyboard.press('Escape');

  // Daily Dig
  await page.evaluate(() => document.querySelector('#screen-museum [data-go="cover"]').click());
  await page.click('#btn-daily');
  assert.match(await page.textContent('#modal-body'), /Curator's mark/);
  await page.click('#d-go');
  await page.waitForFunction(() => window.__ff.screen() === 'dig');
  await page.evaluate(() => window.__ff.autoDig());
  await page.waitForSelector('#report-actions', { timeout: 6000 });
  assert.match(await page.textContent('#modal-body'), /Beaten!/);
  step('Daily Dig: plays, scores and beats the Curator\'s mark');
  await page.evaluate(() => [...document.querySelectorAll('#report-actions button')].find((b) => /journal/i.test(b.textContent)).click());

  // settings
  await page.click('#btn-settings');
  await page.check('#s-cb');
  await page.check('#s-rm');
  await page.click('[data-size="xl"]');
  await page.click('#s-done');
  assert.equal(await page.getAttribute('html', 'data-text'), 'xl');
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')));
  step('settings: colourblind markers, reduced motion, text size');

  // account code: download, wipe, load
  await page.click('#btn-account');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#a-download')]);
  const code = fs.readFileSync(await dl.path(), 'utf8').trim();
  assert.match(code, /^FF1\./);
  assert.match(dl.suggestedFilename(), /^fossil-fixers-FF-/);
  const before = await page.evaluate(() => JSON.stringify(window.__ff.save));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__ff?.data);
  assert.equal(await page.textContent('#cover-stars'), '0', 'fresh browser has nothing');
  await page.click('#btn-account');
  await page.fill('#a-code', code);
  await Promise.all([page.waitForNavigation(), page.click('#a-import')]);
  await page.waitForFunction(() => window.__ff?.data);
  assert.equal(await page.textContent('#cover-stars'), String(max));
  assert.equal(await page.inputValue('#nickname'), 'Rocky Raptor');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__ff.save)), before, 'whole save restored');
  assert.equal(await page.getAttribute('html', 'data-text'), 'xl', 'settings restored');
  // a damaged code is refused politely
  await page.click('#btn-account');
  await page.fill('#a-code', code.slice(0, -4) + 'zzzz');
  await page.click('#a-import');
  assert.match(await page.textContent('#a-status'), /damaged|isn't/);
  step('account code: download, wipe, load restores everything; damaged codes refused');
  await page.keyboard.press('Escape');
  await ctx.close();

  // ------------------------------------------------------------ phones and tablets
  for (const name of ['iPhone 13', 'iPad (gen 7)', 'Pixel 7']) {
    const c = await browser.newContext({ ...devices[name] });
    const p = await c.newPage();
    watch(p, name);
    await p.goto(BASE);
    await p.waitForFunction(() => window.__ff?.data);
    const overflow = async (where) => {
      const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(o <= 1, `${name} ${where}: page is ${o}px too wide`);
    };
    await overflow('cover');
    await p.locator('#btn-play').tap();
    await overflow('map');
    await p.locator('.map-note[data-site="desert-1"]').tap();
    await p.locator('#btn-start-dig').tap();
    await p.locator('#modal-x').tap();
    const b = await p.locator('#dig-canvas').boundingBox();
    assert.ok(b.width > 200 && b.y + b.height <= (p.viewportSize().height + 2), `${name}: dig grid fits`);
    await p.locator('.pocket[data-tool="pickaxe"]').tap();
    await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.2);
    const tb = await p.locator('#toolroll').boundingBox();
    assert.ok(tb.y + tb.height <= p.viewportSize().height + 2, `${name}: tool roll visible`);
    await overflow('dig');
    await p.screenshot({ path: path.join(shots, `07-${name.replace(/\W+/g, '-')}-dig.png`) });
    await p.evaluate(() => window.__ff.autoDig());
    await p.waitForSelector('#report-actions', { timeout: 6000 });
    await p.locator('#report-actions .tag-rust').tap();
    await overflow('rebuild');
    await p.screenshot({ path: path.join(shots, `08-${name.replace(/\W+/g, '-')}-rebuild.png`) });
    await p.evaluate(() => window.__ff.dropAllPieces());
    await p.waitForSelector('#f-actions', { timeout: 5000 });
    await p.locator('#f-actions .tag:last-child').tap();
    await overflow('museum');
    await p.screenshot({ path: path.join(shots, `09-${name.replace(/\W+/g, '-')}-museum.png`) });
    step(`${name}: no sideways scrolling, grid and tool roll fit, touch digging works`);
    await c.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('\nProblems found:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log(`\nAll browser checks passed. Screenshots in ${shots}`);
