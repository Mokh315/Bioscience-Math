const { chromium, devices } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8199';
const SHOT = path.join(__dirname, '..', '..', 'shots');
const fs = require('fs');
fs.mkdirSync(SHOT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let fails = 0;
  const assert = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

  /* ---------- desktop ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // Arabic RTL by default
  assert(await page.getAttribute('html', 'dir') === 'rtl', 'default direction is RTL (Arabic)');
  const r0 = await page.textContent('#statusbar .stat.hl .v');
  assert(Math.abs(parseFloat(r0) - 3.857) < 0.002, 'R0 shown = 3.857 (got ' + r0 + ')');
  const verdict = await page.textContent('#verdict');
  assert(verdict.length > 20, 'verdict text present');
  await page.screenshot({ path: SHOT + '/01-sim-ar-light.png', fullPage: false });

  // canvases actually painted
  const painted = await page.evaluate(() => {
    const ids = ['cTs', 'cPh', 'cBif', 'cEig'];
    return ids.map(id => {
      const c = document.getElementById(id);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++;
      return { id, n };
    });
  });
  painted.forEach(p => assert(p.n > 50, 'canvas ' + p.id + ' painted (' + p.n + ' samples)'));

  // theme toggle
  await page.click('#btnTheme'); await page.waitForTimeout(450);
  assert(await page.getAttribute('html', 'data-theme') === 'dark', 'dark theme applied');
  await page.screenshot({ path: SHOT + '/02-sim-ar-dark.png' });

  // language toggle -> English LTR
  await page.click('#btnLang'); await page.waitForTimeout(600);
  assert(await page.getAttribute('html', 'dir') === 'ltr', 'direction switches to LTR (English)');
  assert((await page.textContent('.tab.active')).includes('Simulation'), 'tabs translated to English');
  await page.click('#btnTheme'); await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT + '/03-sim-en-light.png' });

  // preset: limit cycle
  await page.click('.chips#presets button:nth-child(4)');
  await page.waitForTimeout(900);
  const regime = await page.textContent('#statusbar .stat:nth-child(2) .v');
  assert(/Oscillatory/i.test(regime), 'limit-cycle preset -> Oscillatory regime (got ' + regime + ')');
  await page.screenshot({ path: SHOT + '/04-sim-limitcycle.png' });

  // preset: stress free
  await page.click('.chips#presets button:nth-child(2)');
  await page.waitForTimeout(700);
  const r0free = parseFloat(await page.textContent('#statusbar .stat.hl .v'));
  assert(r0free < 1, 'stress-free preset -> R0 < 1 (got ' + r0free + ')');
  await page.click('.chips#presets button:nth-child(1)');
  await page.waitForTimeout(600);

  // slider interaction
  await page.evaluate(() => {
    const r = document.querySelectorAll('#paramControls .ctrl')[2].querySelector('input[type=range]');
    r.value = 0.3; r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const r0b = parseFloat(await page.textContent('#statusbar .stat.hl .v'));
  assert(Math.abs(r0b - 7.714) < 0.01, 'beta slider updates R0 to 7.714 (got ' + r0b + ')');
  await page.click('#btnResetSim'); await page.waitForTimeout(600);

  /* ---------- dashboard ---------- */
  await page.click('.tab[data-view=dash]');
  await page.waitForTimeout(700);
  const readouts = await page.$$eval('#devReadouts .readout .v', els => els.map(e => e.textContent));
  assert(readouts.length === 5 && readouts.every(v => isFinite(parseFloat(v))), 'device shows 5 numeric readouts');
  await page.screenshot({ path: SHOT + '/05-dashboard-en.png' });

  // log 12 readings with rising temperature (stress ramp)
  for (let i = 0; i < 12; i++) {
    await page.evaluate(v => {
      const r = document.querySelectorAll('#sensorControls .ctrl')[0].querySelector('input[type=range]');
      r.value = v; r.dispatchEvent(new Event('input', { bubbles: true }));
    }, 26 + i * 1.2);
    await page.click('#btnAddReading');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
  const rows = await page.$$eval('#logTable tbody tr', r => r.length);
  assert(rows === 12, 'reading log holds 12 rows (got ' + rows + ')');
  const ews = await page.textContent('#ewsGrid');
  assert(/\d/.test(ews) && !/At least/.test(ews), 'EWS indicators computed');

  // estimation
  await page.click('#btnEstimate'); await page.waitForTimeout(600);
  const est = await page.textContent('#estBox');
  assert(/R₀/.test(est) && !/At least 4/.test(est), 'parameter estimation produced a table');
  await page.screenshot({ path: SHOT + '/06-dashboard-ews.png', fullPage: true });

  // export CSV
  const dl = await Promise.all([page.waitForEvent('download'), page.click('#btnExportLog')]);
  const p = await dl[0].path();
  const csv = fs.readFileSync(p, 'utf8');
  assert(csv.split('\n').length === 13, 'exported CSV has 12 data rows');

  // reference tab
  await page.click('.tab[data-view=ref]'); await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT + '/07-reference-en.png', fullPage: true });
  await page.click('#btnLang'); await page.waitForTimeout(600);
  await page.screenshot({ path: SHOT + '/08-reference-ar.png', fullPage: true });

  /* ---------- service worker / offline ---------- */
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r && !!(r.active || r.installing || r.waiting);
  });
  assert(sw, 'service worker registered');
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.click('.tab[data-view=sim]');
  await page.waitForTimeout(900);
  const offlineOk = await page.evaluate(() =>
    !!window.BSMAPP && !!document.querySelector('#statusbar .stat .v') &&
    Math.abs(BSM.R0(BSMAPP.S().params) - 3.857142857) < 1e-6);
  assert(offlineOk, 'app boots, renders and computes while OFFLINE');
  await page.screenshot({ path: SHOT + '/09-offline.png' });
  await ctx.setOffline(false);

  /* ---------- mobile ---------- */
  const m = await browser.newContext(Object.assign({}, devices['iPhone 13'], { locale: 'ar' }));
  const mp = await m.newPage();
  mp.on('pageerror', e => errors.push('MOBILE PAGEERROR: ' + e.message));
  await mp.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(900);
  await mp.screenshot({ path: SHOT + '/10-mobile-ar.png', fullPage: false });
  await mp.click('.tab[data-view=dash]'); await mp.waitForTimeout(700);
  await mp.screenshot({ path: SHOT + '/11-mobile-dash.png', fullPage: false });
  const mw = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert(mw, 'no horizontal overflow on mobile');

  /* ---------- manifest ---------- */
  const man = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert(man.icons.length >= 4 && man.display === 'standalone', 'manifest valid (standalone + icons)');

  console.log('\nconsole errors: ' + errors.length);
  errors.slice(0, 12).forEach(e => console.log('  ! ' + e));
  if (errors.length) fails++;
  await browser.close();
  console.log(fails === 0 ? '\nALL E2E CHECKS PASSED' : '\n' + fails + ' E2E FAILURES');
  process.exit(fails ? 1 : 0);
})();
