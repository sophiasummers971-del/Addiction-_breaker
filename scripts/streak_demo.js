const OUT = require('path').join(__dirname, '..', 'output');
/**
 * streak_demo.js — proves the 2nd-order model earns its keep when the DATA
 * genuinely carries a 2nd-order dependency (streak persistence).
 *
 * Frozen for attribution: same seeds, same sample size, same smoothing (k),
 * same interpolation (lambda), same train/test split. The ONLY thing that
 * differs between the two models is ORDER.
 *
 * NOTE ON STRUCTURE: the event stream is bet -> outcome -> bet -> outcome,
 * so two outcomes are NEVER directly adjacent. Streak persistence therefore
 * lives in the OUTCOME SEQUENCE (one entry per bet), which is what we measure
 * in section 2.
 *
 * Step 1  generate with streakPersistence > 0
 * Step 2  realized outcome-sequence conditionals -> proves P(loss|prev loss) is raised
 * Step 3  per-state predicted P(loss): 1st vs 2nd vs empirical (only states with data)
 * Step 4  held-out metrics: log-loss, Brier, top-1, vs a marginal baseline
 */
const fs = require('fs');
const { generateUserLog, ACTIONS } = require('../src/simulate');
const { trainMarkov } = require('../src/model');
const { trainMarkov2, smoothed } = require('../src/markov2');

const PERSIST = 0.35;   // strong streak persistence
const K = 0.5;          // smoothing constant — held FIXED across both models
const LAMBDA = 0.7;     // 2nd-order weight
const ctx = 'global';

/* ---- 1. cohort WITH streak persistence (same seeds as run.js) ---- */
let all = [];
for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`casual-${i + 1}`, 'casual', 30, 1000 + i * 77, { streakPersistence: PERSIST }));
for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`pattern-${i + 1}`, 'addicted-pattern', 30, 5000 + i * 131, { streakPersistence: PERSIST }));
all.sort((a, b) => a.ts - b.ts);
console.log('events:', all.length, '| streakPersistence =', PERSIST, '| k =', K, '| lambda =', LAMBDA);

/* ---- 2. outcome-sequence conditionals (the dependency lives here) ---- */
const outcomeSeq = [];
for (const e of all) if (['win', 'loss', 'near_miss'].includes(e.action)) outcomeSeq.push(e);
let aLT = 0, aLL = 0, aWT = 0, aWL = 0, aNT = 0, aNL = 0, tot = 0, lTot = 0;
for (let i = 1; i < outcomeSeq.length; i++) {
  const p = outcomeSeq[i - 1], c = outcomeSeq[i];
  if (p.userId !== c.userId || p.sessionId !== c.sessionId) continue; // within-session only
  tot++; if (c.action === 'loss') lTot++;
  if (p.action === 'loss') { aLT++; if (c.action === 'loss') aLL++; }
  if (p.action === 'win') { aWT++; if (c.action === 'loss') aWL++; }
  if (p.action === 'near_miss') { aNT++; if (c.action === 'loss') aNL++; }
}
const P = (a, b) => (b ? a / b : 0);
const empAfterLoss = P(aLL, aLT), empAfterWin = P(aWL, aWT), empAfterNM = P(aNL, aNT), empOverall = P(lTot, tot);
console.log('\n[ REALIZED outcome-sequence conditionals — proof the dependency is in the data ]');
console.log(`  P(loss | prev outcome = loss)      = ${(empAfterLoss * 100).toFixed(1)}%   (n=${aLT})`);
console.log(`  P(loss | prev outcome = win)       = ${(empAfterWin * 100).toFixed(1)}%   (n=${aWT})`);
console.log(`  P(loss | prev outcome = near_miss) = ${(empAfterNM * 100).toFixed(1)}%   (n=${aNT})`);
console.log(`  P(loss) overall                    = ${(empOverall * 100).toFixed(1)}%   (n=${tot})`);
console.log(`  RAISED by                          = ${((empAfterLoss - empAfterWin) * 100).toFixed(1)} points after a loss`);

/* ---- full-data models ---- */
const m1 = trainMarkov(all);
const m2 = trainMarkov2(all);
const dist1 = cur => smoothed(m1[ctx]?.[cur], K).dist;
const dist2 = (prev, cur) => {
  const p2 = smoothed(m2[ctx]?.[`${prev}>${cur}`], K).dist;
  const p1 = smoothed(m1[ctx]?.[cur], K).dist;
  const out = {}; let s = 0;
  for (const a of ACTIONS) { out[a] = LAMBDA * p2[a] + (1 - LAMBDA) * p1[a]; s += out[a]; }
  for (const a of ACTIONS) out[a] /= s;
  return out;
};

/* ---- 3. per-state predicted P(next = loss) — only states that occur ---- */
const pairTot = {}, pairLoss = {};
for (let i = 2; i < all.length; i++) {
  const pv = all[i - 2], cu = all[i - 1], nx = all[i];
  if (pv.userId !== cu.userId || cu.userId !== nx.userId) continue;
  if (pv.sessionId !== cu.sessionId || cu.sessionId !== nx.sessionId) continue;
  const key = `${pv.action}>${cu.action}`;
  pairTot[key] = (pairTot[key] || 0) + 1;
  if (nx.action === 'loss') pairLoss[key] = (pairLoss[key] || 0) + 1;
}
// states where the NEXT action is predicted: (prevOutcome > bet) -> next outcome
const STATES = ['loss>bet', 'near_miss>bet', 'win>bet'];
console.log('\n[ Per-state predicted P(next = loss): 1st-order vs 2nd-order vs empirical ]');
console.log('  state              1st-order   2nd-order   empirical     n');
const stateRows = [];
for (const st of STATES) {
  const [pv, cu] = st.split('>');
  const d1 = dist1(cu)['loss'];
  const d2 = dist2(pv, cu)['loss'];
  const emp = P(pairLoss[st] || 0, pairTot[st] || 0);
  const n = pairTot[st] || 0;
  stateRows.push({ state: st, first: d1, second: d2, empirical: emp, n });
  console.log(`  ${st.padEnd(18)} ${(d1 * 100).toFixed(1).padStart(6)}%   ${(d2 * 100).toFixed(1).padStart(6)}%   ${(emp * 100).toFixed(1).padStart(7)}%   ${n}`);
}
const absErr1 = stateRows.reduce((a, r) => a + Math.abs(r.first - r.empirical), 0) / stateRows.length;
const absErr2 = stateRows.reduce((a, r) => a + Math.abs(r.second - r.empirical), 0) / stateRows.length;
console.log(`  mean |model - empirical| : 1st-order ${(absErr1 * 100).toFixed(2)} pts  |  2nd-order ${(absErr2 * 100).toFixed(2)} pts  -> gap ${((absErr1 - absErr2) * 100).toFixed(2)} pts (2nd closer)`);

/* ---- 4. held-out metrics, same split, order is the only difference ---- */
const users = [...new Set(all.map(e => e.userId))];
let M1 = { ll: 0, br: 0, acc: 0, n: 0 }, M2 = { ll: 0, br: 0, acc: 0, n: 0 }, MB = { ll: 0, br: 0, acc: 0, n: 0 };
for (const u of users) {
  const ev = all.filter(e => e.userId === u).sort((a, b) => a.ts - b.ts);
  const cut = Math.floor(ev.length * 0.8);
  const train = ev.slice(0, cut), test = ev.slice(cut);
  const pool = [...all.filter(e => e.userId !== u), ...train];
  const fm1 = trainMarkov(pool), fm2 = trainMarkov2(pool);
  const marg = {}; let mt = 0;
  for (const e of pool) { marg[e.action] = (marg[e.action] || 0) + 1; mt++; }
  for (const a of ACTIONS) marg[a] = (marg[a] || 0) / mt;

  for (let i = 2; i < test.length; i++) {
    const pv = test[i - 2], cu = test[i - 1], nx = test[i];
    if (pv.sessionId !== cu.sessionId || cu.sessionId !== nx.sessionId) continue;
    const d1 = smoothed(fm1[ctx]?.[cu.action], K).dist;
    const p2 = smoothed(fm2[ctx]?.[`${pv.action}>${cu.action}`], K).dist;
    const d2 = {}; let s = 0;
    for (const a of ACTIONS) { d2[a] = LAMBDA * p2[a] + (1 - LAMBDA) * d1[a]; s += d2[a]; }
    for (const a of ACTIONS) d2[a] /= s;
    for (const [M, d] of [[M1, d1], [M2, d2], [MB, marg]]) {
      const pr = Math.max(d[nx.action], 1e-12);
      M.ll += -Math.log(pr);
      for (const a of ACTIONS) M.br += (d[a] - (a === nx.action ? 1 : 0)) ** 2;
      const top = ACTIONS.reduce((best, a) => (d[a] > d[best] ? a : best), ACTIONS[0]);
      if (top === nx.action) M.acc++;
      M.n++;
    }
  }
}
const norm = M => ({ ll: M.ll / M.n, br: M.br / M.n, acc: M.acc / M.n });
const r1 = norm(M1), r2 = norm(M2), rb = norm(MB);
console.log('\n[ Held-out metrics — same split, same smoothing, order is the only difference ]');
console.log(`  held-out transitions: ${M1.n}`);
console.log('  model              log-loss    Brier      top-1');
console.log(`  baseline (marginal) ${rb.ll.toFixed(4)}   ${rb.br.toFixed(4)}   ${(rb.acc * 100).toFixed(1)}%`);
console.log(`  1st-order           ${r1.ll.toFixed(4)}   ${r1.br.toFixed(4)}   ${(r1.acc * 100).toFixed(1)}%`);
console.log(`  2nd-order           ${r2.ll.toFixed(4)}   ${r2.br.toFixed(4)}   ${(r2.acc * 100).toFixed(1)}%`);
console.log(`  DELTA (2nd - 1st)   ${(r2.ll - r1.ll).toFixed(4)}   ${(r2.br - r1.br).toFixed(4)}   ${((r2.acc - r1.acc) * 100).toFixed(1)} pts`);

fs.writeFileSync(OUT + '/streak_results.json', JSON.stringify({
  persist: PERSIST, k: K, lambda: LAMBDA,
  empirical: { afterLoss: empAfterLoss, afterWin: empAfterWin, afterNM: empAfterNM, overall: empOverall, n: { aLT, aWT, aNT, tot } },
  perState: stateRows, meanAbsErr: { first: absErr1, second: absErr2 },
  heldOut: { n: M1.n, baseline: rb, first: r1, second: r2 },
}, null, 2));
console.log('\nWrote streak_results.json');
