/**
 * sweep.js — dependency-strength sweep.
 *
 * Question: HOW MUCH genuine second-order structure has to exist before the
 * second-order upgrade pays off? This walks the generator's streakPersistence
 * from 0 (memoryless) to 0.5 (strong) and measures, at each step, both
 *   (a) how much conditional structure is really in the data, and
 *   (b) how much the 2nd-order model gains over the 1st-order model.
 *
 * Attribution-safe: seeds, cohort size, smoothing k and interpolation lambda
 * are HELD FIXED across every point. The only thing that changes is the true
 * dependency strength in the generator.
 */
const fs = require('fs');
const path = require('path');
const { generateUserLog, ACTIONS } = require('../src/simulate');
const { trainMarkov } = require('../src/model');
const { trainMarkov2, smoothed } = require('../src/markov2');

const OUT = path.join(__dirname, '..', 'output');
const K = 0.5, LAMBDA = 0.7, ctx = 'global';
const GRID = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

function cohort(p) {
  let all = [];
  for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`casual-${i + 1}`, 'casual', 30, 1000 + i * 77, { streakPersistence: p }));
  for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`pattern-${i + 1}`, 'addicted-pattern', 30, 5000 + i * 131, { streakPersistence: p }));
  return all.sort((a, b) => a.ts - b.ts);
}

/** Realized conditional spread in the outcome sequence — the ground truth of how much 2nd-order structure exists. */
function realizedSpread(all) {
  const seq = all.filter(e => ['win', 'loss', 'near_miss'].includes(e.action));
  let aLT = 0, aLL = 0, aWT = 0, aWL = 0;
  for (let i = 1; i < seq.length; i++) {
    const p = seq[i - 1], c = seq[i];
    if (p.userId !== c.userId || p.sessionId !== c.sessionId) continue;
    if (p.action === 'loss') { aLT++; if (c.action === 'loss') aLL++; }
    if (p.action === 'win') { aWT++; if (c.action === 'loss') aWL++; }
  }
  const pl = aLT ? aLL / aLT : 0, pw = aWT ? aWL / aWT : 0;
  return { pLossAfterLoss: pl, pLossAfterWin: pw, raised: (pl - pw) * 100, n: aLT + aWT };
}

/** Held-out comparison, same split for both models. */
function evalHeldOut(all) {
  const users = [...new Set(all.map(e => e.userId))];
  let M1 = { ll: 0, br: 0, acc: 0, n: 0 }, M2 = { ll: 0, br: 0, acc: 0, n: 0 };
  for (const u of users) {
    const ev = all.filter(e => e.userId === u).sort((a, b) => a.ts - b.ts);
    const cut = Math.floor(ev.length * 0.8);
    const train = ev.slice(0, cut), test = ev.slice(cut);
    const pool = [...all.filter(e => e.userId !== u), ...train];
    const fm1 = trainMarkov(pool), fm2 = trainMarkov2(pool);
    for (let i = 2; i < test.length; i++) {
      const pv = test[i - 2], cu = test[i - 1], nx = test[i];
      if (pv.sessionId !== cu.sessionId || cu.sessionId !== nx.sessionId) continue;
      const d1 = smoothed(fm1[ctx]?.[cu.action], K).dist;
      const p2 = smoothed(fm2[ctx]?.[`${pv.action}>${cu.action}`], K).dist;
      const d2 = {}; let s = 0;
      for (const a of ACTIONS) { d2[a] = LAMBDA * p2[a] + (1 - LAMBDA) * d1[a]; s += d2[a]; }
      for (const a of ACTIONS) d2[a] /= s;
      for (const [M, d] of [[M1, d1], [M2, d2]]) {
        M.ll += -Math.log(Math.max(d[nx.action], 1e-12));
        for (const a of ACTIONS) M.br += (d[a] - (a === nx.action ? 1 : 0)) ** 2;
        const top = ACTIONS.reduce((b, a) => (d[a] > d[b] ? a : b), ACTIONS[0]);
        if (top === nx.action) M.acc++;
        M.n++;
      }
    }
  }
  return {
    n: M1.n,
    first: { ll: M1.ll / M1.n, br: M1.br / M1.n, acc: M1.acc / M1.n },
    second: { ll: M2.ll / M2.n, br: M2.br / M2.n, acc: M2.acc / M2.n },
  };
}

const rows = [];
console.log('══════════ DEPENDENCY-STRENGTH SWEEP ══════════');
console.log('(k=0.5, lambda=0.7 fixed; only true dependency strength varies)\n');
console.log('persist  raised(pts)      n    logloss1  logloss2     dLL   Brier1  Brier2   dBrier   acc1    acc2    dAcc');
for (const p of GRID) {
  const all = cohort(p);
  const sp = realizedSpread(all);
  const ev = evalHeldOut(all);
  const dLL = ev.second.ll - ev.first.ll, dBR = ev.second.br - ev.first.br, dAcc = (ev.second.acc - ev.first.acc) * 100;
  rows.push({ persist: p, raised: sp.raised, pLossAfterLoss: sp.pLossAfterLoss, pLossAfterWin: sp.pLossAfterWin, n: ev.n, first: ev.first, second: ev.second, dLL, dBR, dAcc });
  console.log(
    String(p).padEnd(8) +
    sp.raised.toFixed(1).padStart(11) +
    String(ev.n).padStart(7) +
    ev.first.ll.toFixed(4).padStart(11) + ev.second.ll.toFixed(4).padStart(10) + dLL.toFixed(4).padStart(9) +
    ev.first.br.toFixed(4).padStart(9) + ev.second.br.toFixed(4).padStart(9) + dBR.toFixed(4).padStart(9) +
    (ev.first.acc * 100).toFixed(1).padStart(7) + '%' + (ev.second.acc * 100).toFixed(1).padStart(7) + '%' + dAcc.toFixed(1).padStart(8)
  );
}
fs.writeFileSync(path.join(OUT, 'sweep_results.json'), JSON.stringify(rows, null, 2));
console.log('\nWrote output/sweep_results.json');
