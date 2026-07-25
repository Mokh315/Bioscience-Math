const BSM = require('../js/model.js');
const P = BSM.REF;
let fails = 0;
function chk(name, got, want, tol) {
  tol = tol === undefined ? 1e-3 : tol;
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' got=' + (typeof got === 'number' ? got.toFixed(6) : got) + ' want=' + want);
}

chk('R0', BSM.R0(P), 3.857142857, 1e-6);
chk('betaCritical', BSM.betaCritical(P), 0.038888889, 1e-8);
chk('maxRe J(E0)', BSM.maxRe(BSM.jacobian(BSM.E0(P), P)), 0.2024129609, 1e-6);

const E = BSM.endemic(P);
console.log('E* =', E.map(v => v.toFixed(4)).join(', '));
const want = [2.3225, 2.2748, 1.3649, 4.0947, 1.6589];
E.forEach((v, i) => chk('E*[' + i + ']', v, want[i], 1e-3));
const res = BSM.rhs(E, P).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
chk('residual', res, 0, 1e-9);

const ev = BSM.eigenvalues(BSM.jacobian(E, P)).sort((a, b) => b.re - a.re);
console.log('eig(E*) =', ev.map(e => e.re.toFixed(4) + (e.im >= 0 ? '+' : '-') + Math.abs(e.im).toFixed(4) + 'i').join(', '));
chk('maxRe E*', ev[0].re, -0.0132, 1e-3);
chk('Im pair', Math.abs(ev[0].im), 0.2414, 1e-3);
chk('eig5', ev[4].re, -0.7591, 1e-3);

const bh = BSM.hopfBeta(P);
chk('beta_H', bh, 0.177122, 1e-4);

const sim = BSM.integrate([9, 1, 0.2, 0.1, 0.5], P, 3000, { nOut: 500 });
console.log('final =', sim.final.map(v => v.toFixed(4)).join(', '));
sim.final.forEach((v, i) => chk('sim final[' + i + ']', v, want[i], 2e-2));

// limit cycle
const Q = Object.assign({}, P, { beta: 0.22 });
const s2 = BSM.integrate([9, 1, 0.2, 0.1, 0.5], Q, 4000, { nOut: 4000 });
const tail = s2.y[0].slice(3000);
console.log('beta=0.22 H range on tail:', Math.min(...tail).toFixed(3), Math.max(...tail).toFixed(3), '(python: 0.172 .. 5.579)');
chk('LC Hmin', Math.min(...tail), 0.172, 0.06);
chk('LC Hmax', Math.max(...tail), 5.579, 0.08);

const cls = BSM.classify(Q);
console.log('regime at beta=0.22:', cls.regime, '(expect oscillatory)');
if (cls.regime !== 'oscillatory') fails++;
const cls2 = BSM.classify(Object.assign({}, P, { beta: 0.02 }));
console.log('regime at beta=0.02:', cls2.regime, '(expect free)');
if (cls2.regime !== 'free') fails++;
console.log('regime at reference:', BSM.classify(P).regime, '(expect endemic)');

// parameter estimation round-trip from clean simulated data
const s3 = BSM.integrate([9, 1, 0.2, 0.1, 0.5], P, 60, { nOut: 121 });
const log = s3.t.map((t, i) => ({ t: t, x: [s3.y[0][i], s3.y[1][i], s3.y[2][i], s3.y[3][i], s3.y[4][i]] }));
const est = BSM.estimateParameters(log, BSM.REF);
console.log('estimated:', Object.keys(est.params).map(k => k + '=' + est.params[k].toFixed(3)).join(' '));
['a', 'beta', 'mu', 'delta', 'lambda', 'theta', 'sigma', 'rho'].forEach(k => chk('est ' + k, est.params[k], P[k], 0.02));
chk('est R0', BSM.R0(est.params), BSM.R0(P), 0.15);

// sensors
const st = BSM.sensorsToState({ temp: 25, hum: 60, opt: 90, ph: 7.0, flow: 6 });
console.log('sensors (benign) ->', st.join(', '));
const st2 = BSM.sensorsToState({ temp: 42, hum: 40, opt: 30, ph: 6.0, flow: 1 });
console.log('sensors (stressed) ->', st2.join(', '));
if (!(st[0] > st2[0])) { fails++; console.log('FAIL sensor monotonicity'); }

console.log(fails === 0 ? '\nALL TESTS PASSED' : '\n' + fails + ' FAILURES');
process.exit(fails ? 1 : 0);
