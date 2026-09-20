/**
 * markov2.js — SECOND-ORDER Markov upgrade, added as a backoff/interpolation
 * layer on top of the existing first-order model in model.js.
 *
 * WHY A LAYER, NOT A REPLACEMENT:
 *  A second-order chain keys on the PAIR (prevAction, currentAction) — e.g.
 *  (loss, bet) -> ? is sharper than (bet) -> ? because it remembers the loss.
 *  But pairs are SPARSE: many (prev,cur) combos appear 0–2 times in real logs.
 *  If we trust a pair-count of 1, we publish noise as certainty.
 *
 *  So every prediction is an INTERPOLATION:
 *      P(next | prev,cur) = λ·P2(next | prev,cur) + (1−λ)·P1(next | cur)
 *  where P1 is the first-order model. When the pair is unseen, P2 collapses
 *  toward uniform and the result naturally falls back on P1. We also add
 *  add-k (Laplace) smoothing so no probability is ever exactly 0, and we
 *  emit a CONFIDENCE score so low-support guesses are labelled as such.
 *
 * The first-order API (trainMarkov / predictNext) is untouched and still works.
 */

const ACTIONS = ['login', 'deposit', 'bet', 'win', 'loss', 'near_miss', 'withdraw', 'logout'];
const V = ACTIONS.length;

/** Build second-order counts: ctx -> "prev>cur" -> nextAction -> n. */
function trainMarkov2(events, contextFn = null) {
  const counts = {};
  for (let i = 1; i < events.length - 1; i++) {
    const prev = events[i - 1], cur = events[i], nxt = events[i + 1];
    if (prev.userId !== cur.userId || cur.userId !== nxt.userId) continue; // same user only
    const ctx = contextFn ? contextFn(cur, events, i) : 'global';
    const key = `${prev.action}>${cur.action}`;
    counts[ctx] ??= {};
    counts[ctx][key] ??= {};
    counts[ctx][key][nxt.action] = (counts[ctx][key][nxt.action] || 0) + 1;
  }
  return counts;
}

/** Add-k (Laplace) smoothing over the action vocabulary. Returns {action: p} + support. */
function smoothed(row, k) {
  const total = row ? Object.values(row).reduce((a, b) => a + b, 0) : 0;
  const denom = total + k * V;
  const dist = {};
  for (const a of ACTIONS) dist[a] = ((row?.[a] || 0) + k) / denom;
  return { dist, support: total };
}

/**
 * Predict next action with second-order + backoff to first-order.
 * @param m2  second-order counts (trainMarkov2)
 * @param m1  first-order counts (trainMarkov from model.js)
 * @param ctx context key
 * @param prev previous action (or null if none)
 * @param cur  current action
 * @param opts { lambda, k }  lambda = weight on the 2nd-order term (default .7), k = smoothing (default .5), topN
 */
function predictNext2(m2, m1, ctx, prev, cur, opts = {}) {
  const lambda = opts.lambda ?? 0.7;
  const k = opts.k ?? 0.5;
  const topN = opts.topN ?? 3;

  const p2row = prev ? m2?.[ctx]?.[`${prev}>${cur}`] : null;
  const p1row = m1?.[ctx]?.[cur];

  const { dist: p2, support: n2 } = smoothed(p2row, k);
  const { dist: p1, support: n1 } = smoothed(p1row, k);

  // Interpolate. If the pair was never seen (n2 === 0), its smoothed term is
  // essentially uniform, so the blend leans on the first-order signal.
  const blended = {};
  for (const a of ACTIONS) blended[a] = lambda * p2[a] + (1 - lambda) * p1[a];
  const sum = Object.values(blended).reduce((a, b) => a + b, 0);
  for (const a of ACTIONS) blended[a] /= sum;

  const predictions = Object.entries(blended)
    .map(([action, p]) => ({ action, p, p2: p2[action], p1: p1[action] }))
    .sort((a, b) => b.p - a.p)
    .slice(0, topN);

  // Confidence: driven by the pair's SUPPORT and the margin over the runner-up.
  // Low support => low confidence, no matter how peaked the distribution looks.
  const margin = predictions.length > 1 ? predictions[0].p - predictions[1].p : predictions[0].p;
  const supportFactor = n2 / (n2 + 5); // 0..1, saturates slowly
  const confidence = Math.round(100 * supportFactor * Math.min(1, margin / 0.4));

  return {
    ctx,
    pair: prev ? `${prev}>${cur}` : null,
    currentAction: cur,
    predictions,
    support: { pair: n2, firstOrder: n1 },
    backedOff: n2 === 0,
    confidence,
    confidenceLabel: confidence >= 60 ? 'high' : confidence >= 25 ? 'moderate' : 'low (thin data — treat as a hint)',
  };
}

/**
 * Demonstrate WHY second-order matters: compare the conditional probability of
 * the next "loss" given (loss,bet) vs given just (bet). The pair remembers the
 * loss; the first-order model cannot.
 */
function secondOrderLift(m2, m1, ctx = 'global') {
  const pairPred = predictNext2(m2, m1, ctx, 'loss', 'bet');
  const firstPred = predictNext2(m2, m1, ctx, null, 'bet', { lambda: 0 }); // lambda 0 => pure 1st order
  const pLossPair = pairPred.predictions.find(p => p.action === 'loss')?.p ?? 0;
  const pLossFirst = firstPred.predictions.find(p => p.action === 'loss')?.p ?? 0;
  return { pLossPair, pLossFirst, lift: pLossFirst ? pLossPair / pLossFirst : null };
}

module.exports = { trainMarkov2, predictNext2, secondOrderLift, smoothed };
