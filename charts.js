/* =====================================================================
   BioSense-Math : minimal offline canvas charting
   No external libraries. Retina-aware. Theme-aware (reads CSS variables).
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Chart = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function css(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(240, rect.width), h = Math.max(140, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function niceNum(range, round) {
    const exp = Math.floor(Math.log10(range || 1));
    const f = (range || 1) / Math.pow(10, exp);
    let nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }
  function ticks(min, max, n) {
    if (!isFinite(min) || !isFinite(max) || min === max) { min = min - 1; max = max + 1; }
    const range = niceNum(max - min, false);
    const step = niceNum(range / Math.max(1, (n || 5) - 1), true);
    const gmin = Math.floor(min / step) * step, gmax = Math.ceil(max / step) * step;
    const out = [];
    for (let v = gmin; v <= gmax + step * 0.5; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: out, min: gmin, max: gmax, step: step };
  }
  function fmt(v, step) {
    const a = Math.abs(v);
    if (a >= 1e5 || (a > 0 && a < 1e-3)) return v.toExponential(1);
    const d = step && step < 1 ? Math.min(4, Math.max(0, Math.ceil(-Math.log10(step)))) : (a >= 100 ? 0 : a >= 10 ? 1 : 2);
    return v.toFixed(d);
  }

  const PAL = {
    H: '#0d9488', S: '#d97706', D: '#dc2626', B: '#7c3aed', R: '#2563eb',
    grid: () => css('--grid', 'rgba(128,140,160,.22)'),
    axis: () => css('--axis', 'rgba(120,132,152,.75)'),
    text: () => css('--muted', '#64748b'),
    fg: () => css('--fg', '#0f172a'),
    accent: () => css('--accent', '#0d9488'),
    danger: () => css('--danger', '#dc2626'),
    warn: () => css('--warn', '#d97706')
  };

  /* ---------------- generic 2-D frame ---------------- */
  function frame(o) {
    const { ctx, w, h } = o.dim;
    const padL = o.padL === undefined ? 46 : o.padL,
      padR = o.padR === undefined ? 12 : o.padR,
      padT = o.padT === undefined ? 12 : o.padT,
      padB = o.padB === undefined ? 30 : o.padB;
    const x0 = padL, y0 = h - padB, x1 = w - padR, y1 = padT;
    const tx = ticks(o.xmin, o.xmax, o.xn || 6), ty = ticks(o.ymin, o.ymax, o.yn || 5);
    const xmin = o.tightX ? o.xmin : tx.min, xmax = o.tightX ? o.xmax : tx.max;
    const ymin = o.tightY ? o.ymin : ty.min, ymax = o.tightY ? o.ymax : ty.max;
    const X = v => x0 + (v - xmin) / (xmax - xmin || 1) * (x1 - x0);
    const Y = v => y0 - (v - ymin) / (ymax - ymin || 1) * (y0 - y1);

    ctx.save();
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif';
    ctx.strokeStyle = PAL.grid(); ctx.fillStyle = PAL.text(); ctx.lineWidth = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    tx.ticks.forEach(v => {
      if (v < xmin - 1e-12 || v > xmax + 1e-12) return;
      const px = Math.round(X(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, y1); ctx.lineTo(px, y0); ctx.stroke();
      ctx.fillText(fmt(v, tx.step), px, y0 + 6);
    });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ty.ticks.forEach(v => {
      if (v < ymin - 1e-12 || v > ymax + 1e-12) return;
      const py = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.stroke();
      ctx.fillText(fmt(v, ty.step), x0 - 6, py);
    });
    ctx.strokeStyle = PAL.axis();
    ctx.beginPath(); ctx.moveTo(x0 + .5, y1); ctx.lineTo(x0 + .5, y0 + .5); ctx.lineTo(x1, y0 + .5); ctx.stroke();
    if (o.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = PAL.text(); ctx.fillText(o.xlabel, (x0 + x1) / 2, h - 2); }
    if (o.ylabel) {
      ctx.save(); ctx.translate(11, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
    }
    ctx.restore();
    return { ctx, w, h, X, Y, x0, x1, y0, y1, xmin, xmax, ymin, ymax };
  }

  function clipPlot(f) { const c = f.ctx; c.save(); c.beginPath(); c.rect(f.x0, f.y1, f.x1 - f.x0, f.y0 - f.y1); c.clip(); }

  /* ---------------- time series ---------------- */
  function lineChart(canvas, opts) {
    const dim = setup(canvas);
    const series = opts.series.filter(s => s.visible !== false);
    let ymin = opts.ymin, ymax = opts.ymax;
    if (ymin === undefined || ymax === undefined) {
      let lo = Infinity, hi = -Infinity;
      series.forEach(s => s.y.forEach(v => { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
      (opts.refLines || []).forEach(r => { lo = Math.min(lo, r.value); hi = Math.max(hi, r.value); });
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      const pad = (hi - lo) * 0.08 || 0.5;
      ymin = opts.zeroBase !== false ? Math.min(0, lo) : lo - pad;
      ymax = hi + pad;
    }
    const f = frame({
      dim: dim, xmin: opts.x[0], xmax: opts.x[opts.x.length - 1], ymin: ymin, ymax: ymax,
      xlabel: opts.xlabel, ylabel: opts.ylabel, tightX: true, padB: opts.xlabel ? 42 : 30
    });
    clipPlot(f);
    const c = f.ctx;
    (opts.refLines || []).forEach(r => {
      c.save(); c.setLineDash([4, 4]); c.strokeStyle = r.color || PAL.grid(); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(f.x0, f.Y(r.value)); c.lineTo(f.x1, f.Y(r.value)); c.stroke(); c.restore();
    });
    (opts.vLines || []).forEach(r => {
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = r.color || PAL.danger(); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(f.X(r.value), f.y1); c.lineTo(f.X(r.value), f.y0); c.stroke(); c.restore();
    });
    series.forEach(s => {
      c.beginPath();
      c.lineWidth = s.width || 2; c.strokeStyle = s.color; c.lineJoin = 'round';
      if (s.dash) c.setLineDash(s.dash); else c.setLineDash([]);
      let started = false;
      for (let i = 0; i < s.y.length; i++) {
        const v = s.y[i]; if (!isFinite(v)) { started = false; continue; }
        const px = f.X(opts.x[i]), py = f.Y(v);
        if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
      }
      c.stroke(); c.setLineDash([]);
    });
    (opts.points || []).forEach(p => {
      c.beginPath(); c.fillStyle = p.color || PAL.accent();
      c.arc(f.X(p.x), f.Y(p.y), p.r || 4, 0, 2 * Math.PI); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = css('--card', '#fff'); c.stroke();
    });
    c.restore();
    return f;
  }

  /* ---------------- phase portrait ---------------- */
  function phaseChart(canvas, opts) {
    const dim = setup(canvas);
    const xs = opts.x, ys = opts.y;
    let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      xlo = Math.min(xlo, xs[i]); xhi = Math.max(xhi, xs[i]);
      ylo = Math.min(ylo, ys[i]); yhi = Math.max(yhi, ys[i]);
    }
    const px = (xhi - xlo) * 0.08 || 0.5, py = (yhi - ylo) * 0.08 || 0.5;
    // state variables are non-negative: never pad below zero
    const xm = xlo >= 0 ? Math.max(0, xlo - px) : xlo - px;
    const ym = ylo >= 0 ? Math.max(0, ylo - py) : ylo - py;
    const f = frame({
      dim: dim, xmin: xm, xmax: xhi + px, ymin: ym, ymax: yhi + py,
      xlabel: opts.xlabel, ylabel: opts.ylabel, padB: 42
    });
    clipPlot(f);
    const c = f.ctx;
    const n = xs.length;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      c.beginPath();
      c.strokeStyle = opts.fade === false ? (opts.color || PAL.accent())
        : mixColor(css('--grid', '#c7d2de'), opts.color || PAL.accent(), 0.25 + 0.75 * t);
      c.lineWidth = 1.6;
      c.moveTo(f.X(xs[i - 1]), f.Y(ys[i - 1])); c.lineTo(f.X(xs[i]), f.Y(ys[i])); c.stroke();
    }
    // start & end markers
    c.beginPath(); c.fillStyle = PAL.text(); c.arc(f.X(xs[0]), f.Y(ys[0]), 3.5, 0, 7); c.fill();
    c.beginPath(); c.fillStyle = opts.endColor || PAL.danger(); c.arc(f.X(xs[n - 1]), f.Y(ys[n - 1]), 4.5, 0, 7); c.fill();
    if (opts.eq) {
      c.save(); c.strokeStyle = PAL.fg(); c.lineWidth = 1.6;
      const ex = f.X(opts.eq[0]), ey = f.Y(opts.eq[1]);
      c.beginPath(); c.moveTo(ex - 5, ey - 5); c.lineTo(ex + 5, ey + 5); c.moveTo(ex + 5, ey - 5); c.lineTo(ex - 5, ey + 5); c.stroke(); c.restore();
    }
    c.restore();
    return f;
  }

  function mixColor(a, b, t) {
    const pa = parseColor(a), pb = parseColor(b);
    if (!pa || !pb) return b;
    const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return 'rgb(' + m.join(',') + ')';
  }
  function parseColor(s) {
    s = (s || '').trim();
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3) h = h.split('').map(x => x + x).join('');
      if (h.length < 6) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2]]; }
    return null;
  }

  /* ---------------- bifurcation diagram ---------------- */
  function bifurcationChart(canvas, opts) {
    const dim = setup(canvas);
    const pts = opts.data; // [{beta, H, stable, min, max}]
    let ylo = Infinity, yhi = -Infinity;
    pts.forEach(p => {
      [p.H, p.min, p.max].forEach(v => { if (isFinite(v)) { ylo = Math.min(ylo, v); yhi = Math.max(yhi, v); } });
    });
    if (!isFinite(ylo)) { ylo = 0; yhi = 1; }
    const f = frame({
      dim: dim, xmin: pts[0].beta, xmax: pts[pts.length - 1].beta,
      ymin: Math.min(0, ylo), ymax: yhi * 1.08 + 0.1, xlabel: opts.xlabel, ylabel: opts.ylabel, tightX: true, padB: 42
    });
    clipPlot(f);
    const c = f.ctx;
    // amplitude envelope for the oscillatory branch
    const osc = pts.filter(p => p.min !== undefined && p.max !== undefined && !p.stable);
    if (osc.length > 1) {
      c.beginPath();
      osc.forEach((p, i) => { const X = f.X(p.beta), Y = f.Y(p.max); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      for (let i = osc.length - 1; i >= 0; i--) c.lineTo(f.X(osc[i].beta), f.Y(osc[i].min));
      c.closePath();
      c.fillStyle = mixColor(css('--card', '#fff'), PAL.danger(), 0.16); c.fill();
      c.strokeStyle = PAL.danger(); c.lineWidth = 1.4;
      c.beginPath(); osc.forEach((p, i) => { const X = f.X(p.beta), Y = f.Y(p.max); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
      c.beginPath(); osc.forEach((p, i) => { const X = f.X(p.beta), Y = f.Y(p.min); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
    }
    // equilibrium branch
    let seg = [], prevStable = null;
    const flush = () => {
      if (seg.length < 2) { seg = []; return; }
      c.beginPath(); c.lineWidth = 2.2; c.strokeStyle = PAL.accent();
      if (prevStable) c.setLineDash([]); else c.setLineDash([5, 4]);
      seg.forEach((p, i) => { const X = f.X(p.beta), Y = f.Y(p.H); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      c.stroke(); c.setLineDash([]); seg = [];
    };
    pts.forEach(p => {
      if (prevStable === null) prevStable = p.stable;
      if (p.stable !== prevStable) { const last = seg[seg.length - 1]; flush(); prevStable = p.stable; if (last) seg.push(last); }
      seg.push(p);
    });
    flush();
    if (opts.hopf !== null && opts.hopf !== undefined) {
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = PAL.danger(); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(f.X(opts.hopf), f.y1); c.lineTo(f.X(opts.hopf), f.y0); c.stroke(); c.restore();
    }
    if (opts.rc !== null && opts.rc !== undefined) {
      c.save(); c.setLineDash([2, 3]); c.strokeStyle = PAL.text(); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(f.X(opts.rc), f.y1); c.lineTo(f.X(opts.rc), f.y0); c.stroke(); c.restore();
    }
    if (opts.current !== undefined) {
      const cur = pts.reduce((a, b) => Math.abs(b.beta - opts.current) < Math.abs(a.beta - opts.current) ? b : a, pts[0]);
      c.beginPath(); c.fillStyle = PAL.fg(); c.arc(f.X(opts.current), f.Y(cur.H), 4.5, 0, 7); c.fill();
      c.strokeStyle = css('--card', '#fff'); c.lineWidth = 1.5; c.stroke();
    }
    c.restore();
    return f;
  }

  /* ---------------- eigenvalue (complex plane) ---------------- */
  function eigenChart(canvas, opts) {
    const dim = setup(canvas);
    const ev = opts.eigenvalues;
    let lo = 0, hi = 0, ilo = 0, ihi = 0;
    ev.forEach(e => { lo = Math.min(lo, e.re); hi = Math.max(hi, e.re); ilo = Math.min(ilo, e.im); ihi = Math.max(ihi, e.im); });
    const padx = Math.max(0.12, (hi - lo) * 0.18), pady = Math.max(0.12, (ihi - ilo) * 0.2);
    const f = frame({
      dim: dim, xmin: lo - padx, xmax: hi + padx, ymin: ilo - pady, ymax: ihi + pady,
      xlabel: opts.xlabel, ylabel: opts.ylabel, padB: 42
    });
    clipPlot(f);
    const c = f.ctx;
    // unstable half plane
    if (f.xmax > 0) {
      c.fillStyle = mixColor(css('--card', '#fff'), PAL.danger(), 0.10);
      c.fillRect(f.X(0), f.y1, f.x1 - f.X(0), f.y0 - f.y1);
    }
    c.strokeStyle = PAL.danger(); c.lineWidth = 1.6; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(f.X(0), f.y1); c.lineTo(f.X(0), f.y0); c.stroke(); c.setLineDash([]);
    ev.forEach(e => {
      c.beginPath();
      c.fillStyle = e.re > 0 ? PAL.danger() : (e.re > -0.05 ? PAL.warn() : PAL.accent());
      c.arc(f.X(e.re), f.Y(e.im), 5.5, 0, 7); c.fill();
      c.lineWidth = 1.4; c.strokeStyle = css('--card', '#fff'); c.stroke();
    });
    c.restore();
    return f;
  }

  /* ---------------- sparkline ---------------- */
  function sparkline(canvas, values, opts) {
    opts = opts || {};
    const dim = setup(canvas);
    const c = dim.ctx, w = dim.w, h = dim.h;
    if (!values.length) return;
    let lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    const X = i => 3 + i / Math.max(1, values.length - 1) * (w - 6);
    const Y = v => h - 4 - (v - lo) / (hi - lo) * (h - 8);
    if (opts.fill !== false) {
      c.beginPath(); c.moveTo(X(0), h);
      values.forEach((v, i) => c.lineTo(X(i), Y(v)));
      c.lineTo(X(values.length - 1), h); c.closePath();
      c.fillStyle = mixColor(css('--card', '#fff'), opts.color || PAL.accent(), 0.18); c.fill();
    }
    c.beginPath(); c.lineWidth = 1.8; c.strokeStyle = opts.color || PAL.accent(); c.lineJoin = 'round';
    values.forEach((v, i) => { const px = X(i), py = Y(v); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.stroke();
    c.beginPath(); c.fillStyle = opts.color || PAL.accent();
    c.arc(X(values.length - 1), Y(values[values.length - 1]), 2.6, 0, 7); c.fill();
  }

  /* ---------------- radial gauge ---------------- */
  function gauge(canvas, value, max, opts) {
    opts = opts || {};
    const dim = setup(canvas);
    const c = dim.ctx, w = dim.w, h = dim.h;
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;      // 3/4 dial opening downwards
    const lw = Math.max(6, Math.min(w, h) * 0.085);
    const r = Math.min((w - lw) / 2 - 2, (h - lw) / 2 - 2, h * 0.46);
    const cx = w / 2, cy = h / 2 + r * 0.10;
    c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy, r, a0, a1); c.lineWidth = lw;
    c.strokeStyle = css('--track', 'rgba(128,140,160,.20)'); c.stroke();
    const frac = Math.max(0, Math.min(1, value / (max || 1)));
    if (frac > 0) {
      c.beginPath(); c.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac); c.lineWidth = lw;
      c.strokeStyle = opts.color || PAL.accent(); c.stroke();
    }
    c.fillStyle = PAL.fg();
    c.font = '700 ' + Math.round(r * 0.62) + 'px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(opts.text !== undefined ? opts.text : value.toFixed(2), cx, cy - r * 0.06);
    if (opts.label) {
      c.fillStyle = PAL.text(); c.font = '600 12px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif';
      c.fillText(opts.label, cx, cy + r * 0.52);
    }
  }

  return { lineChart, phaseChart, bifurcationChart, eigenChart, sparkline, gauge, PAL, mixColor, setup };
});
