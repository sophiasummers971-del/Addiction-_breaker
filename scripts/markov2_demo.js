const OUT = require('path').join(__dirname, '..', 'output');
/**
 * markov2_demo.js — proves the second-order upgrade on the real simulated cohort.
 * Shows: (1) the loss>bet lift over first-order, (2) backoff on unseen pairs,
 * (3) confidence labelling, (4) an honest held-out accuracy comparison 1st vs 2nd order.
 */
const fs = require('fs');
const { generateUserLog } = require('../src/simulate');
const { trainMarkov, predictNext } = require('../src/model');
const { trainMarkov2, predictNext2, secondOrderLift } = require('../src/markov2');

// ---- same cohort as run.js ----
let allEvents = [];
for (let i = 0; i < 6; i++) allEvents = allEvents.concat(generateUserLog(`casual-${i + 1}`, 'casual', 30, 1000 + i * 77));
for (let i = 0; i < 6; i++) allEvents = allEvents.concat(generateUserLog(`pattern-${i + 1}`, 'addicted-pattern', 30, 5000 + i * 131));
allEvents.sort((a, b) => a.ts - b.ts);

const m1 = trainMarkov(allEvents);
const m2 = trainMarkov2(allEvents);

console.log('══════════ SECOND-ORDER MARKOV — RESULTS ══════════');
console.log(`events: ${allEvents.length}\n`);

// === 1. The lift: does remembering the loss sharpen next-loss prediction? ===
const lift = secondOrderLift(m2, m1, 'global');
console.log('[ 1. Second-order lift — P(next = loss) after a (loss → bet) pair ]');
console.log(`  1st-order  P(loss | bet)        = ${(lift.pLossFirst * 100).toFixed(1)}%`);
console.log(`  2nd-order  P(loss | loss,bet)   = ${(lift.pLossPair * 100).toFixed(1)}%`);
console.log(`  lift                            = ${lift.lift?.toFixed(2)}x  ${lift.lift > 1 ? '(pair carries real signal)' : ''}\n`);

// === 2. Full prediction with backoff + confidence ===
console.log('[ 2. Prediction after (loss → bet), with interpolation λ=0.7 ]');
const pred = predictNext2(m2, m1, 'global', 'loss', 'bet');
for (const p of pred.predictions) {
  console.log(`  ${p.action.padEnd(10)} blended=${(p.p * 100).toFixed(1)}%  (2nd=${(p.p2 * 100).toFixed(1)}%  1st=${(p.p1 * 100).toFixed(1)}%)`);
}
console.log(`  support: pair=${pred.support.pair}, first-order=${pred.support.firstOrder}`);
console.log(`  confidence=${pred.confidence} [${pred.confidenceLabel}]\n`);

// === 3. Backoff demonstration on an unseen pair ===
console.log('[ 3. Backoff on a sparse/unseen pair — (withdraw → login) ]');
const sparse = predictNext2(m2, m1, 'global', 'withdraw', 'login');
console.log(`  pair support = ${sparse.support.pair} | backedOff = ${sparse.backedOff}`);
for (const p of sparse.predictions) console.log(`  ${p.action.padEnd(10)} blended=${(p.p * 100).toFixed(1)}%`);
console.log(`  confidence=${sparse.confidence} [${sparse.confidenceLabel}]  <- thin data is labelled, not trusted\n`);

// === 4. Held-out accuracy: 1st vs 2nd order (leave-last-session-out per user) ===
console.log('[ 4. Held-out next-action accuracy — 1st vs 2nd order ]');
const users = [...new Set(allEvents.map(e => e.userId))];
let c1 = 0, c2 = 0, n = 0;
for (const u of users) {
  const ev = allEvents.filter(e => e.userId === u).sort((a, b) => a.ts - b.ts);
  const cut = Math.floor(ev.length * 0.8);
  const train = ev.slice(0, cut), test = ev.slice(cut);
  // retrain per-split on the OTHER users + this user's train portion
  const others = allEvents.filter(e => e.userId !== u);
  const m1t = trainMarkov([...others, ...train]);
  const m2t = trainMarkov2([...others, ...train]);
  for (let i = 1; i < test.length; i++) {
    const prev = test[i - 1], cur = test[i - 1], nxt = test[i];
    if (!nxt) break;
    const p1 = predictNext(m1t, 'global', cur.action);
    const p2 = predictNext2(m2t, m1t, 'global', prev.action, cur.action);
    if (p1.predictions[0]?.action === nxt.action) c1++;
    if (p2.predictions[0]?.action === nxt.action) c2++;
    n++;
  }
}
console.log(`  held-out transitions: ${n}`);
console.log(`  1st-order top-1 accuracy: ${(100 * c1 / n).toFixed(1)}%`);
console.log(`  2nd-order top-1 accuracy: ${(100 * c2 / n).toFixed(1)}%`);
console.log(`  delta: ${((100 * c2 / n) - (100 * c1 / n)).toFixed(1)} points\n`);

// persist the comparison
const out = { lift, sample: pred, sparse, heldOut: { n, acc1: 100 * c1 / n, acc2: 100 * c2 / n } };
fs.writeFileSync(OUT + '/markov2_results.json', JSON.stringify(out, null, 2));
console.log('Wrote markov2_results.json');
