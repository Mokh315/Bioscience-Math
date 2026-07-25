/* =====================================================================
   BioSense-Math PWA — application logic
   ===================================================================== */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const t = (k, v) => I18N.t(k, v);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fx = (v, d) => (v === null || v === undefined || !isFinite(v)) ? t('na') : Number(v).toFixed(d === undefined ? 3 : d);
  /* numbers must always read left-to-right, even inside an RTL layout */
  const num = s => '<span dir="ltr">' + s + '</span>';

  const PARAM_SPEC = [
    { k: 'a', sym: 'a', min: 0, max: 2, step: 0.01 },
    { k: 'K', sym: 'K', min: 1, max: 25, step: 0.1 },
    { k: 'beta', sym: 'β', min: 0, max: 0.6, step: 0.001 },
    { k: 'gamma', sym: 'γ', min: 0, max: 1.5, step: 0.01 },
    { k: 'mu', sym: 'μ', min: 0.001, max: 1.5, step: 0.01 },
    { k: 'eta', sym: 'η', min: 0, max: 1, step: 0.01 },
    { k: 'delta', sym: 'δ', min: 0.01, max: 2, step: 0.01 },
    { k: 'lambda', sym: 'λ', min: 0, max: 2, step: 0.01 },
    { k: 'theta', sym: 'θ', min: 0.01, max: 2, step: 0.01 },
    { k: 'sigma', sym: 'σ', min: 0, max: 2, step: 0.01 },
    { k: 'rho', sym: 'ρ', min: 0.01, max: 2, step: 0.01 }
  ];
  const SENSOR_SPEC = [
    { k: 'temp', min: 15, max: 50, step: 0.1, i: 'sensorTemp', u: 'sensorTempU' },
    { k: 'hum', min: 0, max: 100, step: 0.5, i: 'sensorHum', u: 'sensorHumU' },
    { k: 'opt', min: 0, max: 100, step: 0.5, i: 'sensorOpt', u: 'sensorOptU' },
    { k: 'ph', min: 4, max: 10, step: 0.01, i: 'sensorPh', u: 'sensorPhU' },
    { k: 'flow', min: 0, max: 12, step: 0.1, i: 'sensorFlow', u: 'sensorFlowU' }
  ];
  const VARS = ['H', 'S', 'D', 'B', 'R'];
  const VCOL = { H: '--H', S: '--S', D: '--D', B: '--B', R: '--R' };
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#0d9488';

  /* ---------------- state ---------------- */
  const DEF = {
    params: Object.assign({}, BSM.REF),
    x0: { H: 9, S: 1, D: 0.2, B: 0.1, R: 0.5 },
    T: 200,
    vars: { H: true, S: true, D: true, B: true, R: true },
    lang: 'ar', theme: 'light', view: 'sim',
    dash: {
      inputMode: 'sensors',
      sensors: { temp: 26, hum: 60, opt: 88, ph: 7.05, flow: 6 },
      direct: { H: 7.62, S: 1.23, D: 0.32, B: 0.15, R: 0.88 },
      cal: Object.assign({}, BSM.DEFAULT_CAL),
      log: [], alertSound: false, ewsWindow: 8, fcHorizon: 100
    }
  };
  let S = load();

  function load() {
    let s = JSON.parse(JSON.stringify(DEF));
    try {
      const raw = localStorage.getItem('bsm-state');
      if (raw) s = deepMerge(s, JSON.parse(raw));
    } catch (e) { }
    // URL hash overrides (shared links)
    try {
      const h = location.hash.replace(/^#/, '');
      if (h) {
        const q = new URLSearchParams(h);
        BSM.PARAM_KEYS.forEach(k => { if (q.has(k)) s.params[k] = parseFloat(q.get(k)); });
        VARS.forEach(k => { if (q.has('x' + k)) s.x0[k] = parseFloat(q.get('x' + k)); });
        if (q.has('T')) s.T = parseFloat(q.get('T'));
        if (q.has('lang')) s.lang = q.get('lang');
      }
    } catch (e) { }
    if (!s.lang) s.lang = (navigator.language || 'ar').slice(0, 2) === 'ar' ? 'ar' : 'en';
    return s;
  }
  function deepMerge(a, b) {
    Object.keys(b || {}).forEach(k => {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]);
      else a[k] = b[k];
    });
    return a;
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem('bsm-state', JSON.stringify(S)); } catch (e) { }
    }, 300);
  }

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------------- i18n / theme ---------------- */
  function applyLang() {
    I18N.setLang(S.lang);
    document.documentElement.lang = S.lang;
    document.documentElement.dir = I18N.dir();
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    $('#langLabel').textContent = t('otherLang');
    $('#installHintTxt').textContent = t('installHint') + ' ' + t('installIos');
    $('#dashParamSummary').textContent = t('parameters');
    buildAll();
    renderAll();
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.theme);
    const mt = document.querySelector('meta[name=theme-color]');
    if (mt) mt.setAttribute('content', S.theme === 'dark' ? '#0b1220' : '#0d9488');
    $('#themeIcon').setAttribute('d', S.theme === 'dark'
      ? 'M12 4v2m0 12v2m8-8h-2M6 12H4m13.7-5.7l-1.4 1.4M7.7 16.3l-1.4 1.4m11.4 0l-1.4-1.4M7.7 7.7L6.3 6.3M16 12a4 4 0 11-8 0 4 4 0 018 0z'
      : 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z');
    renderAll();
  }

  /* ---------------- control factory ---------------- */
  function makeCtrl(o) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    const lab = document.createElement('label');
    lab.innerHTML = '<b></b><span></span>';
    lab.querySelector('b').textContent = o.sym;
    lab.querySelector('span').textContent = o.label || '';
    const num = document.createElement('input');
    num.type = 'number'; num.min = o.min; num.max = o.max; num.step = o.step;
    num.value = fmtNum(o.value, o.step);
    const rng = document.createElement('input');
    rng.type = 'range'; rng.min = o.min; rng.max = o.max; rng.step = o.step; rng.value = o.value;
    if (o.title) { lab.title = o.title; }
    const emit = (v, fromRange) => {
      v = clamp(parseFloat(v), o.min, o.max);
      if (!isFinite(v)) return;
      if (fromRange) num.value = fmtNum(v, o.step); else rng.value = v;
      o.onInput(v);
    };
    rng.addEventListener('input', e => emit(e.target.value, true));
    num.addEventListener('input', e => emit(e.target.value, false));
    wrap.appendChild(lab); wrap.appendChild(num); wrap.appendChild(rng);
    wrap._set = v => { num.value = fmtNum(v, o.step); rng.value = v; };
    return wrap;
  }
  function fmtNum(v, step) {
    const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
    return Number(v).toFixed(d);
  }

  const CTRLS = { param: {}, ic: {}, sensor: {}, direct: {}, dashParam: {} };

  function buildParams(host, store) {
    host.innerHTML = '';
    PARAM_SPEC.forEach(p => {
      const c = makeCtrl({
        sym: p.sym, label: t('p_' + p.k), title: t('p_' + p.k) + ' — ' + t('p_' + p.k + '_d'),
        min: p.min, max: p.max, step: p.step, value: S.params[p.k],
        onInput: v => { S.params[p.k] = v; syncParam(p.k, v); save(); renderAll(); }
      });
      host.appendChild(c);
      store[p.k] = c;
    });
  }
  function syncParam(k, v) {
    [CTRLS.param[k], CTRLS.dashParam[k]].forEach(c => { if (c && c._set) c._set(v); });
  }

  function buildAll() {
    /* --- simulation parameters --- */
    buildParams($('#paramControls'), CTRLS.param);
    buildParams($('#dashParamControls'), CTRLS.dashParam);

    /* --- initial conditions --- */
    const ic = $('#icControls'); ic.innerHTML = '';
    VARS.forEach(k => {
      const c = makeCtrl({
        sym: k + '₀', label: t(k), min: 0, max: k === 'H' ? 25 : 15, step: 0.01, value: S.x0[k],
        onInput: v => { S.x0[k] = v; save(); renderSim(); }
      });
      ic.appendChild(c); CTRLS.ic[k] = c;
    });

    /* --- horizon --- */
    const hz = $('#horizonControl'); hz.innerHTML = '';
    hz.appendChild(makeCtrl({
      sym: 'T', label: t('timeUnit'), min: 20, max: 2000, step: 10, value: S.T,
      onInput: v => { S.T = v; save(); renderSim(); }
    }));

    /* --- presets --- */
    const pr = $('#presets'); pr.innerHTML = '';
    const presets = [
      { id: 'ref', label: t('presetRef'), p: {} },
      { id: 'free', label: t('presetFree'), p: { beta: 0.03 } },
      { id: 'crit', label: t('presetCritical'), p: { beta: 0.176 } },
      { id: 'hopf', label: t('presetHopf'), p: { beta: 0.22 } }
    ];
    presets.forEach(ps => {
      const b = document.createElement('button');
      b.className = 'chip'; b.textContent = ps.label;
      b.onclick = () => {
        S.params = Object.assign({}, BSM.REF, ps.p);
        S.x0 = Object.assign({}, DEF.x0);
        S.T = ps.id === 'hopf' || ps.id === 'crit' ? 600 : 200;
        buildAll(); save(); renderAll();
      };
      pr.appendChild(b);
    });

    /* --- variable toggles --- */
    const vt = $('#varToggles'); vt.innerHTML = '';
    VARS.forEach(k => {
      const b = document.createElement('button');
      b.className = 'chip' + (S.vars[k] ? ' active' : '');
      b.innerHTML = '<i class="dot" style="background:' + cssv(VCOL[k]) + '"></i>' + k + ' — ' + t(k);
      b.onclick = () => { S.vars[k] = !S.vars[k]; b.classList.toggle('active'); save(); renderSim(); };
      vt.appendChild(b);
    });

    /* --- sensors --- */
    const sc = $('#sensorControls'); sc.innerHTML = '';
    SENSOR_SPEC.forEach(sp => {
      const c = makeCtrl({
        sym: t(sp.i), label: t(sp.u), min: sp.min, max: sp.max, step: sp.step, value: S.dash.sensors[sp.k],
        onInput: v => { S.dash.sensors[sp.k] = v; save(); renderDash(); }
      });
      sc.appendChild(c); CTRLS.sensor[sp.k] = c;
    });

    /* --- calibration --- */
    const cc = $('#calibControls'); cc.innerHTML = '';
    SENSOR_SPEC.forEach(sp => {
      const row = document.createElement('div'); row.className = 'ctrl';
      const lab = document.createElement('label');
      lab.innerHTML = '<b>' + t(sp.i) + '</b>';
      const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.gap = '.25rem';
      [0, 1].forEach(i => {
        const inp = document.createElement('input');
        inp.type = 'number'; inp.step = sp.step; inp.value = S.dash.cal[sp.k][i];
        inp.title = i ? t('max') : t('min');
        inp.oninput = e => { S.dash.cal[sp.k][i] = parseFloat(e.target.value); save(); renderDash(); };
        wrap.appendChild(inp);
      });
      row.appendChild(lab); row.appendChild(wrap); cc.appendChild(row);
    });
    ['Hgain', 'Sgain', 'Dgain', 'Bgain', 'Rgain'].forEach(g => {
      const row = document.createElement('div'); row.className = 'ctrl';
      const lab = document.createElement('label');
      lab.innerHTML = '<b>' + t('gain') + ' ' + g[0] + '</b>';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = 0.5; inp.value = S.dash.cal[g];
      inp.oninput = e => { S.dash.cal[g] = parseFloat(e.target.value); save(); renderDash(); };
      row.appendChild(lab); row.appendChild(inp); cc.appendChild(row);
    });

    /* --- direct state entry --- */
    const dc = $('#directControls'); dc.innerHTML = '';
    VARS.forEach(k => {
      const c = makeCtrl({
        sym: k, label: t(k), min: 0, max: 25, step: 0.01, value: S.dash.direct[k],
        onInput: v => { S.dash.direct[k] = v; save(); renderDash(); }
      });
      dc.appendChild(c); CTRLS.direct[k] = c;
    });

    /* --- reference tables --- */
    buildRefTables();
  }

  /* ---------------- simulation ---------------- */
  let cache = { key: null, cls: null, bif: null };
  function paramKey(p) { return BSM.PARAM_KEYS.map(k => p[k]).join(','); }

  function classification() {
    const key = paramKey(S.params);
    if (cache.key !== key) { cache.key = key; cache.cls = BSM.classify(S.params); cache.bif = null; }
    return cache.cls;
  }

  function renderStatus() {
    const c = classification();
    const box = $('#statusbar');
    const regimeTxt = c.regime === 'free' ? t('regimeFreeShort') : c.regime === 'endemic' ? t('regimeEndemicShort') : t('regimeOscShort');
    const cls = c.regime === 'free' ? 'ok' : c.regime === 'endemic' ? 'warn' : 'bad';
    const marginTxt = c.hopfMargin === null ? t('na') : (100 * c.hopfMargin).toFixed(1) + '%';
    const items = [
      { k: t('R0label'), v: fx(c.R0, 3), c: c.R0 < 1 ? 'ok' : c.R0 < 2 ? 'warn' : 'bad', hl: true },
      { k: t('regime'), v: regimeTxt, c: cls },
      { k: t('betaHopf'), v: c.betaHopf === null ? t('na') : fx(c.betaHopf, 4), c: '' },
      { k: t('hopfMargin'), v: marginTxt, c: c.hopfMargin === null ? '' : (c.hopfMargin > 0.25 ? 'ok' : c.hopfMargin > 0 ? 'warn' : 'bad') },
      { k: t('maxRe'), v: fx(c.maxRe, 4), c: c.maxRe < 0 ? 'ok' : 'bad' },
      { k: t('relaxTime'), v: c.relaxationTime === null ? t('na') : fx(c.relaxationTime, 1), c: '' }
    ];
    box.innerHTML = items.map(i =>
      '<div class="stat ' + (i.c || '') + (i.hl ? ' hl' : '') + '"><span class="k">' + i.k + '</span><span class="v">' + i.v + '</span></div>'
    ).join('');
  }

  let simData = null;
  function renderSim() {
    const c = classification();
    renderStatus();
    const p = S.params;
    const x0 = VARS.map(k => S.x0[k]);
    simData = BSM.integrate(x0, p, S.T, { nOut: 900 });

    // time series
    const eq = c.equilibrium;
    Chart.lineChart($('#cTs'), {
      x: simData.t,
      series: VARS.map((k, i) => ({ y: simData.y[i], color: cssv(VCOL[k]), visible: S.vars[k] })),
      refLines: VARS.map((k, i) => S.vars[k] ? { value: eq[i], color: Chart.mixColor(cssv('--card'), cssv(VCOL[k]), 0.55) } : null).filter(Boolean),
      xlabel: t('chartTime'), ylabel: t('chartValue')
    });
    $('#legendTs').innerHTML = VARS.filter(k => S.vars[k]).map(k =>
      '<span><i style="background:' + cssv(VCOL[k]) + '"></i>' + k + ' — ' + t(k) + '</span>').join('');

    // phase portrait H-B
    Chart.phaseChart($('#cPh'), {
      x: simData.y[0], y: simData.y[3], color: cssv('--accent'),
      xlabel: 'H — ' + t('H'), ylabel: 'B — ' + t('B'), eq: [eq[0], eq[3]]
    });

    // eigenvalues
    Chart.eigenChart($('#cEig'), { eigenvalues: c.eigenvalues, xlabel: t('axisRe'), ylabel: t('axisIm') });
    $('#eigList').innerHTML = c.eigenvalues.slice().sort((a, b) => b.re - a.re).map(e =>
      '<span dir="ltr" style="display:inline-block;margin-inline-end:.6rem">Λ = ' + e.re.toFixed(4) +
      (e.im ? (e.im > 0 ? ' + ' : ' − ') + Math.abs(e.im).toFixed(4) + 'i' : '') + '</span>').join('');

    // bifurcation
    renderBifurcation();

    // equilibria table + verdict
    const E0 = BSM.E0(p), Es = BSM.endemic(p);
    const rows = [];
    rows.push({ n: t('eqFree'), x: E0, stable: c.R0 < 1 });
    if (Es) rows.push({ n: t('eqEndemic'), x: Es, stable: c.regime === 'endemic' });
    $('#eqTable').innerHTML =
      '<table><thead><tr><th>' + t('equilibrium') + '</th>' + VARS.map(k => '<th class="num">' + k + '</th>').join('') +
      '<th class="num">' + t('status') + '</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + r.n + '</td>' + r.x.map(v => '<td class="num">' + fx(v, 3) + '</td>').join('') +
        '<td class="num" style="color:var(--' + (r.stable ? 'ok' : 'danger') + ')">' + (r.stable ? t('stable') : t('unstable')) + '</td></tr>').join('') +
      '</tbody></table>';

    const v = $('#verdict');
    let txt = c.regime === 'free' ? t('verdictFree') : c.regime === 'endemic' ? t('verdictEndemic') : t('verdictOsc');
    if (c.regime === 'endemic' && c.hopfMargin !== null && c.hopfMargin < 0.25) txt += ' ' + t('nearHopf');
    v.className = 'verdict' + (c.regime === 'free' ? '' : c.regime === 'endemic' ? ' warn' : ' bad');
    v.textContent = txt;
  }

  function renderBifurcation() {
    const p = S.params, c = classification();
    if (!cache.bif) {
      const bc = BSM.betaCritical(p), bh = c.betaHopf;
      const lo = Math.max(1e-4, Math.min(bc * 0.4, p.beta * 0.4));
      const hi = Math.max(p.beta * 1.6, (bh || bc * 6) * 1.7);
      const N = 121, data = [];
      for (let i = 0; i < N; i++) {
        const b = lo + (hi - lo) * i / (N - 1);
        const q = Object.assign({}, p, { beta: b });
        const r0 = BSM.R0(q);
        let H, stable;
        if (r0 < 1) { H = q.K; stable = true; }
        else {
          const E = BSM.endemic(q);
          if (!E) { H = NaN; stable = true; }
          else { H = E[0]; stable = BSM.maxRe(BSM.jacobian(E, q)) < 0; }
        }
        data.push({ beta: b, H: H, stable: stable });
      }
      // limit-cycle envelope on the unstable branch (sampled)
      const unst = data.filter(d => !d.stable);
      const step = Math.max(1, Math.floor(unst.length / 14));
      for (let i = 0; i < unst.length; i += step) {
        const d = unst[i];
        const q = Object.assign({}, p, { beta: d.beta });
        const sim = BSM.integrate([S.x0.H, S.x0.S, S.x0.D, S.x0.B, S.x0.R], q, 900, { nOut: 900 });
        const tail = sim.y[0].slice(500);
        d.min = Math.min.apply(null, tail); d.max = Math.max.apply(null, tail);
      }
      // interpolate envelope to neighbouring unstable points
      let last = null;
      unst.forEach(d => { if (d.min !== undefined) last = d; else if (last) { d.min = last.min; d.max = last.max; } });
      cache.bif = { data: data, hopf: bh, rc: bc };
    }
    Chart.bifurcationChart($('#cBif'), {
      data: cache.bif.data, hopf: cache.bif.hopf, rc: cache.bif.rc, current: p.beta,
      xlabel: 'β', ylabel: 'H*'
    });
    $('#bifNote').innerHTML =
      '<span style="color:var(--danger)">┄</span> β_H = ' + (cache.bif.hopf === null ? t('na') : fx(cache.bif.hopf, 4)) +
      ' · <span style="color:var(--muted)">┄</span> ' + t('betaCrit') + ' = ' + fx(cache.bif.rc, 4) +
      ' · β = ' + fx(p.beta, 3);
  }

  /* ---------------- live run ---------------- */
  let liveTimer = null;
  function toggleLive(on) {
    clearInterval(liveTimer);
    if (!on) return;
    let T = 20;
    liveTimer = setInterval(() => {
      T = Math.min(S.T, T + Math.max(2, S.T / 120));
      const saved = S.T; S.T = T; renderSim(); S.T = saved;
      if (T >= saved) { clearInterval(liveTimer); $('#chkLive').checked = false; }
    }, 90);
  }

  /* ---------------- dashboard ---------------- */
  function currentState() {
    if (S.dash.inputMode === 'sensors') return BSM.sensorsToState(S.dash.sensors, S.dash.cal);
    return VARS.map(k => S.dash.direct[k]);
  }

  function renderDash() {
    const p = S.params, c = classification();
    const x = currentState();

    // device readouts
    $('#devReadouts').innerHTML = VARS.map((k, i) =>
      '<div class="readout"><span class="k"><b style="color:' + cssv(VCOL[k]) + '">' + k + '</b>' + t(k) + '</span>' +
      '<span class="v">' + fx(x[i], 2) + '</span></div>').join('');

    const r0col = c.R0 < 1 ? cssv('--ok') : c.R0 < 2 ? cssv('--warn') : cssv('--danger');
    Chart.gauge($('#cGauge'), Math.min(c.R0, 4), 4, { color: r0col, text: fx(c.R0, 2), label: 'R₀' });

    // early warning
    const ew = S.dash.log.length ? BSM.ews(S.dash.log, 0, Math.min(S.dash.ewsWindow, Math.max(3, S.dash.log.length - 1))) : null;
    const al = BSM.alertStatus(p, x, ew && ew.variance.length >= 2 ? ew : null, {});

    // device status line
    const lvlTxt = al.level === 'ok' ? t('levelOk') : al.level === 'watch' ? t('levelWatch') : t('levelAlarm');
    $('#devLed').className = 'led ' + (al.level === 'ok' ? '' : al.level);
    $('#devStatusTxt').textContent = lvlTxt + ' · R₀ = ' + fx(c.R0, 2) + ' · ' +
      (c.regime === 'free' ? t('regimeFree') : c.regime === 'endemic' ? t('regimeEndemic') : t('regimeOsc'));

    // alert card
    $('#alertBox').innerHTML =
      '<div class="alert-banner ' + al.level + '"><span class="led ' + (al.level === 'ok' ? '' : al.level) + '"></span>' + lvlTxt + '</div>' +
      (al.reasons.length
        ? '<ul class="reasons">' + al.reasons.map(r => '<li>' + t('reason_' + r) + '</li>').join('') + '</ul>'
        : '<p class="hint">' + t('allClear') + '</p>');
    maybeAlert(al.level);

    // EWS card
    const grid = $('#ewsGrid');
    if (!ew || ew.variance.length < 2) {
      grid.innerHTML = '<p class="hint">' + t('ewsNeed', { n: (S.dash.ewsWindow + 2) }) + '</p>';
      $('#ewsWin').textContent = t('readings') + ': ' + S.dash.log.length;
    } else {
      const tr = v => v > 1e-6 ? 'up' : v < -1e-6 ? 'down' : 'flat';
      const trTxt = v => v > 1e-6 ? t('ewsTrendUp') : v < -1e-6 ? t('ewsTrendDown') : t('ewsTrendFlat');
      grid.innerHTML =
        '<div class="ews-cell"><span class="k">' + t('ewsVar') + '</span><br><span class="v">' + fx(ew.lastVar, 4) +
        '</span> <span class="trend ' + tr(ew.varTrend) + '">' + trTxt(ew.varTrend) + '</span>' +
        '<canvas id="spVar"></canvas></div>' +
        '<div class="ews-cell"><span class="k">' + t('ewsAC') + '</span><br><span class="v">' + fx(ew.lastAC, 3) +
        '</span> <span class="trend ' + tr(ew.acTrend) + '">' + trTxt(ew.acTrend) + '</span>' +
        '<canvas id="spAC"></canvas></div>';
      Chart.sparkline($('#spVar'), ew.variance, { color: cssv('--warn') });
      Chart.sparkline($('#spAC'), ew.autocorr, { color: cssv('--B') });
      $('#ewsWin').textContent = t('ewsWindow') + ' = ' + ew.window + ' · ' + ew.n + ' ' + t('readings');
    }

    renderLog();
    renderForecast();
  }

  let lastAlertLevel = 'ok';
  function maybeAlert(level) {
    if (!S.dash.alertSound) { lastAlertLevel = level; return; }
    if (level === 'alarm' && lastAlertLevel !== 'alarm') {
      try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const ac = new AC(), o = ac.createOscillator(), g = ac.createGain();
          o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.06;
          o.connect(g); g.connect(ac.destination); o.start();
          setTimeout(() => { o.stop(); ac.close(); }, 320);
        }
      } catch (e) { }
    }
    lastAlertLevel = level;
  }

  function renderLog() {
    const log = S.dash.log;
    const host = $('#logTable');
    if (!log.length) { host.innerHTML = '<p class="hint">' + t('noReadings') + '</p>'; Chart.setup($('#cLog')); return; }
    const rows = log.slice().reverse().slice(0, 200);
    host.innerHTML = '<table><thead><tr><th>' + t('timestamp') + '</th>' +
      VARS.map(k => '<th class="num">' + k + '</th>').join('') + '<th class="num">R₀</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + new Date(r.iso).toLocaleString(S.lang === 'ar' ? 'ar' : 'en-GB') + '</td>' +
        r.x.map(v => '<td class="num">' + fx(v, 2) + '</td>').join('') +
        '<td class="num">' + fx(r.R0 !== undefined ? r.R0 : BSM.R0(S.params), 2) + '</td></tr>').join('') +
      '</tbody></table>';
    // log chart: use elapsed time when the readings really span time, otherwise reading index
    const span = log[log.length - 1].t - log[0].t;
    const xs = span > 0.05 ? log.map(r => r.t) : log.map((r, i) => i + 1);
    Chart.lineChart($('#cLog'), {
      x: xs,
      series: VARS.map((k, i) => ({ y: log.map(r => r.x[i]), color: cssv(VCOL[k]), width: 1.6, visible: S.vars[k] })),
      xlabel: '', ylabel: ''
    });
  }

  function renderForecast() {
    const x = currentState();
    const Tf = S.dash.fcHorizon;
    const sim = BSM.integrate(x, S.params, Tf, { nOut: 500 });
    const thr = 0.3 * S.params.K;
    let tCross = null;
    for (let i = 0; i < sim.t.length; i++) { if (sim.y[0][i] < thr) { tCross = sim.t[i]; break; } }
    Chart.lineChart($('#cFc'), {
      x: sim.t,
      series: VARS.map((k, i) => ({ y: sim.y[i], color: cssv(VCOL[k]), visible: S.vars[k] })),
      refLines: [{ value: thr, color: cssv('--danger') }],
      vLines: tCross !== null ? [{ value: tCross }] : [],
      xlabel: t('chartTime'), ylabel: t('chartValue')
    });
    $('#fcNote').textContent = t('forecastNote') + ' · ' + t('timeToThreshold') + ': ' +
      (tCross === null ? t('never') : fx(tCross, 1) + ' ' + t('timeUnit'));
  }

  function addReading() {
    const x = currentState();
    const now = new Date();
    const first = S.dash.log.length ? new Date(S.dash.log[0].iso).getTime() : now.getTime();
    const rec = {
      iso: now.toISOString(),
      t: S.dash.log.length ? (now.getTime() - first) / 3600000 : 0,
      x: x, s: Object.assign({}, S.dash.sensors), R0: BSM.R0(S.params)
    };
    // guard against identical timestamps (rapid clicks): nudge t forward
    if (S.dash.log.length && rec.t <= S.dash.log[S.dash.log.length - 1].t) {
      rec.t = S.dash.log[S.dash.log.length - 1].t + 1 / 60;
    }
    S.dash.log.push(rec);
    if (S.dash.log.length > 2000) S.dash.log.shift();
    save(); renderDash();
    toast(t('addReading') + ' ✓');
  }

  /* ---------------- estimation ---------------- */
  function runEstimation() {
    const log = S.dash.log;
    if (log.length < 4) { $('#estBox').innerHTML = '<p class="hint">' + t('estNeed') + '</p>'; return; }
    const est = BSM.estimateParameters(log, S.params);
    if (!est) { $('#estBox').innerHTML = '<p class="hint">' + t('estNeed') + '</p>'; return; }
    const r0e = BSM.R0(est.params);
    $('#estBox').innerHTML =
      (est.reliable ? '' : '<div class="alert-banner watch" style="font-size:.82rem;font-weight:600">' + t('estUnreliable') + '</div>') +
      '<table><thead><tr><th>' + t('estParam') + '</th><th class="num">' + t('estNominal') + '</th><th class="num">' +
      t('estEstimated') + '</th><th class="num">' + t('status') + '</th></tr></thead><tbody>' +
      PARAM_SPEC.map(p => '<tr><td>' + p.sym + ' — ' + t('p_' + p.k) + '</td><td class="num">' + num(fx(S.params[p.k], 3)) +
        '</td><td class="num">' + num(fx(est.params[p.k], 3)) + '</td><td class="num" style="color:var(--' +
        (est.accepted[p.k] ? 'ok' : 'muted') + ')">' + (est.accepted[p.k] ? t('estOk') : t('estKept')) + '</td></tr>').join('') +
      '<tr><td><b>R₀</b></td><td class="num">' + num(fx(BSM.R0(S.params), 3)) + '</td><td class="num"><b>' + num(fx(r0e, 3)) + '</b></td><td></td></tr>' +
      '</tbody></table>' +
      '<p class="mini">' + t('estFit') + ': ' + VARS.map(k => k + '=' + fx(est.r2[k], 2)).join(' · ') +
      ' · ' + t('estQuality') + ' = ' + fx(est.quality, 2) + ' · n = ' + est.nPoints +
      ' · ' + t('estSpan') + ' = ' + fx(est.timeSpan, 2) + '</p>' +
      '<button class="btn btn-sm ' + (est.reliable ? 'btn-primary' : '') + '" id="btnApplyEst">' + t('applyEstimated') + '</button>';
    $('#btnApplyEst').onclick = () => {
      S.params = Object.assign({}, est.params);
      buildAll(); save(); renderAll(); toast(t('estimatedApplied'));
    };
  }

  /* ---------------- export helpers ---------------- */
  function download(name, mime, content) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function simCsv() {
    if (!simData) return '';
    const head = 'BioSense-Math simulation\n# ' + BSM.PARAM_KEYS.map(k => k + '=' + S.params[k]).join(' ') +
      '\n# R0=' + BSM.R0(S.params).toFixed(6) + '\nt,H,S,D,B,R\n';
    const lines = simData.t.map((tt, i) =>
      [tt, simData.y[0][i], simData.y[1][i], simData.y[2][i], simData.y[3][i], simData.y[4][i]]
        .map(v => Number(v).toFixed(6)).join(','));
    return head + lines.join('\n');
  }
  function logCsv() {
    const head = 'timestamp,t_hours,H,S,D,B,R,temp,hum,opt,ph,flow,R0\n';
    return head + S.dash.log.map(r => [r.iso, r.t.toFixed(4)].concat(r.x.map(v => v.toFixed(4)))
      .concat([r.s ? r.s.temp : '', r.s ? r.s.hum : '', r.s ? r.s.opt : '', r.s ? r.s.ph : '', r.s ? r.s.flow : '',
      r.R0 !== undefined ? r.R0.toFixed(4) : '']).join(',')).join('\n');
  }
  function importCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const head = lines.shift().split(',').map(s => s.trim().toLowerCase());
    const idx = n => head.indexOf(n);
    const out = [];
    lines.forEach(l => {
      const c = l.split(',');
      const x = ['h', 's', 'd', 'b', 'r'].map(k => parseFloat(c[idx(k)]));
      if (x.some(v => !isFinite(v))) return;
      const iso = idx('timestamp') >= 0 ? c[idx('timestamp')] : new Date().toISOString();
      const tt = idx('t_hours') >= 0 ? parseFloat(c[idx('t_hours')]) : out.length;
      const s = {};
      ['temp', 'hum', 'opt', 'ph', 'flow'].forEach(k => { if (idx(k) >= 0) s[k] = parseFloat(c[idx(k)]); });
      out.push({ iso: iso, t: isFinite(tt) ? tt : out.length, x: x, s: s });
    });
    if (!out.length) { toast('CSV ✗'); return; }
    S.dash.log = out; save(); renderDash(); toast(out.length + ' ' + t('readings'));
  }

  function printReport() {
    const c = classification(), x = currentState();
    const ew = S.dash.log.length ? BSM.ews(S.dash.log, 0, Math.min(S.dash.ewsWindow, Math.max(3, S.dash.log.length - 1))) : null;
    const al = BSM.alertStatus(S.params, x, ew && ew.variance.length >= 2 ? ew : null, {});
    const lvlTxt = al.level === 'ok' ? t('levelOk') : al.level === 'watch' ? t('levelWatch') : t('levelAlarm');
    const rtl = I18N.dir() === 'rtl';
    const html = '<!DOCTYPE html><html lang="' + S.lang + '" dir="' + I18N.dir() + '"><head><meta charset="utf-8">' +
      '<title>' + t('reportTitle') + '</title><style>' +
      'body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;margin:32px;color:#0f172a}' +
      'h1{font-size:19px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;color:#0d9488}' +
      'table{border-collapse:collapse;width:100%;font-size:12.5px}td,th{border:1px solid #dbe2ea;padding:5px 7px;text-align:' + (rtl ? 'right' : 'left') + '}' +
      'th{background:#f1f5f9}.muted{color:#64748b;font-size:12px}.lvl{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12.5px}' +
      '</style></head><body>' +
      '<h1>' + t('reportTitle') + '</h1>' +
      '<p class="muted">' + t('printedOn') + ' ' + new Date().toLocaleString(S.lang === 'ar' ? 'ar' : 'en-GB') + '</p>' +
      '<p><span class="lvl" style="background:' + (al.level === 'ok' ? '#dcfce7;color:#15803d' : al.level === 'watch' ? '#fef3c7;color:#b45309' : '#fee2e2;color:#b91c1c') + '">' + lvlTxt + '</span></p>' +
      '<h2>' + t('derivedState') + '</h2><table><tr>' + VARS.map(k => '<th>' + k + '</th>').join('') + '</tr><tr>' +
      x.map(v => '<td>' + fx(v, 3) + '</td>').join('') + '</tr></table>' +
      '<h2>' + t('status') + '</h2><table>' +
      '<tr><th>' + t('R0label') + '</th><td>' + fx(c.R0, 4) + '</td></tr>' +
      '<tr><th>' + t('regime') + '</th><td>' + (c.regime === 'free' ? t('regimeFree') : c.regime === 'endemic' ? t('regimeEndemic') : t('regimeOsc')) + '</td></tr>' +
      '<tr><th>' + t('betaHopf') + '</th><td>' + (c.betaHopf === null ? t('na') : fx(c.betaHopf, 4)) + '</td></tr>' +
      '<tr><th>' + t('hopfMargin') + '</th><td>' + (c.hopfMargin === null ? t('na') : (100 * c.hopfMargin).toFixed(1) + '%') + '</td></tr>' +
      '<tr><th>' + t('maxRe') + '</th><td>' + fx(c.maxRe, 4) + '</td></tr>' +
      (ew && ew.lastVar !== null ? '<tr><th>' + t('ewsVar') + '</th><td>' + fx(ew.lastVar, 4) + '</td></tr><tr><th>' + t('ewsAC') + '</th><td>' + fx(ew.lastAC, 3) + '</td></tr>' : '') +
      '</table>' +
      '<h2>' + t('parameters') + '</h2><table><tr>' + PARAM_SPEC.map(p => '<th>' + p.sym + '</th>').join('') + '</tr><tr>' +
      PARAM_SPEC.map(p => '<td>' + fx(S.params[p.k], 3) + '</td>').join('') + '</tr></table>' +
      (al.reasons.length ? '<h2>' + t('alertPanel') + '</h2><ul>' + al.reasons.map(r => '<li>' + t('reason_' + r) + '</li>').join('') + '</ul>' : '') +
      (S.dash.log.length ? '<h2>' + t('readingLog') + ' (' + S.dash.log.length + ')</h2><table><tr><th>' + t('timestamp') + '</th>' +
        VARS.map(k => '<th>' + k + '</th>').join('') + '</tr>' +
        S.dash.log.slice(-40).map(r => '<tr><td>' + new Date(r.iso).toLocaleString(S.lang === 'ar' ? 'ar' : 'en-GB') + '</td>' +
          r.x.map(v => '<td>' + fx(v, 2) + '</td>').join('') + '</tr>').join('') + '</table>' : '') +
      '<p class="muted" style="margin-top:20px">' + t('refPaperTxt') + '</p>' +
      '</body></html>';
    const w = window.open('', '_blank');
    if (!w) { download('biosense-report.html', 'text/html', html); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { } }, 400);
  }

  /* ---------------- reference tables ---------------- */
  function buildRefTables() {
    const st = BSM.sensitivity(S.params);
    $('#sensTable').innerHTML = '<table><thead><tr><th>' + t('symbol') + '</th><th class="num">Υ</th><th>' + t('meaning') + '</th></tr></thead><tbody>' +
      PARAM_SPEC.filter(p => st[p.k] !== 0).map(p =>
        '<tr><td>' + p.sym + '</td><td class="num" style="color:' + (st[p.k] > 0 ? 'var(--danger)' : 'var(--ok)') + '">' +
        (st[p.k] > 0 ? '+' : '') + st[p.k].toFixed(3) + '</td><td>' + t('p_' + p.k) + '</td></tr>').join('') +
      '</tbody></table>';
    $('#refParamTable').innerHTML = '<table><thead><tr><th>' + t('symbol') + '</th><th class="num">' + t('value') + '</th><th>' + t('meaning') + '</th></tr></thead><tbody>' +
      PARAM_SPEC.map(p => '<tr><td>' + p.sym + '</td><td class="num">' + BSM.REF[p.k] + '</td><td>' + t('p_' + p.k) + ' — ' + t('p_' + p.k + '_d') + '</td></tr>').join('') +
      '</tbody></table>';
  }
  function renderRef() {
    buildRefTables();
    const c = classification();
    $('#refR0Live').textContent = 'R₀ = ' + fx(c.R0, 4) + ' · β_H = ' + (c.betaHopf === null ? t('na') : fx(c.betaHopf, 4)) +
      ' · ' + t('betaCrit') + ' = ' + fx(c.betaCritical, 4);
  }

  function renderAll() {
    if (S.view === 'sim') renderSim();
    else if (S.view === 'dash') { renderStatus(); renderDash(); }
    else renderRef();
  }

  /* ---------------- events ---------------- */
  function bind() {
    $$('.tab').forEach(b => b.onclick = () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      S.view = b.dataset.view;
      $$('.view').forEach(v => v.classList.remove('active'));
      $('#view-' + S.view).classList.add('active');
      $('#statusbar').style.display = S.view === 'ref' ? 'none' : '';
      save(); renderAll();
    });

    $('#btnLang').onclick = () => { S.lang = S.lang === 'ar' ? 'en' : 'ar'; save(); applyLang(); };
    $('#btnTheme').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); };
    $('#btnResetSim').onclick = () => {
      S.params = Object.assign({}, BSM.REF); S.x0 = Object.assign({}, DEF.x0); S.T = 200;
      buildAll(); save(); renderAll();
    };
    $('#btnCsv').onclick = () => download('biosense-simulation.csv', 'text/csv', simCsv());
    $('#btnPng').onclick = () => {
      const cv = $('#cTs');
      const out = document.createElement('canvas');
      out.width = cv.width; out.height = cv.height;
      const cx = out.getContext('2d');
      cx.fillStyle = cssv('--card') || '#fff'; cx.fillRect(0, 0, out.width, out.height);
      cx.drawImage(cv, 0, 0);
      out.toBlob(b => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b);
        a.download = 'biosense-timeseries.png'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 500);
      });
    };
    $('#btnLink').onclick = () => {
      const q = new URLSearchParams();
      BSM.PARAM_KEYS.forEach(k => q.set(k, S.params[k]));
      VARS.forEach(k => q.set('x' + k, S.x0[k]));
      q.set('T', S.T); q.set('lang', S.lang);
      const url = location.origin + location.pathname + '#' + q.toString();
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast(t('linkCopied')), () => prompt('', url));
      else prompt('', url);
    };
    $('#chkLive').onchange = e => toggleLive(e.target.checked);

    $$('#inputMode .seg-btn').forEach(b => b.onclick = () => {
      $$('#inputMode .seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      S.dash.inputMode = b.dataset.mode;
      $('#sensorBlock').classList.toggle('hidden', S.dash.inputMode !== 'sensors');
      $('#directBlock').classList.toggle('hidden', S.dash.inputMode !== 'direct');
      save(); renderDash();
    });
    $('#btnAddReading').onclick = addReading;
    $('#chkAlertSound').onchange = e => { S.dash.alertSound = e.target.checked; save(); };
    $('#btnEstimate').onclick = runEstimation;
    $('#btnForecast').onclick = renderForecast;
    $('#btnExportLog').onclick = () => S.dash.log.length ? download('biosense-log.csv', 'text/csv', logCsv()) : toast(t('noReadings'));
    $('#btnImportLog').onclick = () => $('#fileImport').click();
    $('#fileImport').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => importCsv(String(r.result));
      r.readAsText(f); e.target.value = '';
    };
    $('#btnClearLog').onclick = () => { if (confirm(t('confirmClear'))) { S.dash.log = []; save(); renderDash(); } };
    $('#btnReport').onclick = printReport;

    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderAll, 160); });
    window.addEventListener('hashchange', () => { S = load(); applyLang(); });
  }

  /* ---------------- PWA plumbing ---------------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    $('#btnInstall').classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null; $('#btnInstall').classList.add('hidden'); toast(t('installed'));
  });
  function initInstall() {
    const btn = $('#btnInstall');
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!standalone && isIos) btn.classList.remove('hidden');
    btn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null; btn.classList.add('hidden');
      } else {
        toast(isIos ? t('installIos') : t('installHint'));
      }
    };
  }
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast(t('updateAvailable'));
        });
      });
    }).catch(() => { });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    applyTheme();
    bind();
    applyLang();
    $('#chkAlertSound').checked = !!S.dash.alertSound;
    $('#sensorBlock').classList.toggle('hidden', S.dash.inputMode !== 'sensors');
    $('#directBlock').classList.toggle('hidden', S.dash.inputMode !== 'direct');
    $$('#inputMode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.dash.inputMode));
    // restore view
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + S.view).classList.add('active');
    $('#statusbar').style.display = S.view === 'ref' ? 'none' : '';
    initInstall(); initSW();
    renderAll();
    window.BSMAPP = { S: () => S, render: renderAll };  // debug/testing hook
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
