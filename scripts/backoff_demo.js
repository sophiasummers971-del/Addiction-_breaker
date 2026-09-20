/**
 * backoff_demo.js — does VARIABLE-ORDER gating beat a FIXED interpolation weight?
 *
 * Three strategies, same held-out split, same smoothing (k=0.5):
 *   A  order-1 only                 (baseline)
 *   B  fixed-lambda interpolation   (markov2.js, lambda = 0.7)
 *   C  variable-order gated         (backoff.js, over a minSupport sweep)
 *
 * Run at two dependency strengths (0 = memoryless, 0.5 = real structure) so we
 * can see whether gating avoids the fixed-lambda model's losses when there is
 * no structure to exploit.
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'output');
const { generateUserLog, ACTIONS } = require('../src/simulate');
const { trainMarkov } = require('../src/model');
const { trainMarkov2, smoothed: sm } = require('../src/markov2');
const { trainBackoff, predictBackoff } = require('../src/backoff');

const K = 0.5, LAMBDA = 0.7, ctx = 'global';
const SUPPORTS = [5, 50, 250];

function cohort(p) {
  let all = [];
  for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`casual-${i + 1}`, 'casual', 30, 1000 + i * 77, { streakPersistence: p }));
  for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`pattern-${i + 1}`, 'addicted-pattern', 30, 5000 + i * 131, { streakPersistence: p }));
  return all.sort((a, b) => a.ts - b.ts);
}

function score(acc, d, target) {
  acc.ll += -Math.log(Math.max(d[target], 1e-12));
  for (const a of ACTIONS) acc.br += (d[a] - (a === target ? 1 : 0)) ** 2;
  const top = ACTIONS.reduce((b, a) => (d[a] > d[b] ? a : b), ACTIONS[0]);
  if (top === target) acc.acc++;
  acc.n++;
}
const norm = M => ({ ll: M.ll / M.n, br: M.br / M.n, acc: M.acc / M.n });

function evaluate(all, minSupport) {
  const users = [...new Set(all.map(e => e.userId))];
  const A = { ll: 0, br: 0, acc: 0, n: 0 }, B = { ll: 0, br: 0, acc: 0, n: 0 }, C = { ll: 0, br: 0, acc: 0, n: 0 };
  const orderUsed = { 2: 0, 1: 0, 0: 0 };
  for (const u of users) {
    const ev = all.filter(e => e.userId === u).sort((a, b) => a.ts - b.ts);
    const cut = Math.floor(ev.length * 0.8);
    const pool = [...all.filter(e => e.userId !== u), ...ev.slice(0, cut)];
    const m1 = trainMarkov(pool), m2 = trainMarkov2(pool), mb = trainBackoff(pool);
    const test = ev.slice(cut);
    for (let i = 2; i < test.length; i++) {
      const pv = test[i - 2], cu = test[i - 1], nx = test[i];
      if (pv.sessionId !== cu.sessionId || cu.sessionId !== nx.sessionId) continue;
      const target = nx.action;

      const dA = sm(m1[ctx]?.[cu.action], K).dist;
      const p1 = sm(m1[ctx]?.[cu.action], K).dist;
      const p2 = sm(m2[ctx]?.[`${pv.action}>${cu.action}`], K).dist;
      const dB = {}; let s = 0;
      for (const a of ACTIONS) { dB[a] = LAMBDA * p2[a] + (1 - LAMBDA) * p1[a]; s += dB[a]; }
      for (const a of ACTIONS) dB[a] /= s;

      const bp = predictBackoff(mb, ctx, pv.action, cu.action, { minSupport, k: K });
      const dC = bp.dist;                       // FULL distribution — correct scoring
      orderUsed[bp.order]++;

      score(A, dA, target); score(B, dB, target); score(C, dC, target);
    }
  }
  return { A: norm(A), B: norm(B), C: norm(C), orderUsed, n: A.n };
}

const rows = [];
console.log('════════ VARIABLE-ORDER BACKOFF vs FIXED LAMBDA ════════');
console.log('(k = 0.5 · B uses a fixed lambda = 0.7 · C gates the pair at minSupport)\n');
for (const persist of [0, 0.5]) {
  const all = cohort(persist);
  console.log(`═══ streakPersistence = ${persist} ${persist === 0 ? '(memoryless — no structure to find)' : '(real 2nd-order structure)'} ═══`);
  console.log('  minSup  strategy            log-loss    Brier      top-1     order2/1/0');
  const r0 = evaluate(all, SUPPORTS[0]);
  console.log(`  --      A order-1 only      ${r0.A.ll.toFixed(4)}   ${r0.A.br.toFixed(4)}   ${(r0.A.acc * 100).toFixed(1)}%`);
  console.log(`  --      B fixed lambda      ${r0.B.ll.toFixed(4)}   ${r0.B.br.toFixed(4)}   ${(r0.B.acc * 100).toFixed(1)}%`);
  for (const ms of SUPPORTS) {
    const r = evaluate(all, ms);
    const o = r.orderUsed;
    console.log(`  ${String(ms).padEnd(7)} C variable-order    ${r.C.ll.toFixed(4)}   ${r.C.br.toFixed(4)}   ${(r.C.acc * 100).toFixed(1)}%    ${o[2]}/${o[1]}/${o[0]}`);
    rows.push({ persist, minSupport: ms, baseline: r.A, fixedLambda: r.B, variableOrder: r.C, orderUsed: o, n: r.n });
  }
  const best = rows.filter(x => x.persist === persist).reduce((a, b) => (b.variableOrder.ll < a.variableOrder.ll ? b : a));
  console.log(`  → best C (log-loss): minSupport=${best.minSupport} at ${best.variableOrder.ll.toFixed(4)}  |  A=${r0.A.ll.toFixed(4)}  B=${r0.B.ll.toFixed(4)}\n`);
}
fs.writeFileSync(path.join(OUT, 'backoff_results.json'), JSON.stringify(rows, null, 2));
console.log('Wrote output/backoff_results.json');
