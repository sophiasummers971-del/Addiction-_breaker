/**
 * gate_demo.js — does VALIDATION-CHOSEN minSupport fix the gate problem?
 *
 * The gate sweep in docs/FINDINGS.md §8 showed a fixed minSupport cannot know
 * which regime it is in: it needs to be ~50 where structure exists and "never"
 * where it does not. This picks the gate by validation instead, with Infinity
 * (never use the pair) as a first-class candidate — so on structureless data
 * validation is free to collapse the model back to plain first-order.
 *
 * Split per user: 60% train / 20% validation / 20% test.
 * The gate is chosen on VALIDATION and then scored on untouched TEST data.
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'output');
const { generateUserLog } = require('../src/simulate');
const { trainBackoff, predictBackoff, selectMinSupport, ACTIONS } = require('../src/backoff');

const K = 0.5, ctx = 'global';
const MARGINS = [0, 0.001, 0.005];

function cohort(p) {
  let all = [];
  for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`casual-${i + 1}`, 'casual', 30, 1000 + i * 77, { streakPersistence: p }));
  for (let i = 0; i < 6; i++) all = all.concat(generateUserLog(`pattern-${i + 1}`, 'addicted-pattern', 30, 5000 + i * 131, { streakPersistence: p }));
  return all.sort((a, b) => a.ts - b.ts);
}
function transitions(ev) {
  const seq = [];
  for (let i = 2; i < ev.length; i++) {
    const pv = ev[i - 2], cu = ev[i - 1], nx = ev[i];
    if (pv.sessionId !== cu.sessionId || cu.sessionId !== nx.sessionId) continue;
    seq.push({ prev: pv.action, cur: cu.action, target: nx.action });
  }
  return seq;
}
function score(model, seq, minSupport) {
  let ll = 0;
  for (const t of seq) ll += -Math.log(Math.max(predictBackoff(model, ctx, t.prev, t.cur, { minSupport, k: K }).dist[t.target], 1e-12));
  return seq.length ? ll / seq.length : NaN;
}

const rows = [];
console.log('═══════ VALIDATION-CHOSEN GATE (with margin) vs ORDER-1 BASELINE ═══════\n');
for (const MARGIN of MARGINS) {
console.log(`########## margin = ${MARGIN} ##########`);
for (const persist of [0, 0.2, 0.5]) {
  const all = cohort(persist);
  const users = [...new Set(all.map(e => e.userId))];
  let chosen = [], gateLL = 0, baseLL = 0, nT = 0, orderUsed = { 2: 0, 1: 0, 0: 0 };
  for (const u of users) {
    const ev = all.filter(e => e.userId === u).sort((a, b) => a.ts - b.ts);
    const a = Math.floor(ev.length * 0.6), b = Math.floor(ev.length * 0.8);
    const train = ev.slice(0, a), val = ev.slice(a, b), test = ev.slice(b);
    const pool = [...all.filter(e => e.userId !== u), ...train];
    const model = trainBackoff(pool);
    const sel = selectMinSupport(model, ctx, transitions(val), { k: K, margin: MARGIN });
    chosen.push(sel.minSupport);
    // score the CHOSEN gate on untouched test data
    for (const t of transitions(test)) {
      gateLL += -Math.log(Math.max(predictBackoff(model, ctx, t.prev, t.cur, { minSupport: sel.minSupport, k: K }).dist[t.target], 1e-12));
      baseLL += -Math.log(Math.max(predictBackoff(model, ctx, t.prev, t.cur, { minSupport: Infinity, k: K }).dist[t.target], 1e-12));
      const o = predictBackoff(model, ctx, t.prev, t.cur, { minSupport: sel.minSupport, k: K }).order;
      orderUsed[o]++; nT++;
    }
  }
  const gate = gateLL / nT, base = baseLL / nT;
  const counts = chosen.reduce((m, c) => (m[c === Infinity ? 'never' : c] = (m[c === Infinity ? 'never' : c] || 0) + 1, m), {});
  console.log(`--- persist = ${persist} ---`);
  console.log(`  gate chosen per user: ${JSON.stringify(counts)}`);
  console.log(`  TEST log-loss  chosen-gate = ${gate.toFixed(4)}   baseline(order-1) = ${base.toFixed(4)}   Δ = ${(gate - base >= 0 ? '+' : '')}${(gate - base).toFixed(4)}`);
  console.log(`  order used on test: pair=${orderUsed[2]} first=${orderUsed[1]} marginal=${orderUsed[0]}  (n=${nT})\n`);
  rows.push({ margin: MARGIN, persist, chosen, gateTestLogLoss: gate, baselineTestLogLoss: base, delta: gate - base, orderUsed, n: nT });
}
}
fs.writeFileSync(path.join(OUT, 'gate_results.json'), JSON.stringify(rows, null, 2));
console.log('Wrote output/gate_results.json');
