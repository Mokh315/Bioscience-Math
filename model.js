/* =====================================================================
   BioSense-Math : mathematical core
   Five-compartment cellular-stress model
     H' = a H (1 - H/K) - beta B H
     S' = beta B H - (gamma+mu) S + eta R
     D' = mu S - delta D
     B' = lambda D - theta B
     R' = sigma H - rho R
   Pure functions, no DOM. Usable in browser and in node (tests).
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BSM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REF = {
    a: 0.80, K: 10.0, beta: 0.15, gamma: 0.40, mu: 0.30, eta: 0.10,
    delta: 0.50, lambda: 0.60, theta: 0.20, sigma: 0.50, rho: 0.70
  };
  const REF_X0 = { H: 9, S: 1, D: 0.2, B: 0.1, R: 0.5 };

  const PARAM_KEYS = ['a', 'K', 'beta', 'gamma', 'mu', 'eta', 'delta', 'lambda', 'theta', 'sigma', 'rho'];
  const STATE_KEYS = ['H', 'S', 'D', 'B', 'R'];

  /* ---------- vector field ---------- */
  function rhs(x, p) {
    const H = x[0], S = x[1], D = x[2], B = x[3], R = x[4];
    return [
      p.a * H * (1 - H / p.K) - p.beta * B * H,
      p.beta * B * H - (p.gamma + p.mu) * S + p.eta * R,
      p.mu * S - p.delta * D,
      p.lambda * D - p.theta * B,
      p.sigma * H - p.rho * R
    ];
  }

  /* ---------- basic reproduction number ---------- */
  function R0(p) {
    return (p.beta * p.K * p.mu * p.lambda) / ((p.gamma + p.mu) * p.delta * p.theta);
  }
  /* beta giving R0 = 1 */
  function betaCritical(p) {
    return ((p.gamma + p.mu) * p.delta * p.theta) / (p.K * p.mu * p.lambda);
  }
  /* normalised forward sensitivity indices of R0 */
  function sensitivity(p) {
    const g = p.gamma / (p.gamma + p.mu);
    return { beta: 1, K: 1, lambda: 1, delta: -1, theta: -1, mu: g, gamma: -g, a: 0, eta: 0, sigma: 0, rho: 0 };
  }

  /* ---------- Jacobian ---------- */
  function jacobian(x, p) {
    const H = x[0], B = x[3];
    return [
      [p.a - 2 * p.a * H / p.K - p.beta * B, 0, 0, -p.beta * H, 0],
      [p.beta * B, -(p.gamma + p.mu), 0, p.beta * H, p.eta],
      [0, p.mu, -p.delta, 0, 0],
      [0, 0, p.lambda, -p.theta, 0],
      [p.sigma, 0, 0, 0, -p.rho]
    ];
  }

  /* ---------- equilibria ---------- */
  function E0(p) { return [p.K, 0, 0, 0, p.sigma * p.K / p.rho]; }
  function Etrivial() { return [0, 0, 0, 0, 0]; }

  /* Endemic (interior) equilibrium.
     Cascade: D=(mu/delta)S, B=(lambda/theta)D, R=(sigma/rho)H
     S* = (eta sigma/rho) H / [ (gamma+mu) - k H ],  k = beta mu lambda/(delta theta)
     and  a(1-H/K) = k S*.  Solve scalar equation on (0, min(K, (gamma+mu)/k)). */
  function endemic(p) {
    const k = p.beta * p.mu * p.lambda / (p.delta * p.theta);
    if (!(k > 0)) return null;
    const Hmax = Math.min(p.K, (p.gamma + p.mu) / k);
    const f = function (H) {
      const den = (p.gamma + p.mu) - k * H;
      if (den <= 0) return -Infinity;
      const S = (p.eta * p.sigma / p.rho) * H / den;
      return p.a * (1 - H / p.K) - k * S;
    };
    let lo = 1e-12, hi = Hmax * (1 - 1e-12);
    let flo = f(lo), fhi = f(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) {
      // no sign change (e.g. eta = 0): fall back to the eta=0 explicit branch
      if (p.eta === 0) {
        // S* free: use H* = (gamma+mu)delta theta/(beta mu lambda) when R0>1
        const Hs = (p.gamma + p.mu) * p.delta * p.theta / (p.beta * p.mu * p.lambda);
        if (Hs > 0 && Hs < p.K) {
          const S = p.a * (1 - Hs / p.K) / k;
          return [Hs, S, p.mu / p.delta * S, p.lambda / p.theta * (p.mu / p.delta) * S, p.sigma / p.rho * Hs];
        }
      }
      return null;
    }
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi), fm = f(mid);
      if (fm === 0) { lo = hi = mid; break; }
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    const Hs = 0.5 * (lo + hi);
    const S = (p.eta * p.sigma / p.rho) * Hs / ((p.gamma + p.mu) - k * Hs);
    const D = p.mu / p.delta * S;
    const B = p.lambda / p.theta * D;
    const R = p.sigma / p.rho * Hs;
    return [Hs, S, D, B, R];
  }

  /* ---------- eigenvalues: Faddeev-LeVerrier + Durand-Kerner ---------- */
  function charPoly(A) {
    // returns [1, c1, ..., cn] of det(lambda I - A)
    const n = A.length;
    let M = A.map(r => r.slice()).map(r => r.map(() => 0)); // zero
    const c = [1];
    let Mk = null;
    for (let k = 1; k <= n; k++) {
      if (k === 1) Mk = A.map(r => r.slice());
      else {
        // Mk = A * (M_{k-1} + c_{k-1} I)
        const T = Mk.map((r, i) => r.map((v, j) => v + (i === j ? c[k - 1] : 0)));
        Mk = matmul(A, T);
      }
      let tr = 0; for (let i = 0; i < n; i++) tr += Mk[i][i];
      c.push(-tr / k);
    }
    return c;
  }
  function matmul(A, B) {
    const n = A.length, m = B[0].length, q = B.length;
    const C = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(m).fill(0);
      for (let k = 0; k < q; k++) { const aik = A[i][k]; if (aik === 0) continue; for (let j = 0; j < m; j++) row[j] += aik * B[k][j]; }
      C.push(row);
    }
    return C;
  }
  function cAdd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function cSub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function cMul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function cDiv(a, b) { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
  function cAbs(a) { return Math.hypot(a[0], a[1]); }

  function polyRoots(c) {
    // c = [1, c1, ... cn]; monic. Durand-Kerner.
    const n = c.length - 1;
    let z = [];
    for (let i = 0; i < n; i++) {
      const ang = 2 * Math.PI * i / n + 0.35;
      z.push([0.4 * Math.cos(ang) + 0.9 * Math.cos(ang), 0.4 * Math.sin(ang) + 0.9 * Math.sin(ang)]);
    }
    const evalP = function (x) {
      let r = [1, 0];
      for (let i = 1; i <= n; i++) r = cAdd(cMul(r, x), [c[i], 0]);
      return r;
    };
    for (let it = 0; it < 800; it++) {
      let maxd = 0;
      for (let i = 0; i < n; i++) {
        let den = [1, 0];
        for (let j = 0; j < n; j++) if (j !== i) den = cMul(den, cSub(z[i], z[j]));
        if (cAbs(den) < 1e-300) continue;
        const dz = cDiv(evalP(z[i]), den);
        z[i] = cSub(z[i], dz);
        maxd = Math.max(maxd, cAbs(dz));
      }
      if (maxd < 1e-14) break;
    }
    return z.map(v => ({ re: v[0], im: Math.abs(v[1]) < 1e-10 ? 0 : v[1] }));
  }
  function eigenvalues(A) { return polyRoots(charPoly(A)); }
  function maxRe(A) { return eigenvalues(A).reduce((m, e) => Math.max(m, e.re), -Infinity); }

  /* ---------- Hopf threshold in beta ---------- */
  function maxReAtEndemic(p) {
    const E = endemic(p);
    if (!E) return null;
    return maxRe(jacobian(E, p));
  }
  function hopfBeta(p, lo, hi) {
    lo = lo || betaCritical(p) * 1.05;
    hi = hi || 3.0;
    const f = b => { const q = Object.assign({}, p, { beta: b }); const m = maxReAtEndemic(q); return m === null ? null : m; };
    let flo = f(lo);
    if (flo === null || flo > 0) return null;
    // expand to find sign change
    let a = lo, b = lo, fb = flo, found = false;
    const steps = 240;
    for (let i = 1; i <= steps; i++) {
      const x = lo * Math.pow(hi / lo, i / steps);
      const fx = f(x);
      if (fx === null) break;
      if (fx > 0) { a = b; b = x; found = true; break; }
      b = x; fb = fx;
    }
    if (!found) return null;
    for (let i = 0; i < 90; i++) {
      const mid = 0.5 * (a + b), fm = f(mid);
      if (fm === null) break;
      if (fm > 0) b = mid; else a = mid;
    }
    return 0.5 * (a + b);
  }

  /* ---------- integrator: Dormand-Prince RK45 with adaptive step ---------- */
  const DP_A = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
  ];
  const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
  const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];

  function integrate(x0, p, tEnd, opts) {
    opts = opts || {};
    const nOut = opts.nOut || 1200;
    const rtol = opts.rtol || 1e-8, atol = opts.atol || 1e-10;
    const tStart = opts.tStart || 0;
    const out = { t: [], y: [[], [], [], [], []] };
    const grid = [];
    for (let i = 0; i < nOut; i++) grid.push(tStart + (tEnd - tStart) * i / (nOut - 1));
    let t = tStart, x = x0.slice(), h = Math.max((tEnd - tStart) / 2000, 1e-6);
    let gi = 0;
    const push = (tt, xx) => { out.t.push(tt); for (let j = 0; j < 5; j++) out.y[j].push(xx[j]); };
    push(t, x); gi = 1;
    let guard = 0;
    while (t < tEnd && guard++ < 400000) {
      if (t + h > tEnd) h = tEnd - t;
      const k = [];
      for (let s = 0; s < 7; s++) {
        const xs = x.slice();
        for (let j = 0; j < s; j++) { const aij = DP_A[s][j]; if (!aij) continue; for (let d = 0; d < 5; d++) xs[d] += h * aij * k[j][d]; }
        k.push(rhs(xs, p));
      }
      const x5 = x.slice(), x4 = x.slice();
      for (let s = 0; s < 7; s++) for (let d = 0; d < 5; d++) { x5[d] += h * DP_B5[s] * k[s][d]; x4[d] += h * DP_B4[s] * k[s][d]; }
      let err = 0;
      for (let d = 0; d < 5; d++) {
        const sc = atol + rtol * Math.max(Math.abs(x[d]), Math.abs(x5[d]));
        err = Math.max(err, Math.abs(x5[d] - x4[d]) / sc);
      }
      if (err <= 1 || h <= 1e-10) {
        const tNew = t + h;
        // dense-ish output by linear interpolation on the fine step (h is small)
        while (gi < nOut && grid[gi] <= tNew + 1e-15) {
          const w = h === 0 ? 1 : (grid[gi] - t) / h;
          const xi = [];
          for (let d = 0; d < 5; d++) xi.push(x[d] + w * (x5[d] - x[d]));
          push(grid[gi], xi); gi++;
        }
        t = tNew; x = x5;
        if (!isFinite(x[0])) break;
      }
      const fac = Math.min(5, Math.max(0.2, 0.9 * Math.pow(1 / Math.max(err, 1e-16), 0.2)));
      h = Math.min(h * fac, (tEnd - tStart) / 20);
      if (h < 1e-12) break;
    }
    while (out.t.length < nOut) push(tEnd, x);
    out.final = x;
    return out;
  }

  /* ---------- classification ---------- */
  function classify(p) {
    const r0 = R0(p);
    const bh = hopfBeta(p);
    let regime;
    if (r0 < 1) regime = 'free';
    else if (bh !== null && p.beta > bh) regime = 'oscillatory';
    else regime = 'endemic';
    const E = regime === 'free' ? E0(p) : (endemic(p) || E0(p));
    const eig = eigenvalues(jacobian(E, p));
    const mr = eig.reduce((m, e) => Math.max(m, e.re), -Infinity);
    return {
      R0: r0, betaHopf: bh, regime: regime, equilibrium: E, eigenvalues: eig, maxRe: mr,
      betaCritical: betaCritical(p),
      hopfMargin: bh === null ? null : (bh - p.beta) / bh,   // fraction of beta_H remaining
      relaxationTime: mr < 0 ? 1 / Math.abs(mr) : null
    };
  }

  /* ---------- early-warning statistics ---------- */
  function variance(v) {
    if (v.length < 2) return 0;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1);
  }
  function lag1AC(v) {
    const n = v.length;
    if (n < 3) return 0;
    const m = v.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { const d = v[i] - m; den += d * d; if (i < n - 1) num += d * (v[i + 1] - m); }
    return den === 0 ? 0 : num / den;
  }
  function linTrend(v) {
    const n = v.length; if (n < 3) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += v[i]; sxy += i * v[i]; sxx += i * i; }
    const den = n * sxx - sx * sx;
    return den === 0 ? 0 : (n * sxy - sx * sy) / den;
  }
  /* rolling EWS over a log of states (array of {t, x:[H,S,D,B,R]}) */
  function ews(log, key, win) {
    key = key === undefined ? 0 : key;
    win = win || 10;
    const series = log.map(r => r.x[key]);
    const vars = [], acs = [];
    for (let i = win; i <= series.length; i++) {
      const w = series.slice(i - win, i);
      // detrend (remove linear drift) before computing indicators
      const s = linTrend(w), m = w.reduce((a, b) => a + b, 0) / w.length, c = (w.length - 1) / 2;
      const dw = w.map((v, j) => v - (m + s * (j - c)));
      vars.push(variance(dw)); acs.push(lag1AC(dw));
    }
    return {
      variance: vars, autocorr: acs,
      varTrend: linTrend(vars), acTrend: linTrend(acs),
      lastVar: vars.length ? vars[vars.length - 1] : null,
      lastAC: acs.length ? acs[acs.length - 1] : null,
      n: series.length, window: win
    };
  }

  /* ---------- parameter estimation from a reading log ----------
     Each equation is linear in its parameters given (x, x'):
       H' = a H - (a/K) H^2 - beta B H          -> [a, aK:=a/K, beta]
       S' = beta BH - (gamma+mu) S + eta R      -> [beta, gm:=gamma+mu, eta]
       D' = mu S - delta D                      -> [mu, delta]
       B' = lambda D - theta B                  -> [lambda, theta]
       R' = sigma H - rho R                     -> [sigma, rho]
     Derivatives by central finite differences on the (possibly non-uniform) log.
     Solved by ridge-regularised least squares with non-negativity clamping. */
  function estimateParameters(log, prior) {
    if (!log || log.length < 4) return null;
    const rows = log.slice().sort((u, v) => u.t - v.t);
    /* Integral (trapezoidal) least squares:
         x_k(t_{i+1}) - x_k(t_i) = sum_j c_j * INT g_j dt
                                 ~ sum_j c_j * (dt/2)(g_j(x_i) + g_j(x_{i+1}))
       Every equation is linear in its parameters, so this stays a linear problem while
       avoiding the large bias of finite-difference derivatives on coarsely sampled data. */
    const seg = [];       // {dt, xa, xb}
    for (let i = 0; i < rows.length - 1; i++) {
      const dt = rows[i + 1].t - rows[i].t;
      if (!(dt > 0)) continue;
      seg.push({ dt: dt, xa: rows[i].x, xb: rows[i + 1].x });
    }
    if (seg.length < 3) return null;
    /* regressor integrals: gfun maps a state to the regressor row */
    const integ = gfun => seg.map(s => {
      const ga = gfun(s.xa), gb = gfun(s.xb);
      return ga.map((v, j) => 0.5 * s.dt * (v + gb[j]));
    });
    const dx = k => seg.map(s => s.xb[k] - s.xa[k]);
    /* states/derivatives kept for the reported residual statistics */
    const st = seg.map(s => s.xa);
    const der = seg.map(s => s.xb.map((v, k) => (v - s.xa[k]) / s.dt));

    function lstsq(cols, rhsv, lam) {
      const m = cols.length;
      const A = [], b = [];
      for (let i = 0; i < m; i++) { A.push(cols[i]); }
      // normal equations
      const n = cols[0].length;
      const N = Array.from({ length: n }, () => new Array(n).fill(0));
      const g = new Array(n).fill(0);
      for (let i = 0; i < m; i++) {
        for (let r = 0; r < n; r++) {
          g[r] += cols[i][r] * rhsv[i];
          for (let c = 0; c < n; c++) N[r][c] += cols[i][r] * cols[i][c];
        }
      }
      for (let r = 0; r < n; r++) N[r][r] += (lam || 1e-6);
      return solveLin(N, g);
    }
    function solveLin(A, b) {
      const n = b.length;
      const M = A.map((r, i) => r.concat([b[i]]));
      for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        if (Math.abs(M[piv][c]) < 1e-14) return null;
        const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
        for (let r = 0; r < n; r++) {
          if (r === c) continue;
          const f = M[r][c] / M[c][c];
          for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
      }
      const x = new Array(n);
      for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
      return x;
    }

    /* fit one equation and score it on its own residuals */
    function fitEq(cols, y) {
      const sol = lstsq(cols, y, 1e-6);
      if (!sol) return { sol: null, r2: null };
      const m = y.reduce((a, b) => a + b, 0) / y.length;
      let ss = 0, sr = 0;
      for (let i = 0; i < y.length; i++) {
        let yh = 0; for (let j = 0; j < sol.length; j++) yh += cols[i][j] * sol[j];
        ss += (y[i] - m) * (y[i] - m); sr += (y[i] - yh) * (y[i] - yh);
      }
      return { sol: sol, r2: ss > 1e-14 ? 1 - sr / ss : null };
    }

    const MIN_R2 = 0.5;                       // below this the equation is not identifiable from the data
    const BOUNDS = {
      a: [1e-4, 5], K: [0.2, 200], beta: [0, 2], gamma: [0, 5], mu: [1e-4, 5], eta: [0, 5],
      delta: [1e-4, 5], lambda: [0, 5], theta: [1e-4, 5], sigma: [0, 5], rho: [1e-4, 5]
    };
    const P = Object.assign({}, prior || REF);
    const accepted = {}, out = {};
    const put = (k, v, ok) => {
      const b = BOUNDS[k];
      if (ok && isFinite(v) && v >= b[0] && v <= b[1]) { P[k] = v; accepted[k] = true; }
      else accepted[k] = false;
    };

    const eqH = fitEq(integ(x => [x[0], -x[0] * x[0], -x[3] * x[0]]), dx(0));
    const eqS = fitEq(integ(x => [x[3] * x[0], -x[1], x[4]]), dx(1));
    const eqD = fitEq(integ(x => [x[1], -x[2]]), dx(2));
    const eqB = fitEq(integ(x => [x[2], -x[3]]), dx(3));
    const eqR = fitEq(integ(x => [x[0], -x[4]]), dx(4));

    const okH = eqH.sol && eqH.r2 !== null && eqH.r2 >= MIN_R2;
    if (eqH.sol) { out.a = eqH.sol[0]; out.K = eqH.sol[1] > 1e-9 ? eqH.sol[0] / eqH.sol[1] : NaN; out.beta = eqH.sol[2]; }
    put('a', out.a, okH); put('K', out.K, okH); put('beta', out.beta, okH);

    const okS = eqS.sol && eqS.r2 !== null && eqS.r2 >= MIN_R2;
    if (eqS.sol) { out.betaS = eqS.sol[0]; out.gammaPlusMu = eqS.sol[1]; out.eta = eqS.sol[2]; }
    if (!accepted.beta) put('beta', out.betaS, okS);
    put('eta', out.eta, okS);

    const okD = eqD.sol && eqD.r2 !== null && eqD.r2 >= MIN_R2;
    if (eqD.sol) { out.mu = eqD.sol[0]; out.delta = eqD.sol[1]; }
    put('mu', out.mu, okD); put('delta', out.delta, okD);

    const okB = eqB.sol && eqB.r2 !== null && eqB.r2 >= MIN_R2;
    if (eqB.sol) { out.lambda = eqB.sol[0]; out.theta = eqB.sol[1]; }
    put('lambda', out.lambda, okB); put('theta', out.theta, okB);

    const okR = eqR.sol && eqR.r2 !== null && eqR.r2 >= MIN_R2;
    if (eqR.sol) { out.sigma = eqR.sol[0]; out.rho = eqR.sol[1]; }
    put('sigma', out.sigma, okR); put('rho', out.rho, okR);

    // gamma comes from (gamma+mu) once mu is known
    put('gamma', (out.gammaPlusMu - P.mu), okS && isFinite(out.gammaPlusMu) && (out.gammaPlusMu - P.mu) >= 0);

    const r2 = { H: eqH.r2, S: eqS.r2, D: eqD.r2, B: eqB.r2, R: eqR.r2 };
    const scores = [eqH.r2, eqS.r2, eqD.r2, eqB.r2, eqR.r2].filter(v => v !== null && isFinite(v));
    const quality = scores.length ? Math.min.apply(null, scores) : null;
    const nAccepted = Object.keys(accepted).filter(k => accepted[k]).length;
    const timeSpan = rows[rows.length - 1].t - rows[0].t;
    return {
      params: P, raw: out, r2: r2, nPoints: der.length,
      accepted: accepted, nAccepted: nAccepted, quality: quality, timeSpan: timeSpan,
      reliable: quality !== null && quality >= MIN_R2 && nAccepted >= 6 && timeSpan > 0
    };
  }

  /* ---------- sensor -> state mapping (device calibration) ----------
     The instrument measures physical proxies; the computational layer maps them
     onto the five compartments. Default affine/normalised calibration, editable. */
  const DEFAULT_CAL = {
    // sensor ranges [min, max] used for normalisation
    temp: [20, 45], hum: [20, 95], opt: [0, 100], ph: [5.5, 8.5], flow: [0, 10],
    // structural gains
    Hgain: 10, Sgain: 6, Dgain: 4, Bgain: 6, Rgain: 4
  };
  function nrm(v, r) { return Math.min(1, Math.max(0, (v - r[0]) / (r[1] - r[0]))); }
  function sensorsToState(s, cal) {
    cal = Object.assign({}, DEFAULT_CAL, cal || {});
    const T = nrm(s.temp, cal.temp);          // thermal stress
    const Hm = nrm(s.hum, cal.hum);           // humidity
    const O = nrm(s.opt, cal.opt);            // fluorescence: viability fraction
    const phDev = Math.abs(s.ph - 7.0) / Math.max(1e-9, (cal.ph[1] - cal.ph[0]) / 2); // acid/base deviation
    const F = nrm(s.flow, cal.flow);          // flow: clearance / perfusion
    const stressIdx = Math.min(1, 0.5 * T + 0.3 * Math.min(1, phDev) + 0.2 * (1 - F));
    const H = cal.Hgain * O * (1 - 0.35 * stressIdx);
    const S = cal.Sgain * stressIdx * (0.35 + 0.65 * O);
    const D = cal.Dgain * (1 - O) * (0.3 + 0.7 * stressIdx);
    const B = cal.Bgain * Math.min(1, 0.65 * Math.min(1, phDev) + 0.35 * (1 - O));
    const R = cal.Rgain * (0.25 + 0.75 * Hm) * O;
    return [H, S, D, B, R].map(v => Math.max(0, Number(v.toFixed(4))));
  }

  /* ---------- operational alert logic ---------- */
  function alertStatus(p, state, ewsObj, opts) {
    opts = opts || {};
    const cls = classify(p);
    const reasons = [];
    let level = 'ok';            // ok | watch | alarm
    if (cls.R0 >= 1) { level = 'alarm'; reasons.push('R0_above_1'); }
    else if (cls.R0 >= 0.9) { level = 'watch'; reasons.push('R0_near_1'); }
    if (cls.betaHopf !== null && cls.R0 >= 1) {
      const margin = cls.hopfMargin;
      if (margin !== null && margin <= 0) { level = 'alarm'; reasons.push('hopf_crossed'); }
      else if (margin !== null && margin < 0.25) { level = 'alarm'; reasons.push('hopf_near'); }
    }
    if (ewsObj) {
      if (ewsObj.varTrend > 0 && ewsObj.acTrend > 0 && ewsObj.n >= (ewsObj.window + 3)) {
        reasons.push('critical_slowing_down');
        if (level === 'ok') level = 'watch';
        else if (level === 'watch') level = 'alarm';
      }
    }
    if (state) {
      const thr = opts.healthyFloor !== undefined ? opts.healthyFloor : 0.3 * p.K;
      if (state[0] < thr) { reasons.push('healthy_low'); if (level !== 'alarm') level = 'alarm'; }
    }
    return { level: level, reasons: reasons, classification: cls };
  }

  return {
    REF, REF_X0, PARAM_KEYS, STATE_KEYS, DEFAULT_CAL,
    rhs, R0, betaCritical, sensitivity, jacobian, E0, Etrivial, endemic,
    eigenvalues, charPoly, polyRoots, maxRe, maxReAtEndemic, hopfBeta,
    integrate, classify, variance, lag1AC, linTrend, ews,
    estimateParameters, sensorsToState, alertStatus
  };
});
