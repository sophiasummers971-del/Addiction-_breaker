/**
 * backoff.js — VARIABLE-ORDER Markov with confidence-gated backoff.
 *
 * WHY THIS EXISTS:
 * markov2.js interpolates with a FIXED weight (lambda). The dependency sweep
 * (docs/FINDINGS.md §7) showed that below ~0.4 real structure that fixed weight
 * HURTS — it chases pair-level noise and loses to plain first-order.
 *
 * A variable-order model fixes this properly: only trust the pair when the pair
 * has ENOUGH SUPPORT to be worth trusting, otherwise fall back to a lower order.
 *
 *   order 2  if pair support >= minSupport
 *   order 1  else if (cur) has any support
 *   order 0  else (unconditional marginal)
 *
 * The chosen order is REPORTED on every prediction, so the caller always knows
 * how much evidence sits behind the number.
 */
const ACTIONS = ['login', 'deposit', 'bet', 'win', 'loss', 'near_miss', 'withdraw', 'logout'];
const V = ACTIONS.length;

const sum = row => (row ? Object.values(row).reduce((a, b) => a + b, 0) : 0);

/** Add-k Laplace smoothing over the action vocabulary — no probability is ever 0. */
function smoothed(row, k = 0.5) {
  const total = sum(row);
  const denom = total + k * V;
  const dist = {};
  for (const a of ACTIONS) dist[a] = ((row?.[a] || 0) + k) / denom;
  return { dist, support: total };
}

/** Train all three orders at once, keyed by the same context function. */
function trainBackoff(events, contextFn = null) {
  const o2 = {}, o1 = {}, o0 = {};
  for (let i = 1; i < events.length - 1; i++) {
    const prev = events[i - 1], cur = events[i], nxt = events[i + 1];
    if (prev.userId !== cur.userId || cur.userId !== nxt.userId) continue; // same user only
    const ctx = contextFn ? contextFn(cur, events, i) : 'global';
    const k2 = `${prev.action}>${cur.action}`;
    (o2[ctx] ??= {}); (o2[ctx][k2] ??= {}); o2[ctx][k2][nxt.action] = (o2[ctx][k2][nxt.action] || 0) + 1;
    (o1[ctx] ??= {}); (o1[ctx][cur.action] ??= {}); o1[ctx][cur.action][nxt.action] = (o1[ctx][cur.action][nxt.action] || 0) + 1;
    (o0[ctx] ??= {}); o0[ctx][nxt.action] = (o0[ctx][nxt.action] || 0) + 1;
  }
  return { o2, o1, o0 };
}

/**
 * Predict with confidence-gated backoff.
 * Returns the chosen `order` explicitly, plus the support behind it.
 */
function predictBackoff(model, ctx, prev, cur, opts = {}) {
  const minSupport = opts.minSupport ?? 5;
  const k = opts.k ?? 0.5;
  const topN = opts.topN ?? 3;

  const pairRow = prev ? model.o2?.[ctx]?.[`${prev}>${cur}`] : null;
  const pairN = sum(pairRow);
  const o1row = model.o1?.[ctx]?.[cur];
  const o1N = sum(o1row);

  let order, dist, support;
  if (pairN >= minSupport) { order = 2; ({ dist, support } = smoothed(pairRow, k)); }
  else if (o1N > 0) { order = 1; ({ dist, support } = smoothed(o1row, k)); }
  else { order = 0; ({ dist, support } = smoothed(model.o0?.[ctx], k)); }

  const predictions = Object.entries(dist)
    .map(([action, p]) => ({ action, p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, topN);

  const margin = predictions.length > 1 ? predictions[0].p - predictions[1].p : predictions[0].p;
  const confidence = Math.round(100 * (support / (support + 5)) * Math.min(1, margin / 0.4));
  const label = order === 2
    ? (confidence >= 60 ? 'high (pair)' : 'moderate (pair)')
    : order === 1 ? 'first-order fallback' : 'marginal fallback';

  return {
    ctx, order, pairSupport: pairN, usedSupport: support,
    // `dist` is the FULL distribution over every action — required for correct
    // held-out log-loss / Brier scoring. `predictions` is the top-N view for display.
    dist, predictions,
    confidence, confidenceLabel: label,
  };
}

module.exports = { trainBackoff, predictBackoff, smoothed, ACTIONS, sum };
