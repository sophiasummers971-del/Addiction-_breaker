const OUT = require('path').join(__dirname, '..', 'output');
/**
 * run.js — full pipeline: simulate → train → predict → expose truth → report data.
 */
const fs = require('fs');
const { generateUserLog } = require('../src/simulate');
const { trainMarkov, predictNext, analyzeUser, hookScore } = require('../src/model');
const { recoveryMath, pressureTimeline, mirrorNarrative } = require('../src/truth');
const { trainMarkov2, predictNext2, secondOrderLift } = require('../src/markov2');

// ---------- 1. Generate cohort ----------
const users = [];
let allEvents = [];
for (let i = 0; i < 6; i++) {
  const id = `casual-${i + 1}`;
  const log = generateUserLog(id, 'casual', 30, 1000 + i * 77);
  users.push({ id, archetype: 'casual' });
  allEvents = allEvents.concat(log);
}
for (let i = 0; i < 6; i++) {
  const id = `pattern-${i + 1}`;
  const log = generateUserLog(id, 'addicted-pattern', 30, 5000 + i * 131);
  users.push({ id, archetype: 'addicted-pattern' });
  allEvents = allEvents.concat(log);
}
allEvents.sort((a, b) => a.ts - b.ts);
console.log(`Generated ${allEvents.length} events for ${users.length} users over 30 days.`);

// ---------- 2. Train Markov models ----------
const globalModel = trainMarkov(allEvents);
// contextual model: condition on (action + whether previous outcome was a loss)
const lossCtxModel = trainMarkov(allEvents, (cur, events, i) => {
  if (cur.action === 'bet') {
    const prev = events[i - 1];
    return prev && prev.userId === cur.userId && (prev.action === 'loss' || prev.action === 'near_miss')
      ? 'bet_after_loss' : 'bet_after_other';
  }
  return 'global';
});

// ---------- 2b. Second-order (backoff) model layer ----------
// keys on the (prev, current) pair and interpolates with the first-order model.
const m2global = trainMarkov2(allEvents);
const m2lossCtx = trainMarkov2(allEvents, (cur, events, i) => {
  if (cur.action === 'bet') {
    const prev = events[i - 1];
    return prev && prev.userId === cur.userId && (prev.action === 'loss' || prev.action === 'near_miss')
      ? 'bet_after_loss' : 'bet_after_other';
  }
  return 'global';
});

// ---------- 3. Predictions with explanations ----------
function explainBetPrediction(userId) {
  const afterLoss = predictNext(lossCtxModel, 'bet_after_loss', 'bet');
  const afterOther = predictNext(lossCtxModel, 'bet_after_other', 'bet');
  const gapAfterLoss = afterLoss.predictions.find(p => p.action === 'loss')?.p ?? 0;
  const gapAfterOther = afterOther.predictions.find(p => p.action === 'loss')?.p ?? 0;
  // second-order counterpart: remembers the loss that preceded the re-bet
  const so = predictNext2(m2lossCtx, lossCtxModel, 'bet_after_loss', 'loss', 'bet');
  const soLoss = so.predictions.find(p => p.action === 'loss')?.p ?? 0;
  return {
    userId,
    context: 'bet_after_loss',
    topNext: afterLoss.predictions,
    secondOrder: {
      pair: so.pair,
      topNext: so.predictions,
      confidence: so.confidence,
      confidenceLabel: so.confidenceLabel,
      backedOff: so.backedOff,
      pLoss: soLoss,
    },
    interpretation:
      `After a loss, the most likely next event is another bet followed by another loss ` +
      `(P(next = loss after re-bet) = ${(gapAfterLoss * 100).toFixed(1)}% vs ` +
      `${(gapAfterOther * 100).toFixed(1)}% in neutral contexts). ` +
      `Second-order (remembering the loss that preceded the re-bet) sharpens P(next = loss) to ` +
      `${(soLoss * 100).toFixed(1)}% [confidence ${so.confidence}, ${so.confidenceLabel}]. ` +
      `The game's RTP does not change after losses — the "due for a win" feeling is engineered.`,
  };
}

// ---------- 4. Per-user truth metrics ----------
const profiles = users.map(u => {
  const m = analyzeUser(allEvents, u.id);
  const rm = recoveryMath(m);
  const pt = pressureTimeline(allEvents, u.id);
  return {
    ...m, archetype: u.archetype, hookScore: hookScore(m),
    recoveryMath: rm, pressure: pt,
    mirror: mirrorNarrative(m, rm, pt),
  };
});

// sanity: pattern users should score higher
const avgScore = arch => {
  const g = profiles.filter(p => p.archetype === arch);
  return g.reduce((a, p) => a + p.hookScore, 0) / g.length;
};
console.log(`Avg hook score — casual: ${avgScore('casual').toFixed(1)}, pattern: ${avgScore('addicted-pattern').toFixed(1)}`);

// ---------- 5. Save report data ----------
const report = {
  generatedAt: new Date().toISOString(),
  cohort: users,
  predictions: profiles.map(p => explainBetPrediction(p.userId)),
  profiles,
};
fs.writeFileSync(OUT + '/report_data.json', JSON.stringify(report, null, 2));
fs.writeFileSync(OUT + '/events_sample.json', JSON.stringify(allEvents.slice(0, 200), null, 2));
console.log('Wrote report_data.json + events_sample.json');
const sample = profiles.find(p => p.archetype === 'addicted-pattern');
console.log(JSON.stringify({ ...sample, mirror: undefined }, null, 2));
console.log('\n================ SAMPLE MIRROR NARRATIVE ================\n');
console.log(sample.mirror);
// write one mirror text file per pattern user
for (const p of profiles.filter(p => p.archetype === 'addicted-pattern')) {
  fs.writeFileSync(`${OUT}/mirror_${p.userId}.txt`, p.mirror);
}
